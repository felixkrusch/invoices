# Setup — invoices

## Local development

```bash
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET (≥32), ENCRYPTION_KEY (64 hex), JOB_RUNNER_SECRET (≥32)

# Postgres (example)
docker run --name invoices-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=invoices -p 5432:5432 -d postgres:16-alpine

npm install
npx prisma migrate dev
npm run db:seed   # optional sample tax rates + contact
npm run dev
```

Open http://localhost:3000 — create the first admin (bootstrap).

Dev instant email login is available only when `NODE_ENV !== production`.

## Production

See [PRODUCTION.md](./PRODUCTION.md) and [VPS-Auth-Install.md](./VPS-Auth-Install.md).

**Before first production boot:** public `AUTH_URL` (https), `AUTH_TRUST_HOST=true`, strong secrets, and full SMTP and/or OAuth. Instant email (`/api/auth/dev`) is off in production.

**Docker packaging:** image includes `prisma.config.ts`; entrypoint runs `prisma migrate deploy` and creates data dirs. Build uses a placeholder `AUTH_SECRET` (runtime must override).

## Environment

See `.env.example`.

Licensing: **30-day trial** from first use, then activate a key (master key or `LICENSE_VERIFY_URL`). Same model as entrytwo.

## Worker

Email and webhook jobs need the worker process:

```bash
npm run worker
# or docker compose service `worker`
```

Without the worker, production invoice emails stay queued as PENDING.
