# Production checklist — invoices

Standalone contacts + invoicing. Not an accounting system.

## 1. Secrets (generate fresh per install)

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
openssl rand -base64 48   # JOB_RUNNER_SECRET
openssl rand -base64 48   # UPDATER_TOKEN (if using compose updater)
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Copy `.env.example` → `.env` and fill all required values.

## 2. Required production env

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | PostgreSQL |
| `AUTH_SECRET` | ≥ 32 chars |
| `ENCRYPTION_KEY` | 64 hex chars |
| `JOB_RUNNER_SECRET` | ≥ 32 chars |
| `AUTH_URL` | `https://your.domain` |
| `AUTH_TRUST_HOST` | `true` behind reverse proxy |
| `SMTP_*` | Magic link + invoice email |
| `LICENSE_MODE` | `open` for private installs (default) |
| `UPDATER_TOKEN` | Required by Docker entrypoint for `server` |

At least one sign-in method: full SMTP and/or Google and/or Microsoft OAuth.

## 3. Docker deploy

```bash
cp .env.example .env
# edit .env

docker compose up -d --build
curl -sS https://your.domain/api/health | jq .
# expect: "ready": true, "status": "ok"
```

Open the site → bootstrap first **ADMIN** → company settings → tax rates → first contact → first invoice.

## 4. Smoke test (must pass before handing to user)

1. **Health** `GET /api/health` → `ready: true`
2. **Auth** magic link or OAuth sign-in works
3. **Contact** create + edit
4. **Invoice** create DRAFT → PDF download → mark SENT → email (if SMTP) → mark PAID
5. **Backup** Admin → Backup → export `.invbackup` (file downloads)
6. **Chat** (optional) one message if LLM keys set
7. **Sign out / invite** second user as VIEWER if needed

## 5. Reverse proxy

- Terminate TLS (HTTPS)
- Forward to `127.0.0.1:3000`
- Set `AUTH_URL=https://your.domain` and `AUTH_TRUST_HOST=true`
- Do not expose Postgres publicly

## 6. Backups

- Schedule periodic Admin export or `BACKUP_CREATE` job + offsite copy
- Store `ENCRYPTION_KEY` offline with backups (restore requires the same key)
- Format: `.invbackup` (not compatible with entrytwo)

## 7. Updates

See `docs/Self-Hosted-Update-Delivery.md`. Image name defaults to `invoices:latest`.

## 8. What this app does *not* do

- Double-entry bookkeeping / chart of accounts / P&L
- Bank feeds as ledger truth
- Expense claims workflow

Books stay with the accountant. Export invoice PDFs/CSV as needed.
