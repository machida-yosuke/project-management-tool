import type { KVNamespace } from '@cloudflare/workers-types';

export interface BanRecord {
  strikes: number;
  lastStrikeAt: number;
  bannedUntil: number | null;
  permanent: boolean;
}

export const MAX_STRIKES_BEFORE_PERMANENT = 3;
export const BAN_DURATION_MS = 24 * 60 * 60 * 1000;
export const STRIKE_DEBOUNCE_MS = 60 * 1000;

export function banKey(ip: string): string {
  return `ratelimit:ban:${ip}`;
}

export async function getBan(kv: KVNamespace, ip: string): Promise<BanRecord | null> {
  const raw = await kv.get(banKey(ip));
  if (!raw) return null;
  return JSON.parse(raw) as BanRecord;
}

export async function recordStrike(kv: KVNamespace, ip: string, now: number): Promise<BanRecord> {
  const existing = await getBan(kv, ip);
  // KV is eventually consistent, so requests right after a strike may miss the ban and trip
  // the limiter again; treat those as the same strike.
  if (existing && now - existing.lastStrikeAt < STRIKE_DEBOUNCE_MS) {
    return existing;
  }
  const strikes = (existing?.strikes ?? 0) + 1;
  const permanent = strikes > MAX_STRIKES_BEFORE_PERMANENT;
  const record: BanRecord = {
    strikes,
    lastStrikeAt: now,
    bannedUntil: permanent ? null : now + BAN_DURATION_MS,
    permanent,
  };
  await kv.put(banKey(ip), JSON.stringify(record));
  return record;
}
