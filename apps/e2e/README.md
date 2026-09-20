# e2e

Playwright is not installed yet. To set it up when E2E coverage is needed:

```bash
cd apps/e2e
pnpm create playwright
```

Target the local dev servers (`http://localhost:5173` frontend, `http://localhost:8787` backend),
started via `pnpm dev` from the repo root.
