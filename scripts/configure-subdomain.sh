#!/usr/bin/env bash
# Safe, explicit ACME + Nginx provisioning for the subscription hostname.
# Usage: sudo bash configure-subdomain.sh status|test|activate sub.vvsm.online admin@vvsm.online
set -Eeuo pipefail
MODE="${1:-}"; DOMAIN="${2:-}"; EMAIL="${3:-}"
APP=/opt/vvsm; VHOST=/etc/nginx/sites-available/vvsm-sub.conf
LINK=/etc/nginx/sites-enabled/vvsm-sub.conf
[[ $EUID -eq 0 ]] || { echo 'Root access is required' >&2; exit 1; }
[[ "$MODE" == status || "$MODE" == test || "$MODE" == activate ]] || { echo 'Use: status|test|activate <subdomain> <email>' >&2; exit 2; }
[[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$ && "$DOMAIN" == *.* && "$DOMAIN" != *..* ]] || { echo 'Invalid subscription domain' >&2; exit 2; }
[[ -f "$APP/.env" ]] || { echo "Panel not installed at $APP" >&2; exit 1; }
if [[ "$MODE" != status ]]; then
  [[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'A valid ACME email is required' >&2; exit 2; }
fi
PORT="$(sed -n 's/^PORT=//p' "$APP/.env" | tail -n1)"; PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid panel port' >&2; exit 1; }
if [[ -f "$VHOST" ]] && ! grep -q '^# Managed by VVSM subscription TLS' "$VHOST"; then
  echo "Unmanaged Nginx vhost exists at $VHOST; refusing to overwrite" >&2; exit 1
fi
mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled /var/backups/vvsm /etc/vvsm
RETRY_FILE="/etc/vvsm/.subdomain-acme-$(printf '%s' "$DOMAIN" | sha256sum | cut -c1-12)"
find_cert() {
  local cert
  for cert in /etc/letsencrypt/live/*/fullchain.pem; do
    [[ -f "$cert" ]] || continue
    if openssl x509 -in "$cert" -noout -checkend 0 -checkhost "$DOMAIN" >/dev/null 2>&1 && [[ -r "$(dirname "$cert")/privkey.pem" ]]; then
      printf '%s\n' "$(dirname "$cert")"
      return 0
    fi
  done
  return 1
}
cert_dir="$(find_cert || true)"
if [[ "$MODE" == status ]]; then
  A_RECORDS=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u | paste -sd, -)
  AAAA_RECORDS=$(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u | paste -sd, -)
  SERVER_IPS=$( { curl -fs4 -m 5 https://api.ipify.org 2>/dev/null || true; ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'; hostname -I 2>/dev/null | tr ' ' '\n'; } | awk 'NF' | sort -u | paste -sd, -)
  DNS_MATCH=false
  IFS=',' read -ra _a <<< "${A_RECORDS:-}"; IFS=',' read -ra _s <<< "${SERVER_IPS:-}"
  for a in "${_a[@]}"; do for s in "${_s[@]}"; do [[ -n "$a" && "$a" == "$s" ]] && DNS_MATCH=true; done; done
  CERT_EXPIRY=none
  [[ -n "$cert_dir" ]] && CERT_EXPIRY=$(openssl x509 -in "$cert_dir/fullchain.pem" -noout -enddate 2>/dev/null | cut -d= -f2-)
  RETRY_AT=none
  if [[ -f "$RETRY_FILE" ]] && [[ "$(cat "$RETRY_FILE")" =~ ^[0-9]+$ ]]; then RETRY_AT=$(date -u -d "@$(cat "$RETRY_FILE")" '+%F %T UTC'); fi
  printf 'domain=%s\ncertificate=%s\ncert_expires=%s\nretry_after=%s\nvhost=%s\ndns_a=%s\ndns_aaaa=%s\nserver_ips=%s\ndns_matches_server=%s\n' "$DOMAIN" "${cert_dir:-none}" "$CERT_EXPIRY" "$RETRY_AT" "$([[ -f "$VHOST" ]] && echo present || echo missing)" "${A_RECORDS:-none}" "${AAAA_RECORDS:-none}" "${SERVER_IPS:-unknown}" "$DNS_MATCH"
  exit 0
fi
BACKUP=""
[[ ! -f "$VHOST" ]] || { BACKUP="/var/backups/vvsm/vvsm-sub-$(date -u +%Y%m%dT%H%M%SZ).conf"; cp -a "$VHOST" "$BACKUP"; }
write_vhost() {
  local cert="$1" mode="http"
  [[ -n "$cert" ]] && mode="https"
  cat > "$VHOST" <<EOF
# Managed by VVSM subscription TLS
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  include /etc/vvsm/nginx-routes.conf;
  location / {
EOF
  if [[ "$mode" == https ]]; then
    printf '    return 301 https://$host$request_uri;\n' >> "$VHOST"
  else
    cat >> "$VHOST" <<EOF
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
EOF
  fi
  cat >> "$VHOST" <<EOF
  }
}
EOF
  if [[ "$mode" == https ]]; then
    cat >> "$VHOST" <<EOF
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name $DOMAIN;
  ssl_certificate $cert/fullchain.pem;
  ssl_certificate_key $cert/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 10m;
  include /etc/vvsm/nginx-routes.conf;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  fi
  ln -sf "$VHOST" "$LINK"
  if ! nginx -t; then
    if [[ -n "$BACKUP" ]]; then cp -a "$BACKUP" "$VHOST"; else rm -f "$VHOST" "$LINK"; fi
    echo 'Nginx validation failed; old vhost restored' >&2
    exit 1
  fi
  systemctl reload nginx || systemctl restart nginx
}
write_vhost "$cert_dir"
if [[ -n "$cert_dir" ]]; then
  printf '%s\n' "$cert_dir" > /etc/vvsm/subscription-cert-dir
  chmod 644 /etc/vvsm/subscription-cert-dir
  echo "Reused an existing valid certificate for $DOMAIN; HTTPS is enabled. No new certificate requested."
  exit 0
fi
mapfile -t A_RECORDS < <(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u)
mapfile -t AAAA_RECORDS < <(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u)
mapfile -t SERVER_IPS < <( { curl -fs4 -m 5 https://api.ipify.org 2>/dev/null || true; curl -fs4 -m 5 https://ifconfig.me/ip 2>/dev/null || true; ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'; hostname -I 2>/dev/null | tr ' ' '\n'; } | awk 'NF' | sort -u)
DNS_MATCH=false
for a in "${A_RECORDS[@]}"; do for s in "${SERVER_IPS[@]}"; do [[ "$a" == "$s" ]] && DNS_MATCH=true; done; done
if [[ ${#A_RECORDS[@]} -eq 0 ]]; then
  echo "DNS A record missing for $DOMAIN. HTTP vhost is active; no ACME request was made." >&2
  exit 1
fi
if [[ "$DNS_MATCH" != true ]]; then
  echo "Warning: $DOMAIN A=${A_RECORDS[*]} does not match detected server IPs=${SERVER_IPS[*]:-unknown}. This can be a CDN proxy or NAT. For direct ACME use DNS-only (grey cloud) pointing to this server; port 80 must reach Nginx." >&2
  if [[ "$MODE" == activate ]]; then
    echo "Running Let's Encrypt staging preflight before any production request..." >&2
    if ! certbot certonly --webroot -w /var/www/html --cert-name "$DOMAIN" -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --dry-run > /tmp/vvsm-sub-acme-preflight.log 2>&1; then
      tail -n 18 /tmp/vvsm-sub-acme-preflight.log >&2
      echo "Staging preflight failed; production certificate was NOT requested." >&2
      exit 1
    fi
  fi
fi
if [[ ${#AAAA_RECORDS[@]} -gt 0 ]]; then echo "Note: AAAA records present (${AAAA_RECORDS[*]}). If IPv6 does not terminate on this server, ACME may choose it and fail; remove/fix AAAA or serve HTTPS on IPv6." >&2; fi
if [[ -f "$RETRY_FILE" ]] && [[ "$(cat "$RETRY_FILE")" =~ ^[0-9]+$ ]] && (( $(cat "$RETRY_FILE") > $(date +%s) )); then
  echo "ACME retry is blocked until $(date -u -d "@$(cat "$RETRY_FILE")" '+%F %T UTC'). Existing HTTP vhost remains active." >&2
  exit 1
fi
LOG="$(mktemp /tmp/vvsm-sub-acme-XXXXXXXX)"
trap 'rm -f "$LOG"' EXIT
CMD=(certbot certonly --webroot -w /var/www/html --cert-name "$DOMAIN" -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --keep-until-expiring)
[[ "$MODE" == test ]] && CMD+=(--dry-run)
if ! "${CMD[@]}" > "$LOG" 2>&1; then
  # Certbot/Let's Encrypt provides an exact retry timestamp on rate-limit errors.
  WHEN="$(grep -oE 'retry after [0-9-]+ [0-9:]+ UTC' "$LOG" | tail -n1 | sed 's/^retry after //')"
  if [[ -n "$WHEN" ]]; then date -u -d "$WHEN" +%s > "$RETRY_FILE"; fi
  tail -n 18 "$LOG" >&2
  echo 'Certificate request failed; HTTP vhost stays available. Do not repeat the request until the reported retry time.' >&2
  exit 1
fi
if [[ "$MODE" == test ]]; then
  echo 'Staging ACME validation passed. No production certificate was issued. Run activate explicitly to enable HTTPS.'
  exit 0
fi
cert_dir="$(find_cert || true)"
[[ -n "$cert_dir" ]] || { echo 'Certbot returned success but no valid certificate was found; HTTP remains active.' >&2; exit 1; }
write_vhost "$cert_dir"
printf '%s\n' "$cert_dir" > /etc/vvsm/subscription-cert-dir
chmod 644 /etc/vvsm/subscription-cert-dir
rm -f "$RETRY_FILE"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/vvsm-sub.sh <<'HOOK'
#!/usr/bin/env bash
nginx -t && systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/vvsm-sub.sh
printf 'HTTPS ready: https://%s/ (certificate: %s)\n' "$DOMAIN" "$cert_dir"
