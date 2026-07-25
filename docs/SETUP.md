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

See [PRODUCTION.md](./PRODUCTION.md).

## Environment

See `.env.example`. Defaults:

- `LICENSE_MODE=open` — no trial paywall (private installs)
- Set `LICENSE_MODE=trial` only if you want the 30-day gate

## Worker

Email and webhook jobs need the worker process:

```bash
npm run worker
# or docker compose service `worker`
```
