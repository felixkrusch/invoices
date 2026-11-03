# Source-Built Updates - Invoices

## Current distribution

The [Invoices source repository](https://github.com/felixkrusch/invoices) is
public under the [proprietary source-available license](../LICENSE).
**No prebuilt Invoices Docker image or public update manifest is currently
published.** Docker installation and updates build the included Dockerfile
locally. `invoices:latest` is a local tag, not an image customers can pull.

Keep `UPDATER_URL` and `UPDATE_MANIFEST_URL` empty. Do not enable the updater
Compose profile, mount the Docker socket into the app, or point Invoices at
the entrytwo accounting release feed. Existing updater code and the release
workflow are not evidence that an Invoices image is available.

Security and maintenance updates for the purchased major version are included
without an annual maintenance subscription. Major upgrades may be optional
paid purchases. Delivery format and license entitlement are separate concerns;
an activated licensed installation is not remotely disabled.

## Before updating

1. Read the changes and migration notes for the commit or tag you intend to run.
2. Record the running source revision with `git rev-parse HEAD` and image with
   `docker image inspect invoices:latest --format '{{.Id}}'` (adjust if APP_IMAGE differs).
3. Stop user writes and new inbound work. Drain or account for pending jobs, then
   stop the worker before taking the final backup.
4. Export an Invoices `.invbackup` and retain an off-host copy. Keep `.env`, the
   original `ENCRYPTION_KEY`, a PostgreSQL backup, and the private `app_data`
   volume contents securely. Never use entrytwo `.etbackup` files here.
5. Verify recovery on an isolated installation. Retain the old image and source.

Do not update a live installation without a tested backup. Do not use
`docker compose down -v`: it deletes database and private-file volumes.

## Rebuild and recreate

From your existing clone, first inspect local modifications:

```bash
git status --short
git fetch --tags origin
```

Choose and check out a reviewed commit or tag without discarding local work.
Do not blindly follow a moving branch. Keep `.env` and data unchanged. Set
`APP_VERSION` to identify the selected source revision if desired, then:

```bash
docker compose -f compose.yaml build app
docker compose -f compose.yaml stop worker app
docker compose -f compose.yaml up -d --no-build --pull never app worker db
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs --tail=100 app worker
```

The app entrypoint applies committed Prisma migrations before starting. The
worker starts only after app health succeeds. Both services must be recreated
from the rebuilt image; leaving the old worker running can mix code versions.

Check `/api/health`, sign-in/TOTP, contact and invoice access, PDF download, and
SMTP delivery before reopening the installation. Confirm the worker processes
queued email and webhook jobs. Perform a backup/restore drill regularly.

## Recovery

If the update fails, keep the installation closed to writes. Recreating an
older application image does **not** undo database migrations. Recover the
matching source/image, database, private files, and encryption key together
from the pre-update backup using the tested procedure. Do not delete volumes
or reset the database as a troubleshooting shortcut.

## Future signed-image distribution

The repository includes release/updater machinery, but it is not the current
customer installation path. Before advertising image-based updates, publish
and independently verify accessible app and updater images, versioned digests,
signatures, manifests, migrations, health checks, and recovery instructions.
Document the actual registry and signing identity only when those artifacts
exist. Until then, install and update from public source as above.
