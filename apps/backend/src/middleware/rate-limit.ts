import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Env } from '../env';
import { getBan, recordStrike, type BanRecord } from '../rate-limit/bans';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1']);
const LIMITER_PERIOD_SECONDS = 60;

function isBanned(ban: BanRecord, now: number): boolean {
  return ban.permanent || (ban.bannedUntil !== null && ban.bannedUntil > now);
}

function reject(c: Context<{ Bindings: Env }>, ban: BanRecord, now: number): Response {
  if (ban.permanent) {
    return c.json({ error: 'ip_banned' }, 403);
  }
  const retryAfter =
    ban.bannedUntil !== null && ban.bannedUntil > now
      ? Math.ceil((ban.bannedUntil - now) / 1000)
      : LIMITER_PERIOD_SECONDS;
  c.header('Retry-After', String(retryAfter));
  return c.json({ error: 'rate_limited' }, 429);
}

export const rateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip');
  // Cloudflare's edge always sets a non-loopback cf-connecting-ip; absence or loopback means
  // local dev or tests, which must not be throttled.
  if (!ip || LOOPBACK_IPS.has(ip)) {
    await next();
    return;
  }

  const now = Date.now();
  const ban = await getBan(c.env.CACHE, ip);
  if (ban && isBanned(ban, now)) {
    return reject(c, ban, now);
  }

  const { success } = await c.env.API_RATE_LIMITER.limit({ key: ip });
  if (success) {
    await next();
    return;
  }

  const record = await recordStrike(c.env.CACHE, ip, now);
  return reject(c, record, now);
});
