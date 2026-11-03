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

The [public repository](https://github.com/felixkrusch/invoices) contains the
source. **There is no published Invoices Docker image.** Docker users build
their own local image using the included Dockerfile; no GitHub login is needed.

```bash
git clone https://github.com/felixkrusch/invoices.git
cd invoices
cp .env.example .env
# Configure secrets, real SMTP/OAuth, AUTH_URL and the other settings first.
# See docs/PRODUCTION.md, including the localhost-only HTTP option.
docker compose -f compose.yaml pull db
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d --no-build --pull never app worker db
```

The app and worker share the locally built `invoices:latest` image. The
entrypoint applies migrations. Leave `UPDATER_URL` and `UPDATE_MANIFEST_URL`
empty; do not enable the updater profile for this install path.

- [Docker / production setup](./docs/PRODUCTION.md)
- [Native Node.js development setup](./docs/SETUP.md)
- [Source-built updates](./docs/Self-Hosted-Update-Delivery.md)

## Stack

Next.js 16 · React 19 · Prisma 7 · PostgreSQL · Auth.js · next-intl · AI SDK

## License

[Proprietary, source-available shareware](./LICENSE), not open source. You may
inspect, clone, build, and privately modify the source under that license.
The full app has a 30-day trial; continued use requires a one-time Invoices
license. One purchase covers installations for businesses you own, with a
separate installation/database per company. Unrelated businesses need their
own licenses. Redistribution and separately marketed hosted services require
permission.

Buy at https://entrytwo.com/buy?product=invoices. Keys are product-bound:
an entrytwo accounting key does not activate Invoices. Successful activation
is permanent; security and maintenance updates for the purchased major version
are included, and major upgrades are optional paid purchases. See [LICENSE](./LICENSE)
for the full terms.
