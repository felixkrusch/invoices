---
name: invoices
description: Install and operate self-hosted Invoices (contacts + PDF invoicing). Use when the user wants invoices they host, not a full ledger. Do not use for double-entry accounting (that is entrytwo).
metadata:
  product: invoices
  homepage: https://entrytwo.com/invoices
  docs: https://entrytwo.com/docs/invoices/getting-started/installation
  buy: https://entrytwo.com/buy?product=invoices
  llms: https://entrytwo.com/llms.txt
---

# invoices — agent skill

Self-hosted contacts + invoicing. **Not** a ledger (no CoA, P&L, bank-as-truth). One legal entity per Docker Compose project. 30-day trial, no key. Humans buy; agents install and operate.

Ledger instead → use the **entrytwo** skill (`https://entrytwo.com/skills/entrytwo/SKILL.md`). Keys are product-bound: an entrytwo `et1.` key will not activate invoices.

## When to use

- Install Invoices (local Mac or VPS).
- Create contacts / invoice drafts via chat.
- Handler wants **one stack per client**.

## When not to use

- Do not spend the user’s money. Checkout is human-only: https://entrytwo.com/buy?product=invoices
- Do not run two companies in one instance.
- Do not post/send invoices if chat lock is on, confidence is below **0.85**, or the user did not ask to send.
- Do not treat this as bookkeeping software.

## Safety

1. **Chat lock:** UI default is unlocked. For agent/handler bulk work, **lock chat** (proposals only) until the user unlocks a task.
2. **Never execute below 0.85 confidence.** Propose instead.
3. Sending an invoice / charging is high-risk — propose unless the user clearly confirmed.
4. **One legal entity per compose project.**
5. Keep secrets out of chat (`AUTH_SECRET`, `ENCRYPTION_KEY`, SMTP, LLM keys, license key).

## Install (Docker Compose)

Need: Docker Compose, Git, ~2 GB RAM.

Clone the public source without GitHub credentials. No prebuilt Invoices Docker
image or public update manifest exists. Build the included Dockerfile locally;
`invoices:latest` is a local tag shared by app and worker, not a registry pull.

```bash
git clone https://github.com/felixkrusch/invoices.git
cd invoices
cp .env.example .env
```

Workspace layout (this monorepo): `cd invoices_v1` instead of `cd invoices`.

Generate secrets:

```bash
openssl rand -base64 48   # AUTH_SECRET, JOB_RUNNER_SECRET, UPDATER_TOKEN (each once)
openssl rand -hex 32      # ENCRYPTION_KEY
```

Required in `.env`:

- `POSTGRES_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `JOB_RUNNER_SECRET`, `UPDATER_TOKEN`
- `LICENSE_VERIFY_URL=https://entrytwo.com/api/license/verify`
- `AUTH_URL` and `APP_PUBLIC_URL` matching the actual origin
- `AUTH_TRUST_HOST=true` + complete SMTP and/or OAuth (Docker runs production even locally)
- `UPDATER_URL=""`, `UPDATE_MANIFEST_URL=""`; do not enable the updater profile
- Set `UPDATER_TOKEN` even with updater disabled: Compose interpolates that service too
- Optional chat: LLM key
- Optional: `NEXT_PUBLIC_LICENSE_URL=https://entrytwo.com/buy?product=invoices`

If **entrytwo already uses port 3000** on the same machine:

```bash
# .env: loopback-only local example
APP_PORT=127.0.0.1:3001
AUTH_URL=http://localhost:3001
APP_PUBLIC_URL=http://localhost:3001
AUTH_ALLOW_HTTP=true
```

```bash
docker compose -f compose.yaml pull db
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d --no-build --pull never app worker db
curl --fail --silent --show-error http://localhost:3001/api/health
```

Wait for `"ready": true`. First visit: create **ADMIN**. Production ADMIN must enable TOTP. Instant email is **dev only**. **Worker must run** or invoice emails stay PENDING.

Use the actual URL when checking health: `.env` is not loaded into the shell,
and APP_PORT may contain a bind address. For a public VPS use HTTPS,
`AUTH_ALLOW_HTTP=false`, and a loopback-bound app behind a reverse proxy.
Reserve `AUTH_ALLOW_HTTP=true` for explicit localhost/lab use. Never pull app
or worker images from a registry or substitute entrytwo images. Configure SMTP
for invoice mail even if OAuth handles sign-in. Never delete volumes to fix startup.

Docs: https://entrytwo.com/docs/invoices/getting-started/installation

## Trial vs license

- Trial: **30 days from first use**. No key.
- After trial: paywall until an **invoices** key is activated.
- **Buy:** human at https://entrytwo.com/buy?product=invoices
- **Activate** (authenticated admin):

```http
POST /api/license/activate
Content-Type: application/json

{"key":"et1.<payload>.<sig>"}
```

Requires `LICENSE_VERIFY_URL`. Server sends `product: invoices`. Verify-once, trust-forever.

Treat the public source as proprietary source-available shareware, not open
source. Follow the repository LICENSE: one Invoices license covers deployments
for businesses the customer owns; unrelated client businesses need their own
licenses. Do not bypass activation or imply unrestricted redistribution.

## Handler mode

Not multi-tenant. Per client: `COMPOSE_PROJECT_NAME=invoices-client-acme`, unique `APP_PORT`, unique secrets, unique volumes. Backups are `.invbackup` — not compatible with entrytwo `.etbackup`.

## Updates

Follow `docs/Self-Hosted-Update-Delivery.md`: back up the database, private files,
and original encryption key, select reviewed source, build app, and recreate
both app and worker. Keep automatic updater URLs empty. Do not assume an older
image reverses migrations; test recovery and never use `docker compose down -v`.

## Refusal

Refuse: card checkout, mixing entities, using an entrytwo key here, sending invoices the user did not confirm, skipping the worker when they need email, skipping `LICENSE_VERIFY_URL` if they will activate a paid key.
