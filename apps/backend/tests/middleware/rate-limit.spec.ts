import { env } from 'cloudflare:workers';
import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BAN_DURATION_MS,
  STRIKE_DEBOUNCE_MS,
  banKey,
  getBan,
  recordStrike,
  type BanRecord,
} from '../../src/rate-limit/bans';

const LIMIT = 100;
const LIMITER_PERIOD_MS = 60 * 1000;
const WINDOW_HEADROOM_MS = 10 * 1000;

function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `198.${octet()}.${octet()}.${octet()}`;
}

function hit(ip?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (ip) headers['cf-connecting-ip'] = ip;
  return SELF.fetch('http://example.com/health', { headers });
}

async function hitMany(count: number, ip?: string): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await hit(ip);
    statuses.push(res.status);
    await res.body?.cancel();
  }
  return statuses;
}

async function seedBan(ip: string, record: BanRecord): Promise<void> {
  await env.CACHE.put(banKey(ip), JSON.stringify(record));
}

// miniflare's local limiter counts in fixed windows aligned to the wall clock, so LIMIT + 1
// requests straddling a minute boundary never trip it. Start each test with enough headroom.
async function waitForWindowHeadroom(): Promise<void> {
  const remaining = LIMITER_PERIOD_MS - (Date.now() % LIMITER_PERIOD_MS);
  if (remaining < WINDOW_HEADROOM_MS) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

describe('rateLimit middleware', () => {
  beforeEach(waitForWindowHeadroom, WINDOW_HEADROOM_MS + 5000);

  it('does not limit requests without cf-connecting-ip', async () => {
    const statuses = await hitMany(LIMIT + 1);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it.each(['127.0.0.1', '::1'])('does not limit loopback %s', async (ip) => {
    const statuses = await hitMany(LIMIT + 1, ip);
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(await getBan(env.CACHE, ip)).toBeNull();
  });

  it('returns 429 on the 101st request and records the first strike', async () => {
    const ip = randomIp();
    const statuses = await hitMany(LIMIT, ip);
    expect(statuses.every((s) => s === 200)).toBe(true);

    const before = Date.now();
    const res = await hit(ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(BAN_DURATION_MS / 1000 - 60);
    expect(retryAfter).toBeLessThanOrEqual(BAN_DURATION_MS / 1000);

    const ban = await getBan(env.CACHE, ip);
    expect(ban).toMatchObject({ strikes: 1, permanent: false });
    expect(ban?.bannedUntil).toBeGreaterThanOrEqual(before + BAN_DURATION_MS - 1000);
    expect(ban?.bannedUntil).toBeLessThanOrEqual(Date.now() + BAN_DURATION_MS);
  });

  it('rejects an actively banned IP without consuming limiter quota or adding strikes', async () => {
    const ip = randomIp();
    const now = Date.now();
    const seeded: BanRecord = {
      strikes: 2,
      lastStrikeAt: now - 2 * STRIKE_DEBOUNCE_MS,
      bannedUntil: now + 60 * 60 * 1000,
      permanent: false,
    };
    await seedBan(ip, seeded);

    const first = await hit(ip);
    expect(first.status).toBe(429);
    expect(await first.json()).toEqual({ error: 'rate_limited' });
    expect(Number(first.headers.get('Retry-After'))).toBeGreaterThan(0);

    const statuses = await hitMany(LIMIT + 1, ip);
    expect(statuses.every((s) => s === 429)).toBe(true);
    expect(await getBan(env.CACHE, ip)).toEqual(seeded);

    await env.CACHE.delete(banKey(ip));
    const afterUnban = await hitMany(LIMIT, ip);
    expect(afterUnban.every((s) => s === 200)).toBe(true);
  });

  it('permanently bans on the fourth strike', async () => {
    const ip = randomIp();
    const now = Date.now();
    await seedBan(ip, {
      strikes: 3,
      lastStrikeAt: now - BAN_DURATION_MS - 1000,
      bannedUntil: now - 1000,
      permanent: false,
    });

    const statuses = await hitMany(LIMIT, ip);
    expect(statuses.every((s) => s === 200)).toBe(true);

    const tripped = await hit(ip);
    expect(tripped.status).toBe(403);
    expect(await tripped.json()).toEqual({ error: 'ip_banned' });
    expect(await getBan(env.CACHE, ip)).toMatchObject({
      strikes: 4,
      permanent: true,
      bannedUntil: null,
    });

    const after = await hit(ip);
    expect(after.status).toBe(403);
    expect(await after.json()).toEqual({ error: 'ip_banned' });
  });

  it('does not double-count a strike within the debounce window', async () => {
    const ip = randomIp();
    const seeded: BanRecord = {
      strikes: 1,
      lastStrikeAt: Date.now(),
      bannedUntil: null,
      permanent: false,
    };
    await seedBan(ip, seeded);

    const statuses = await hitMany(LIMIT, ip);
    expect(statuses.every((s) => s === 200)).toBe(true);

    const tripped = await hit(ip);
    expect(tripped.status).toBe(429);
    expect(await tripped.json()).toEqual({ error: 'rate_limited' });
    expect(await getBan(env.CACHE, ip)).toEqual(seeded);
  });
});

describe('recordStrike', () => {
  it('bans for 24h on strikes 1-3 and permanently on strike 4', async () => {
    const ip = randomIp();
    let now = 1_000_000;

    for (const strikes of [1, 2, 3]) {
      const record = await recordStrike(env.CACHE, ip, now);
      expect(record).toEqual({
        strikes,
        lastStrikeAt: now,
        bannedUntil: now + BAN_DURATION_MS,
        permanent: false,
      });
      expect(await getBan(env.CACHE, ip)).toEqual(record);
      now += BAN_DURATION_MS + 1;
    }

    const fourth = await recordStrike(env.CACHE, ip, now);
    expect(fourth).toEqual({ strikes: 4, lastStrikeAt: now, bannedUntil: null, permanent: true });
    expect(await getBan(env.CACHE, ip)).toEqual(fourth);
  });

  it('returns the existing record unchanged within the debounce window', async () => {
    const ip = randomIp();
    const first = await recordStrike(env.CACHE, ip, 1_000_000);

    const repeated = await recordStrike(env.CACHE, ip, 1_000_000 + STRIKE_DEBOUNCE_MS - 1);
    expect(repeated).toEqual(first);
    expect(await getBan(env.CACHE, ip)).toEqual(first);

    const next = await recordStrike(env.CACHE, ip, 1_000_000 + STRIKE_DEBOUNCE_MS);
    expect(next.strikes).toBe(2);
  });
});
