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
pnpm dev   # run frontend (https://localhost:5173) and backend (https://localhost:8787)
```

The backend always runs over HTTPS — `@hono/oauth-providers`'s internal `state` cookie is always `Secure`, which browsers silently drop over plain HTTP.

The frontend also runs over HTTPS (`@vitejs/plugin-basic-ssl`): Chrome treats `http://localhost` and `https://localhost` as different sites, so the `SameSite=Lax` session cookie would not be sent to the backend otherwise.

Open `https://localhost:8787/health` and `https://localhost:5173` once and accept the self-signed certificate warnings before logging in. The redirect URI registered in Google Cloud Console must match (`https://localhost:8787/api/auth/google`).

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start frontend + backend dev servers |
| `pnpm lint` | Lint all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm build` | Build all workspaces |
| `pnpm --filter backend db:generate` | Generate a drizzle SQL migration |
| `pnpm deploy:staging` | Deploy backend + frontend to staging |
| `pnpm deploy:production` | Deploy backend + frontend to production |

## Deploy

There are two environments, `staging` and `production`. The frontend Worker is protected by Basic auth; the backend is not.

1. Log in to Cloudflare.

   ```bash
   pnpm exec wrangler login
   ```

2. Create the resources for each environment, then paste the output IDs into the matching `env.staging` / `env.production` block of `apps/backend/wrangler.jsonc`. Also replace `REPLACE_ACCOUNT` in `FRONTEND_URL` with your workers.dev subdomain.

   ```bash
   cd apps/backend
   pnpm exec wrangler d1 create pm-tool-db-staging
   pnpm exec wrangler kv namespace create SESSIONS --env staging
   pnpm exec wrangler kv namespace create CACHE --env staging
   pnpm exec wrangler r2 bucket create pm-tool-attachments-staging

   pnpm exec wrangler d1 create pm-tool-db-production
   pnpm exec wrangler kv namespace create SESSIONS --env production
   pnpm exec wrangler kv namespace create CACHE --env production
   pnpm exec wrangler r2 bucket create pm-tool-attachments-production
   ```

3. Set the secrets.

   ```bash
   cd apps/backend
   pnpm exec wrangler secret put GOOGLE_ID --env staging
   pnpm exec wrangler secret put GOOGLE_SECRET --env staging
   pnpm exec wrangler secret put GOOGLE_ID --env production
   pnpm exec wrangler secret put GOOGLE_SECRET --env production

   cd ../frontend
   pnpm exec wrangler secret put BASIC_AUTH_USER --env staging
   pnpm exec wrangler secret put BASIC_AUTH_PASSWORD --env staging
   pnpm exec wrangler secret put BASIC_AUTH_USER --env production
   pnpm exec wrangler secret put BASIC_AUTH_PASSWORD --env production
   ```

   The frontend Worker returns 503 until both `BASIC_AUTH_*` secrets are set.

4. Create `apps/frontend/.env.staging` and `apps/frontend/.env.production`.

   ```bash
   # apps/frontend/.env.staging
   VITE_API_BASE_URL=https://pm-tool-backend-staging.<account>.workers.dev
   # apps/frontend/.env.production
   VITE_API_BASE_URL=https://pm-tool-backend-production.<account>.workers.dev
   ```

5. Register these redirect URIs in Google Cloud Console:
   - `https://pm-tool-backend-staging.<account>.workers.dev/api/auth/google`
   - `https://pm-tool-backend-production.<account>.workers.dev/api/auth/google`

6. Apply the D1 migrations.

   ```bash
   pnpm --filter backend db:migrate:staging
   pnpm --filter backend db:migrate:production
   ```

7. Deploy (backend first, then frontend).

   ```bash
   pnpm deploy:staging
   pnpm deploy:production
   ```

> The frontend and backend run on different hosts, but both live under the same `<account>.workers.dev`, so the browser still sends the `SameSite=Lax` session cookie. Putting them on separate custom domains (different sites) will break login.

## CI / CD

GitHub Actions runs the checks and the deploys. Workflows live in `.github/workflows/`.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, pushes to `main` | `lint`, `typecheck`, `test`, `build` |
| `deploy.yml` | Pushes to `staging` / `production`, or manual dispatch | Checks, frontend build, then `wrangler` via `cloudflare/wrangler-action`: D1 migrations, backend deploy, frontend deploy |

Branch flow: merge feature branches into `main`, merge `main` into `staging` to deploy staging, then merge `staging` into `production` to deploy production. Each push to `staging` or `production` deploys that environment.

### One-time GitHub setup

1. Create a Cloudflare API token with the "Edit Cloudflare Workers" template plus `D1:Edit`.
2. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Create GitHub Environments named `staging` and `production`. In each, add the variable `VITE_API_BASE_URL` (the backend URL for that environment, same value as the local `.env.<env>` file). Enable "Required reviewers" on `production` if deploys there should need approval.

Worker secrets (`GOOGLE_*`, `BASIC_AUTH_*`) stay in Cloudflare and are set once with `wrangler secret put` as described above; the workflow does not manage them.

## Rate limiting

The backend limits every request (including `/health`) per client IP (`cf-connecting-ip`) to 100 requests per minute using a Workers Rate Limiting binding. The 101st request adds a strike:

- Strikes 1–3: banned for 24 hours. Responds `429 { "error": "rate_limited" }` with `Retry-After`.
- Strike 4 and later: banned permanently. Responds `403 { "error": "ip_banned" }`.

Strikes never reset automatically. State lives in the `CACHE` KV under `ratelimit:ban:<IP>`; delete that key to lift a ban.

```bash
wrangler kv key delete --binding CACHE --env production "ratelimit:ban:<IP>"
```

Requests without `cf-connecting-ip` or from loopback (local dev, tests) are not limited.

## Directory structure

```
apps/frontend  Vue 3 SPA, deployed as Workers Static Assets
apps/backend   Hono API, deployed as a Worker (D1/KV/R2 bindings)
apps/e2e       Playwright placeholder (not yet installed)
packages/shared  Types shared between frontend and backend
```
