# CI/CD

The repository's `.github/workflows/ci-cd.yml` runs on pull requests and pushes to `main`.
It installs locked dependencies, lints the frontend, runs frontend/backend/deployment tests,
and builds the frontend with a same-origin `/api` endpoint.

Only passing pushes to `main` (or a manual run on `main`) deploy. A separate deployment job
downloads the tested artifact. Production deployments are serialized and are not cancelled
midway when another commit arrives. Pull requests cannot use production credentials.

Repository Actions secrets required:

- `DEPLOY_HOST`: server hostname or address.
- `DEPLOY_USER`: dedicated deployment account.
- `DEPLOY_SSH_KEY`: dedicated private key for the forced deployment command.
- `DEPLOY_KNOWN_HOSTS`: verified server SSH host key entry.
- `DEPLOY_URL`: public HTTPS origin, without a trailing slash.

The deployment key cannot open a shell, forward ports, or run arbitrary commands. Its forced
command invokes a root-owned receiver. The receiver validates the archive, installs backend
dependencies without lifecycle scripts as the application user, saves a private database
backup, atomically switches the current release, and restarts the API. HTTPS checks verify
the new revision and the unauthenticated API boundary. Failed health checks restore the prior
application release. Database migrations are **not** automatically reversed; keep migrations
compatible with the previous version and restore a backup manually only after reviewing data
written since deployment. Deployment database backups remain on the server; off-server backup
is separate.

The server administrator installs `receive.sh` and `validate-release.py` as root-owned files.
The receiver reads these settings from the root-owned `/etc/careflow-deploy.conf`:
`RELEASE_ROOT`, `CURRENT_LINK`, `BACKUP_DIR`, `DATABASE`, `DOMAIN`, `SERVICE`, and `APP_USER`.
Nginx serves `CURRENT_LINK/dist`; the service runs from `CURRENT_LINK/backend`. Production
environment secrets remain on the server and are never included in build artifacts.

Changing these server-side deployment helpers requires a separate administrator installation;
ordinary application pushes do not replace the privileged receiver.
