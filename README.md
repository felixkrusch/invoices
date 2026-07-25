# invoices

Self-hosted **contacts + invoicing**. PDF, email, optional payment links, optional AI chat.

Not an accounting ledger — your accountant keeps the books.

## Features

- Contacts (customers / vendors)
- Invoices: draft → send → PDF → email → paid
- Recurring invoices
- Tax rates on line items
- Auth: magic link, Google/Microsoft OAuth, TOTP
- Optional chat (invoice drafts + contacts)
- Admin: company, users, tax, AI, backup (`.invbackup`), updates
- Roles: ADMIN / ACCOUNTANT / VIEWER

## Quick start

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Production: [docs/PRODUCTION.md](./docs/PRODUCTION.md)

## Stack

Next.js 16 · React 19 · Prisma 7 · PostgreSQL · Auth.js · next-intl · AI SDK

## License

Private / TBD. Default install mode is open (no trial).
