import type { D1Database, KVNamespace, R2Bucket, RateLimit } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  ATTACHMENTS: R2Bucket;
  API_RATE_LIMITER: RateLimit;
  FRONTEND_URL: string;
  GOOGLE_ID: string;
  GOOGLE_SECRET: string;
}

type BackendEnv = Env;

// Merge our bindings into the ambient `Cloudflare.Env` that `cloudflare:workers`'s
// `env` export (and `cloudflare:test`) are typed against. This requires TypeScript's
// declaration-merging syntax (an ambient `namespace` and an extends-only interface),
// which trips two stylistic lint rules that don't apply to this pattern.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends BackendEnv {}
  }
}
