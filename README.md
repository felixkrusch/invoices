# invoices

Standalone **contacts + invoicing** app (with optional AI chat).

Self-hosted. Not an accounting/ledger system — books stay with your accountant.

## Features

- Contacts (customers / vendors)
- Invoices: draft, send, PDF, email, payment links (Stripe/PayPal optional)
- Recurring invoices
- Tax rates for invoice lines
- Auth: magic link, OAuth, TOTP
- Optional chat assistant (contacts + invoice drafts)
- Admin: company, users, tax, AI, backup, updates

## Quick start

```bash
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, JOB_RUNNER_SECRET

npm install
docker compose up -d   # postgres, if using compose
npx prisma migrate dev
npm run db:seed        # optional sample tax rates + contact
npm run dev
```

Open http://localhost:3000 — create the first admin on bootstrap.

## Stack

Next.js 16, React 19, Prisma 7, PostgreSQL, Auth.js, next-intl, AI SDK.

## License

Private / TBD.
