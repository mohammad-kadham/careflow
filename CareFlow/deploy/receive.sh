#!/usr/bin/env bash
# Installed root-owned; invoked by a forced SSH command, receiving a tar.gz on stdin.
set -Eeuo pipefail
PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 022
source /etc/careflow-deploy.conf
[[ "$RELEASE_ROOT" = /* && "$CURRENT_LINK" = /* && "$BACKUP_DIR" = /* ]]
[[ "$DATABASE" =~ ^[a-zA-Z0-9_]+$ ]]
[[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]
exec 9>/run/lock/careflow-deploy.lock
flock -w 600 9
stage=$(mktemp -d "$RELEASE_ROOT/.stage-XXXXXXXX")
archive=$(mktemp /var/tmp/careflow-release-XXXXXXXX.tar.gz)
old=$(readlink -f "$CURRENT_LINK")
switched=0
success=0
cleanup() {
    status=$?
    if [[ "$switched" = 1 && "$success" = 0 ]]; then
        echo 'Deployment failed; restoring previous application release.' >&2
        ln -sfn "$old" "$CURRENT_LINK.next"
        mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
        systemctl restart "$SERVICE" || true
        echo 'Database backup retained; schema changes are not automatically reversed.' >&2
    fi
    rm -f -- "$archive"
    if [[ -d "$stage" && "$stage" == "$RELEASE_ROOT"/.stage-* ]]; then
        rm -rf -- "$stage"
    fi
    exit "$status"
}
trap cleanup EXIT
# Reject interrupted, oversized, or unsafe uploads before any live changes.
timeout 180 head -c 26214401 > "$archive"
[[ $(stat -c %s "$archive") -le 26214400 ]]
revision=$(python3 /usr/local/lib/careflow/validate-release.py "$archive")
tar --extract --gzip --file "$archive" --directory "$stage" --no-same-owner --no-same-permissions
chown -R "$APP_USER:$APP_USER" "$stage"
runuser -u "$APP_USER" -- env npm_config_cache="$stage/.npm" \
    npm --prefix "$stage/backend" ci --omit=dev --ignore-scripts --no-audit --no-fund
rm -rf -- "$stage/.npm"
chown -R root:root "$stage"
find "$stage" -type d -exec chmod 755 {} +
find "$stage" -type f -exec chmod 644 {} +
release="$RELEASE_ROOT/$revision-$(date -u +%Y%m%dT%H%M%S)-$$"
mv -- "$stage" "$release"
install -d -m 700 "$BACKUP_DIR"
backup="$BACKUP_DIR/$(date -u +%Y%m%dT%H%M%S)-$revision.sql.gz"
(umask 077; mariadb-dump --single-transaction "$DATABASE" | gzip > "$backup")
gzip -t "$backup"
echo "Database backup saved; activating revision $revision"
ln -sfn "$release" "$CURRENT_LINK.next"
switched=1
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
systemctl restart "$SERVICE"
healthy=0
for attempt in $(seq 1 30); do
    if systemctl is-active --quiet "$SERVICE" && \
       [[ $(curl --max-time 5 -sS --resolve "$DOMAIN:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/user/me" || true) = 401 ]] && \
       [[ $(curl --max-time 5 -fsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/version.txt" || true) = "$revision" ]] && \
       curl --max-time 5 -fsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" -o /dev/null; then
        healthy=1
        break
    fi
    sleep 2
done
[[ "$healthy" = 1 ]]
success=1
ln -sfn "$old" "$CURRENT_LINK.previous"
echo "Deployment healthy: $revision"
# Retain the current and previous release, plus the three newest others.
python3 - "$RELEASE_ROOT" "$release" "$old" <<'PY'
import pathlib, re, shutil, sys
root = pathlib.Path(sys.argv[1]).resolve()
protected = {pathlib.Path(p).resolve() for p in sys.argv[2:]}
releases = sorted((p for p in root.iterdir() if re.fullmatch(r"[0-9a-f]{40}(?:-[0-9TZ]+-[0-9]+)?", p.name)
                   and p.is_dir() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
others = [p for p in releases if p.resolve() not in protected]
for path in others[3:]:
    if path.resolve().parent == root:
        shutil.rmtree(path)
PY
