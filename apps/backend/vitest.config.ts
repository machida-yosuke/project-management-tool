/// <reference types="node" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GOOGLE_ID: 'test-google-client-id',
            GOOGLE_SECRET: 'test-google-client-secret',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./tests/apply-migrations.ts'],
  },
});
