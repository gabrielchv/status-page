# status-page

A self-hosted uptime and status monitoring service. Point it at your URLs, and
it checks them on a schedule, tracks uptime and latency, opens/resolves
incidents automatically, and serves a public, live-updating status page.

**Non-AI by design** — a focused full-stack TypeScript web app. Deployed on
Google Cloud Run, with Postgres + Drizzle, server-side session auth, SSE live
updates, Prometheus metrics, and Terraform-managed GCP infrastructure.

## Features

- **Monitors** — name, URL, expected status, check interval, timeout. Full CRUD.
- **Scheduled checks** — Cloud Scheduler POSTs to `/api/internal/run-checks`
  every minute; the app picks up due monitors and records HTTP status + latency.
- **Automatic incidents** — a pure state machine opens an incident on
  `up -> down` and resolves it on `down -> up`, with a cause and duration.
- **Public status page** — `/status/:slug` shows current status, 7/30/90-day
  uptime, average latency, and incident history, updated live over Server-Sent
  Events (SSE).
- **Auth** — email/password with `bcrypt` hashing and server-side sessions
  (hashed token in Postgres, `httpOnly` + `SameSite=Lax` cookie).
- **Observability** — structured JSON logs (pino), `/api/healthz`, `/api/readyz`,
  and a `/api/metrics` Prometheus endpoint exposing check counters, latency, and
  incident
  transitions.
- **Deploy** — Docker + Cloud Run, Terraform for GCP resources, keyless CI via
  Workload Identity Federation.

## Architecture

```
                     ┌──────────────────────────────────────────┐
  Cloud Scheduler ──▶│  POST /api/internal/run-checks           │
  (every minute)     │    └─ runCheck()  →  recordCheck()       │
                     │         └─ transition state machine      │
                     │         └─ publish SSE event             │
                     └──────────────┬───────────────────────────┘
                                    │
                          ┌─────────▼─────────┐        ┌───────────────┐
                          │  Postgres (Drizzle)│◀──────▶│  Neon / Cloud │
                          │  users sessions     │        │  SQL          │
                          │  monitors checks    │        └───────────────┘
                          │  incidents          │
                          └─────────▲─────────┘
                                    │
  Browser ───────────────▶  Next.js 16 (App Router)
   dashboard + status page   ├─ REST API (auth, monitors, status)
                             ├─ SSE /api/status/:slug/events
                             └─ /api/healthz /api/readyz /api/metrics
```

## Stack

TypeScript · Next.js 16 (App Router) · React 19 · Tailwind CSS 4 ·
Drizzle ORM + Postgres (postgres.js driver) · Zod · bcryptjs · pino ·
Vitest · Playwright · Docker · Cloud Run · Cloud Scheduler · Terraform.

## Local development

```bash
# 1. Postgres (Docker)
docker run -d --name sp-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=statuspage -p 5432:5432 postgres:16

# 2. Env
cp .env.example .env.local
#    set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/statuspage

# 3. Migrations + install
npm install
npm run db:generate   # generate SQL from src/db/schema.ts (commit the result)
npm run db:migrate    # apply migrations to the local DB

# 4. Run
npm run dev           # http://localhost:3000
```

## Tests

```bash
npm test              # Vitest: check runner, incident state machine, uptime math
npm run e2e           # Playwright: signup -> create monitor -> status page
npm run verify        # lint + typecheck + test
```

## Deploying

One-time setup (Terraform, from `terraform/`):

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in project_id + secrets
terraform init
terraform apply                                # AR, secrets, SAs, IAM, WIF
terraform output run_service_account           # -> GCP_RUN_SA secret
terraform output deploy_service_account        # -> GCP_SA secret
terraform output wif_provider                  # -> WIF_PROVIDER secret
```

Then configure these GitHub Actions secrets and push to `main`:

- `GCP_PROJECT`, `GCP_REGION` (e.g. `us-central1`)
- `GCP_RUN_SA`, `GCP_SA`, `WIF_PROVIDER` (from the `terraform output` above)
- `GCP_DB_CONNECTION` (`PROJECT:REGION:INSTANCE`), `GCP_DB_USER`, `GCP_DB_NAME`
- `CHECK_RUNNER_SECRET` (must match the Terraform value)

The `Deploy` workflow builds/pushes the image and runs `gcloud run deploy`,
then creates/updates the Cloud Scheduler job.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (local dev / Neon — TCP mode) |
| `DATABASE_SOCKET` | Unix socket path for the Cloud Run → Cloud SQL connector (socket mode) |
| `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` | Credentials for socket mode |
| `AUTH_SECRET` | Secret for password/session hashing |
| `CHECK_RUNNER_SECRET` | Shared secret guarding `/api/internal/run-checks` |
| `APP_URL` | Public app URL (used for links) |

## Design notes

- **Single instance.** The SSE status feed uses in-process pub/sub, which is only
  correct with one replica — the deployment pins `min-instances=1,
  max-instances=1`. For horizontal scale, swap the `src/lib/sse.ts` in-memory
  hub for Redis Pub/Sub.
- **No model, no adapter.** The check runner is a plain `fetch` with an abort
  timeout; the incident logic is a 20-line pure state machine (`nextTransition`)
  that is unit-tested in isolation.
- **Secrets never baked into the image.** The Dockerfile uses build-time
  placeholders; real values are injected by Cloud Run at runtime.
