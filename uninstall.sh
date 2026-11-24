#!/usr/bin/env bash
# Remove VVSM (panel, services, nginx site). Cores (xray/hysteria/wireguard/openvpn) and PostgreSQL are kept
# unless you pass --purge-all. The database is dropped only with --drop-db.
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
PURGE=false; DROP=false
for a in "$@"; do [[ "$a" == "--purge-all" ]] && PURGE=true; [[ "$a" == "--drop-db" ]] && DROP=true; done
read -r -p "This stops and removes the VVSM panel. Continue? [y/N] " yn
[[ "$yn" =~ ^[Yy]$ ]] || exit 0
systemctl disable --now vvsm-panel vvsm-agent vvsm-psiphon vvsm-nat 2>/dev/null
rm -f /etc/systemd/system/vvsm-*.service /usr/local/bin/vvsm /usr/local/sbin/vvsm-nat /etc/nginx/sites-enabled/vvsm.conf /etc/nginx/sites-available/vvsm.conf
systemctl daemon-reload
nginx -t >/dev/null 2>&1 && systemctl reload nginx
if $DROP; then sudo -u postgres psql -c "DROP DATABASE IF EXISTS vvsm" -c "DROP ROLE IF EXISTS vvsm"; fi
if $PURGE; then
  systemctl disable --now xray hysteria-server wg-quick@wg0 openvpn-server@vvsm 2>/dev/null
  rm -rf /etc/vvsm /usr/local/etc/xray /etc/hysteria /etc/wireguard/wg0.conf /etc/openvpn/server/vvsm.conf
fi
rm -rf /opt/vvsm
echo "VVSM removed. Backups remain in /var/backups/vvsm."
