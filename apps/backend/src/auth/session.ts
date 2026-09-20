import type { KVNamespace } from '@cloudflare/workers-types';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  await kv.put(sessionId, JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS });
  return sessionId;
}

export async function getSessionUser(
  kv: KVNamespace,
  sessionId: string | undefined,
): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const raw = await kv.get(sessionId);
  if (!raw) return null;
  return JSON.parse(raw) as SessionUser;
}

export async function destroySession(kv: KVNamespace, sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await kv.delete(sessionId);
}
