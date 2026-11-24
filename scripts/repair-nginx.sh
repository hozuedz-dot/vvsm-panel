#!/usr/bin/env bash
# Safely repair the Nginx syntax error: standalone "default_server;".
# Never deletes a valid "listen 80 default_server;" directive.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash scripts/repair-nginx.sh" >&2; exit 1; }
LINK="${VVSM_NGINX_CONFIG:-/etc/nginx/sites-enabled/vvsm.conf}"
[[ -e "$LINK" ]] || { echo "Active VVSM Nginx config not found at $LINK" >&2; exit 1; }
TARGET=$(readlink -f "$LINK")
[[ -f "$TARGET" ]] || { echo "Invalid Nginx config target: $TARGET" >&2; exit 1; }
printf 'Active Nginx config: %s\n' "$TARGET"
if ! grep -Eq '^[[:space:]]*default_server[[:space:]]*;[[:space:]]*(#.*)?$' "$TARGET"; then
  echo "No standalone default_server; directive found. Showing lines 10–26 for diagnosis:" >&2
  nl -ba "$TARGET" | sed -n '10,26p' >&2
  echo "Do not make blind changes; this server has a different Nginx error." >&2
  exit 1
fi
BACKUP="${TARGET}.before-repair.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$TARGET" "$BACKUP"
printf 'Backup created: %s\n' "$BACKUP"
sed -i -E '/^[[:space:]]*default_server[[:space:]]*;[[:space:]]*(#.*)?$/d' "$TARGET"
if nginx -t; then
  systemctl restart nginx
  echo "Nginx syntax repaired and service restarted. Existing panel/database were not touched."
else
  cp -a "$BACKUP" "$TARGET"
  echo "nginx -t still failed; original config restored. Check the full nginx -t output above." >&2
  exit 1
fi
