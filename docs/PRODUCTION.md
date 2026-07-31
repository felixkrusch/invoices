# Production checklist — invoices

Standalone contacts + invoicing. Not an accounting system.

## Prerequisites (do these first)

| Item | Why |
|------|-----|
| VPS **≥ 2 GB RAM** (more if sharing the host with other stacks) | Build + app + worker + Postgres |
| SSH key **on the server** (`authorized_keys`) | Cloud “SSH keys” lists do not always inject into existing VMs |
| Domain **A record** → server IP **before** relying on HTTPS | Caddy/Let’s Encrypt need public DNS |
| Full **SMTP** and/or **OAuth** | Production will not start without a real sign-in method |

## 1. Secrets (generate fresh per install)

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
openssl rand -base64 48   # JOB_RUNNER_SECRET
openssl rand -base64 48   # UPDATER_TOKEN (only if UPDATER_URL / updater sidecar is used)
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Copy `.env.example` → `.env` and fill all required values.

## 2. Required production env

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | PostgreSQL (compose sets from `POSTGRES_PASSWORD`) |
| `POSTGRES_PASSWORD` | Required by compose |
| `AUTH_SECRET` | ≥ 32 chars |
| `ENCRYPTION_KEY` | 64 hex chars |
| `JOB_RUNNER_SECRET` | ≥ 32 chars |
| `AUTH_URL` | `https://your.domain` (no trailing slash) |
| `AUTH_TRUST_HOST` | `true` behind reverse proxy |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Magic link + invoice email (or OAuth instead) |
| `SMTP_FROM` | Recommended |
| `UPDATER_TOKEN` | Only when `UPDATER_URL` is set |

At least one sign-in method: full SMTP and/or Google and/or Microsoft OAuth.

## 3. Docker deploy

```bash
cp .env.example .env
# edit .env — secrets, AUTH_URL, SMTP or OAuth, POSTGRES_PASSWORD

docker compose up -d --build
# entrypoint: prisma migrate deploy, then next start (+ worker service for mail jobs)

curl -sS https://your.domain/api/health | jq .
# expect: "ready": true, "status": "ok"
```

Open the site → bootstrap first **ADMIN** → company settings → tax rates → first contact → first invoice.

### Image packaging notes

- Build-time `AUTH_SECRET` placeholder is set in the Dockerfile; runtime `.env` must supply a real secret.
- Image includes `prisma.config.ts` (Prisma 7). Missing it → migrate error: “datasource.url property is required”.
- Entrypoint writes `DATABASE_URL` into a container `.env` before migrate and creates `.data` / `uploads` / `logs` / `backups`.
- Auth.js Email provider needs SMTP `server: { host, port, auth }` (shipped in app code).

## 4. Smoke test (must pass before handing to user)

1. **Health** `GET /api/health` → `ready: true`
2. **Auth** magic link or OAuth sign-in works
3. **Contact** create + edit
4. **Invoice** create DRAFT → PDF download → mark SENT → email (if SMTP) → mark PAID
5. **Backup** Admin → Backup → export `.invbackup` (file downloads)
6. **Chat** (optional) one message if LLM keys set
7. **Sign out / invite** second user as VIEWER if needed

## 5. Reverse proxy + TLS

- Terminate TLS (HTTPS) with Caddy/nginx/Traefik
- Forward to `127.0.0.1:3000` (or the published app port)
- Set `AUTH_URL=https://your.domain` and `AUTH_TRUST_HOST=true`
- Do not expose Postgres publicly
- DNS **A** record must resolve to the VPS **before** ACME succeeds. If certs were attempted while DNS was missing, restart the proxy after DNS works (`systemctl restart caddy`)
- Browser `SSL_ERROR_INTERNAL_ERROR_ALERT` usually means no valid cert yet (DNS/ACME), not an app bug

### Multi-instance on one VPS

Separate compose projects, volumes, `.env`, and host ports; one reverse proxy by hostname. ~1–1.5 GB RAM per stack is a practical budget.

## 6. Backups

- Schedule periodic Admin export or `BACKUP_CREATE` job + offsite copy
- Store `ENCRYPTION_KEY` offline with backups (restore requires the same key)
- Format: `.invbackup` (not compatible with entrytwo)

## 7. Updates

See `docs/Self-Hosted-Update-Delivery.md`. Image name defaults to `invoices:latest`.

## 8. Email (invoice send + magic link)

| Variable | Required |
|----------|----------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Yes for real mail |
| `SMTP_FROM` | Recommended |
| Compose service **`worker`** | **Required in production** for queued invoice email |

Without the worker, production invoice emails stay in `DurableJob` as PENDING.

Dev (`npm run dev`) sends invoice email **inline** (no worker needed).

## 9. Payment QR on PDFs

Admin → Company → bank **IBAN** (stored as `company.bank.iban`).  
EPC/SEPA QR is generated on PDF when IBAN is present. Empty IBAN → no payment QR.

## 10. Backup

Admin → Backup → download `.invbackup`. Restore needs the **same `ENCRYPTION_KEY`**.  
Format is invoices-only (not compatible with entrytwo).

## 11. Updates

In-app update expects `UPDATE_MANIFEST_URL` + published Docker images + optional updater profile.  
Until you run a release pipeline, deploy with `docker compose up -d --build` or image pull manually.

## 12. What this app does *not* do

- Double-entry bookkeeping / chart of accounts / P&L
- Bank feeds as ledger truth
- Expense claims workflow

Books stay with the accountant. Export invoice PDFs as needed.

## 13. Pre-sale smoke checklist

1. Fresh DB migrate + first admin bootstrap  
2. Company name + IBAN + logo  
3. Create contact + invoice → PDF shows QR  
4. SMTP + worker → send invoice email arrives  
5. Backup export downloads; restore on a throwaway DB once  
6. Invite second user (if multi-user)  
7. Sign out / sign in with magic link or OAuth
