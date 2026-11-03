# Production checklist — invoices

Standalone contacts + invoicing. Not an accounting system.

**Distribution:** [the source repository is public](https://github.com/felixkrusch/invoices).
There is **no published Invoices Docker image or update manifest**. Build the
included Dockerfile locally. `invoices:latest` is a local image tag shared by
the app and worker, not a registry download. Do not substitute entrytwo images.

## 0. Get the source

Install Git and Docker with Compose v2 or newer, then:

```bash
git clone https://github.com/felixkrusch/invoices.git
cd invoices
cp .env.example .env
```

No GitHub login, token, registry login, or source-access purchase is required.
Public source access is governed by [LICENSE](../LICENSE), not an open-source
license. Keep `.env` private and never commit it.

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
openssl rand -base64 48   # UPDATER_TOKEN (Compose interpolates the optional service too)
openssl rand -hex 24      # POSTGRES_PASSWORD
```

Fill the `.env` created above. Generate each secret separately; keep the
original `ENCRYPTION_KEY` safe for restores. A hexadecimal database password
avoids URL-encoding problems in the Compose-generated connection string.

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
| `UPDATER_TOKEN` | Set a fresh value: Compose interpolates the optional updater service even when its profile is disabled |
| `UPDATER_URL` / `UPDATE_MANIFEST_URL` | Leave both empty; no published image/update feed |
| `APP_IMAGE` | `invoices:latest` (the local build tag) |
| `APP_VERSION` | Source tag/commit you are building, or `dev`; record `git rev-parse HEAD` |
| `APP_PORT` | `127.0.0.1:3000` to bind only to loopback; use `127.0.0.1:3001` if 3000 is occupied |
| `APP_PUBLIC_URL` | Match `AUTH_URL` |
| `LICENSE_VERIFY_URL` | `https://entrytwo.com/api/license/verify`; required for paid activation, not the trial |

At least one sign-in method: full SMTP and/or Google and/or Microsoft OAuth.
OAuth alone enables sign-in but does not send invoice emails; configure SMTP
and keep the worker running for invoice delivery.

### Local Docker use (not internet-facing)

Docker still runs `NODE_ENV=production`, even on your laptop. Real SMTP/OAuth,
strong secrets, and administrator TOTP setup are still required. For loopback
HTTP only, use:

```dotenv
APP_PORT="127.0.0.1:3001"
AUTH_URL="http://localhost:3001"
APP_PUBLIC_URL="http://localhost:3001"
AUTH_TRUST_HOST="true"
AUTH_ALLOW_HTTP="true"
UPDATER_URL=""
UPDATE_MANIFEST_URL=""
```

This is the explicit lab-only HTTP exception. For an internet-facing install,
use HTTPS and keep `AUTH_ALLOW_HTTP=false`. For development-only instant login,
use the native [development setup](./SETUP.md), not a production container.

## 3. Docker deploy

```bash
# Run after editing .env. Pull only the upstream PostgreSQL image.
docker compose -f compose.yaml pull db
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d --no-build --pull never app worker db
# entrypoint: prisma migrate deploy, then next start (+ worker service for mail jobs)

docker compose -f compose.yaml ps
curl --fail --silent --show-error https://your.domain/api/health
# expect: "ready": true, "status": "ok"
```

For the local example, check `http://localhost:3001/api/health` instead. Values
in `.env` are read by Compose; they are not automatically shell variables.
Do not use `${APP_PORT:-3000}` in a curl URL, especially when APP_PORT includes
the `127.0.0.1:` bind address.

Build `app` explicitly **before** starting `worker`, which has no build block
and uses the same local image. Do not run `docker compose pull app worker` or
enable `--profile updater`. Monitor failures with
`docker compose -f compose.yaml logs --tail=100 app worker`.

Open the site → bootstrap first **ADMIN** → enable TOTP → company settings → tax rates → first contact → first invoice.

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
Set a distinct `COMPOSE_PROJECT_NAME` per company to isolate database and private
file volumes. One Invoices license permits installations for businesses you own;
unrelated clients need their own licenses. Do not mix companies in one database.

## 6. Backups

- Schedule periodic Admin export or `BACKUP_CREATE` job + offsite copy
- Store `ENCRYPTION_KEY` offline with backups (restore requires the same key)
- Format: `.invbackup` (not compatible with entrytwo)

## 7. Updates

Updates currently require an operator-reviewed source update and local rebuild.
Back up first, stop writes, select a reviewed commit/tag, build `app`, and
recreate **both app and worker**. Do not assume restoring an older image reverses
database migrations. See [source-built update instructions](./Self-Hosted-Update-Delivery.md).

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

## 10. What this app does *not* do

- Double-entry bookkeeping / chart of accounts / P&L
- Bank feeds as ledger truth
- Expense claims workflow

Books stay with the accountant. Export invoice PDFs as needed.

## 11. Pre-sale smoke checklist

1. Fresh DB migrate + first admin bootstrap  
2. Company name + IBAN + logo  
3. Create contact + invoice → PDF shows QR  
4. SMTP + worker → send invoice email arrives  
5. Backup export downloads; restore on a throwaway DB once  
6. Invite second user (if multi-user)  
7. Sign out / sign in with magic link or OAuth
