# Setup — invoices

## Local development

Clone the public source first. No GitHub account or published container image
is required. Use Node.js 22 LTS, npm, Git, and PostgreSQL 16 (or Docker for the
database). For Docker app deployment instead, use [PRODUCTION.md](./PRODUCTION.md).

```bash
git clone https://github.com/felixkrusch/invoices.git
cd invoices
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET (≥32), ENCRYPTION_KEY (64 hex), JOB_RUNNER_SECRET (≥32)

# Postgres (example)
docker run --name invoices-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=invoices -p 127.0.0.1:5432:5432 -v invoices_dev_pg:/var/lib/postgresql/data -d postgres:16-alpine

npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000 — create the first admin (bootstrap).

Dev instant email login is available only when `NODE_ENV !== production`.
`migrate deploy` applies the committed migrations; use `migrate dev` only when
developing schema changes. The sample database password above is for local
development only. Never expose that database to the internet.

`npm run db:seed` is optional for a disposable development database only:
the seed script **truncates existing application tables** before inserting
sample data. Never run it against a real installation or as an update step.

## Production

See [PRODUCTION.md](./PRODUCTION.md) and [VPS-Auth-Install.md](./VPS-Auth-Install.md).

**Before first production boot:** public `AUTH_URL` (https), `AUTH_TRUST_HOST=true`, strong secrets, and full SMTP and/or OAuth. Instant email (`/api/auth/dev`) is off in production.

**Docker packaging:** image includes `prisma.config.ts`; entrypoint runs `prisma migrate deploy` and creates data dirs. Build uses a placeholder `AUTH_SECRET` (runtime must override).
The image is built locally from source; no prebuilt Invoices image is published.
Leave `UPDATER_URL` and `UPDATE_MANIFEST_URL` empty for source-built installations.

## Environment

See `.env.example`.

Licensing: **30-day trial** from first use (no key). Then a human buys at https://entrytwo.com/buy?product=invoices and an admin activates with `POST /api/license/activate`. Set `LICENSE_VERIFY_URL=https://entrytwo.com/api/license/verify` in `.env` or paid keys fail. Same model as entrytwo; keys are product-bound.

Handler: one compose project per legal entity (`COMPOSE_PROJECT_NAME`, unique `APP_PORT`). Agent skill: https://entrytwo.com/skills/invoices/SKILL.md

The public repository is [source-available shareware, not open source](../LICENSE).
One paid Invoices license covers installations for businesses you own; unrelated
client businesses need their own licenses. Source access does not waive the
30-day trial limit or grant redistribution/hosted-service rights.

## Worker

Email and webhook jobs need the worker process:

```bash
node --env-file=.env scripts/job-worker.mjs
# or docker compose service `worker`
```

Without the worker, production invoice emails stay queued as PENDING.
For a native Node.js worker, load the same environment as the server as above.
`npm run dev` loads `.env` for the
web process, but a separate Node.js worker does not load it automatically.
