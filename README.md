# project-management-tool

A project management web application.

## Tech stack

- Frontend: Vue 3 (Composition API) SPA + Vite, TypeScript
- Backend: Hono, TypeScript, deployed as a Cloudflare Worker
- Database: Cloudflare D1 (via drizzle-orm), KV (sessions/cache), R2 (attachments)
- Auth: Google OAuth (`@hono/oauth-providers`)
- Monorepo: pnpm workspaces + Turborepo

## Prerequisites

- Node.js v24+ (see `.nvmrc`)
- pnpm (`corepack enable`)
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency, available via `pnpm exec wrangler`)
- A Cloudflare account (`pnpm exec wrangler login`)

## Setup

```bash
pnpm install
cp apps/backend/.dev.vars.example apps/backend/.dev.vars   # fill in Google OAuth / session secret values
```

Set `VITE_API_BASE_URL=https://localhost:8787` in `apps/frontend/.env.development`.

Create the Cloudflare resources once, then paste the generated IDs into `apps/backend/wrangler.jsonc`:

```bash
cd apps/backend
pnpm exec wrangler d1 create pm-tool-db
pnpm exec wrangler kv namespace create SESSIONS
pnpm exec wrangler kv namespace create CACHE
pnpm exec wrangler r2 bucket create pm-tool-attachments
pnpm db:generate        # generate SQL migrations from src/db/schema.ts
pnpm db:migrate:local    # apply migrations to the local D1 emulation
```

## Local development

```bash
pnpm dev   # run frontend (http://localhost:5173) and backend (https://localhost:8787)
```

The backend always runs over HTTPS — `@hono/oauth-providers`'s internal `state` cookie is always `Secure`, which browsers silently drop over plain HTTP.

Open `https://localhost:8787/health` once and accept the self-signed certificate warning before logging in. The redirect URI registered in Google Cloud Console must match (`https://localhost:8787/api/auth/google`).

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start frontend + backend dev servers |
| `pnpm lint` | Lint all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm build` | Build all workspaces |
| `pnpm --filter backend db:generate` | Generate a drizzle SQL migration |

## Deploy

```bash
pnpm --filter backend deploy
pnpm --filter frontend deploy
```

## Directory structure

```
apps/frontend  Vue 3 SPA, deployed as Workers Static Assets
apps/backend   Hono API, deployed as a Worker (D1/KV/R2 bindings)
apps/e2e       Playwright placeholder (not yet installed)
packages/shared  Types shared between frontend and backend
```
