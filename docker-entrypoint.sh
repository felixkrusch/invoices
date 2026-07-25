#!/bin/sh
set -e

if [ -z "$AUTH_SECRET" ] || [ ${#AUTH_SECRET} -lt 32 ]; then
  echo "invoices: AUTH_SECRET must be set to at least 32 characters" >&2
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ] || ! printf '%s' "$ENCRYPTION_KEY" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  echo "invoices: ENCRYPTION_KEY must be exactly 64 hexadecimal characters" >&2
  exit 1
fi

if [ -z "$JOB_RUNNER_SECRET" ] || [ ${#JOB_RUNNER_SECRET} -lt 32 ]; then
  echo "invoices: JOB_RUNNER_SECRET must be set to at least 32 characters" >&2
  exit 1
fi

# Updater token only required when the sidecar updater is in use
if [ "${1:-server}" != "worker" ] && [ -n "${UPDATER_URL:-}" ] && { [ -z "$UPDATER_TOKEN" ] || [ "$UPDATER_TOKEN" = "changeme" ]; }; then
  echo "invoices: UPDATER_TOKEN must be configured when UPDATER_URL is set" >&2
  exit 1
fi

mkdir -p .data/files .data/backups uploads logs backups
echo "invoices: running database migrations..."
npx prisma migrate deploy

if [ "${1:-server}" = "worker" ]; then
  echo "invoices: starting durable job worker..."
  exec npm run worker
fi

echo "invoices: starting server..."
exec npm start
