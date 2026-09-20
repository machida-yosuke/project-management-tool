import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';

interface TestEnv {
  TEST_MIGRATIONS: D1Migration[];
}

await applyD1Migrations(env.DB, (env as unknown as TestEnv).TEST_MIGRATIONS);
