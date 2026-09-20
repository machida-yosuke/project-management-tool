import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  ATTACHMENTS: R2Bucket;
  APP_ENV: string;
}
