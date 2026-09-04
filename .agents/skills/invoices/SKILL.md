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

Public repo clone (as documented):

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
- `AUTH_URL=http://localhost:3000` (or https origin in production)
- Production: `AUTH_TRUST_HOST=true` + SMTP and/or OAuth
- Optional chat: LLM key
- Optional: `NEXT_PUBLIC_LICENSE_URL=https://entrytwo.com/buy?product=invoices`

If **entrytwo already uses port 3000** on the same machine:

```bash
# .env or shell
APP_PORT=3001
AUTH_URL=http://localhost:3001
APP_PUBLIC_URL=http://localhost:3001
```

```bash
docker compose up -d --build
curl -sS http://localhost:${APP_PORT:-3000}/api/health
```

Wait for `"ready": true`. First visit: create **ADMIN**. Production ADMIN must enable TOTP. Instant email is **dev only**. **Worker must run** or invoice emails stay PENDING.

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

## Handler mode

Not multi-tenant. Per client: `COMPOSE_PROJECT_NAME=invoices-client-acme`, unique `APP_PORT`, unique secrets, unique volumes. Backups are `.invbackup` — not compatible with entrytwo `.etbackup`.

## Refusal

Refuse: card checkout, mixing entities, using an entrytwo key here, sending invoices the user did not confirm, skipping the worker when they need email, skipping `LICENSE_VERIFY_URL` if they will activate a paid key.
