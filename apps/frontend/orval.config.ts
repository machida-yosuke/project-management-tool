import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: '../../docs/openapi.yaml',
      filters: { mode: 'exclude', tags: ['health', 'avatars'] },
    },
    output: {
      target: 'src/api/generated/api.ts',
      schemas: 'src/api/generated/models',
      mode: 'tags-split',
      client: 'pinia-colada',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: { path: './src/lib/api.ts', name: 'customInstance' },
      },
    },
  },
});
