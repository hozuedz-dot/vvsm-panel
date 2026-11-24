#!/usr/bin/env bash
# ============================================================================
#  VVSM VPN panel — full installer (Debian 11/12, Ubuntu 20.04/22.04/24.04)
#
#  Installs: Node.js, PostgreSQL, Nginx + Let's Encrypt, the panel itself and
#  the real protocol cores:
#     Xray-core  (VLESS · VMess · Trojan · REALITY · XHTTP)
#     Hysteria 2 (QUIC)            WireGuard (kernel)         OpenVPN
#     Psiphon tunnel-core (upstream chain, needs your own Psiphon IDs)
#
#  Usage:  sudo bash install.sh [options]
#     --domain  vvsm.online        panel / subscription domain (A record must point here)
#     --email   you@example.com    e-mail for Let's Encrypt
#     --admin-user admin           first admin username
#     --admin-pass '...'           first admin password (random if omitted)
#     --port 3000                  internal panel port (Nginx proxies to it)
#     --demo                       seed realistic demo data (off by default)
#     --no-ssl                     skip Let's Encrypt (self-signed certs for cores)
#     --skip-cores                 install only panel + nginx + postgres
# ============================================================================
set -Eeuo pipefail

DOMAIN="vvsm.online"
EMAIL=""
ADMIN_USER="admin"
ADMIN_PASS=""
PANEL_PORT=3000
INSTALL_DIR="/opt/vvsm"
CONF_DIR="/etc/vvsm"
SEED_DEMO="false"
USE_SSL="true"
SKIP_CORES="false"
NODE_MAJOR=22
REPO_URL="${VVSM_REPO:-https://github.com/hozuedz-dot/vvsm-vpn.git}"
REPO_BRANCH="${VVSM_BRANCH:-main}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo /nonexistent)"

c_ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
c_info() { printf '\033[1;34m➜\033[0m %s\n' "$*"; }
c_warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
c_err() { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; }
CURRENT_STEP="startup"
BUILD_LOG="/var/log/vvsm-build.log"
on_install_error() {
  local code=$?
  trap - ERR
  c_err "Installer failed (exit ${code}) at line ${BASH_LINENO[0]:-${LINENO}} during step: ${CURRENT_STEP}."
  if [[ -s "$BUILD_LOG" ]]; then
    echo "----- last lines of ${BUILD_LOG} -----" >&2
    tail -n 60 "$BUILD_LOG" >&2 || true
    echo "--------------------------------------" >&2
  fi
  exit "$code"
}
trap on_install_error ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
    --port) PANEL_PORT="$2"; shift 2 ;;
    --demo) SEED_DEMO="true"; shift ;;
    --no-ssl) USE_SSL="false"; shift ;;
    --skip-cores) SKIP_CORES="true"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) c_err "Unknown option: $1"; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { c_err "Run as root: sudo bash install.sh"; exit 1; }
command -v apt-get >/dev/null || { c_err "Only Debian/Ubuntu (apt) are supported by this installer."; exit 1; }
# One-line install from GitHub:  bash <(curl -fsSL https://raw.githubusercontent.com/hozuedz-dot/vvsm-vpn/main/install.sh) --domain example.com
if [[ ! -f "$SRC_DIR/package.json" || ! -f "$SRC_DIR/src/lib/cores.ts" ]]; then
  c_info "Fetching VVSM source from ${REPO_URL} (${REPO_BRANCH})…"
  apt-get update -y >/dev/null && apt-get install -y git ca-certificates >/dev/null
  SRC_DIR="/opt/vvsm-src"
  if [[ -d "$SRC_DIR/.git" ]]; then git -C "$SRC_DIR" fetch --depth 1 origin "$REPO_BRANCH" && git -C "$SRC_DIR" reset --hard "origin/$REPO_BRANCH";
  else rm -rf "$SRC_DIR"; git clone --depth 1 -b "$REPO_BRANCH" "$REPO_URL" "$SRC_DIR"; fi
  [[ -f "$SRC_DIR/src/lib/cores.ts" ]] || { c_err "Repository is incomplete (src/lib missing). Push the full project with git (web upload stops at 100 files)."; exit 1; }
fi
[[ -n "$EMAIL" ]] || EMAIL="admin@${DOMAIN}"
ARCH="$(uname -m)"
export DEBIAN_FRONTEND=noninteractive

# ----------------------------------------------------------------------------
step_packages() {
  c_info "Installing system packages…"
  apt-get update -y
  apt-get install -y curl wget ca-certificates gnupg lsb-release unzip jq openssl rsync cron \
    nginx certbot postgresql postgresql-contrib gnupg \
    iptables iproute2 net-tools
  c_ok "Packages installed"
}

step_node() {
  local cur="0.0.0"
  command -v node >/dev/null && cur="$(node -v | sed 's/^v//')"
  # Next.js 16 requires Node >= 20.9.0. A bare "major >= 20" check is not enough:
  # Node 20.0–20.8 gets through and then fails during the production build.
  if [[ "$(printf '%s\n%s\n' "20.9.0" "$cur" | sort -V | head -n1)" != "20.9.0" ]]; then
    c_info "Installing Node.js ${NODE_MAJOR} (found ${cur})…"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  c_ok "Node.js $(node -v), npm $(npm -v)"
}

step_sysctl() {
  c_info "Enabling IP forwarding, BBR and UDP buffers…"
  cat > /etc/sysctl.d/99-vvsm.conf <<'EOF'
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.ipv4.tcp_fastopen=3
net.core.rmem_max=26214400
net.core.wmem_max=26214400
EOF
  sysctl --system >/dev/null 2>&1 || true
  # NAT for WireGuard (10.66.0.0/16) and OpenVPN (10.77.0.0/16) clients
  install -m 755 "$SRC_DIR/scripts/vvsm-nat.sh" /usr/local/sbin/vvsm-nat
  chmod +x /usr/local/sbin/vvsm-nat
  cat > /etc/systemd/system/vvsm-nat.service <<'EOF'
[Unit]
Description=VVSM NAT rules for WireGuard/OpenVPN clients
After=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/vvsm-nat start
ExecStop=/usr/local/sbin/vvsm-nat stop
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now vvsm-nat.service >/dev/null 2>&1 || true
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
    sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw || true
    ufw reload >/dev/null || true
    c_ok "UFW rules for 22/80/443 added (core ports are opened automatically by the panel)"
  fi
}

step_postgres() {
  c_info "Configuring PostgreSQL…"
  systemctl enable --now postgresql
  if [[ -f "$INSTALL_DIR/.env" ]] && grep -q '^DATABASE_URL=' "$INSTALL_DIR/.env"; then
    DATABASE_URL="$(grep '^DATABASE_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
    c_ok "Re-using existing database settings"
    return
  fi
  local pass; pass="$(openssl rand -hex 16)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_roles WHERE rolname='vvsm'" | grep -q 1 \
    && sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE vvsm WITH LOGIN PASSWORD '${pass}'" >/dev/null \
    || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE vvsm WITH LOGIN PASSWORD '${pass}'" >/dev/null
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='vvsm'" | grep -q 1 \
    || sudo -u postgres createdb -O vvsm vvsm
  DATABASE_URL="postgresql://vvsm:${pass}@127.0.0.1:5432/vvsm"
  c_ok "Database 'vvsm' ready"
}

step_files() {
  c_info "Deploying panel files to ${INSTALL_DIR}…"
  mkdir -p "$INSTALL_DIR" "$CONF_DIR" "$CONF_DIR/certs" "$CONF_DIR/openvpn" /var/log/openvpn /var/lib/vvsm /var/backups/vvsm
  rsync -a --delete --exclude node_modules --exclude .next --exclude .env --exclude data --exclude .git \
    --exclude 'apps/*/node_modules' "$SRC_DIR/" "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR"/install.sh "$INSTALL_DIR"/update.sh "$INSTALL_DIR"/uninstall.sh 2>/dev/null || true
  [[ -f "$CONF_DIR/nginx-routes.conf" ]] || echo "# generated by VVSM" > "$CONF_DIR/nginx-routes.conf"

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    [[ -n "$ADMIN_PASS" ]] || ADMIN_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)Aa1"
    local scheme="https"; [[ "$USE_SSL" == "true" ]] || scheme="http"
    cat > "$INSTALL_DIR/.env" <<EOF
NODE_ENV=production
PORT=${PANEL_PORT}
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=$(openssl rand -hex 32)
PANEL_DOMAIN=${DOMAIN}
CERTBOT_EMAIL=${EMAIL}
PUBLIC_URL=${scheme}://${DOMAIN}
COOKIE_SECURE=$([[ "$scheme" == "https" ]] && echo true || echo false)
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD='${ADMIN_PASS}'
SEED_DEMO=${SEED_DEMO}
EOF
    chmod 600 "$INSTALL_DIR/.env"
    NEW_ADMIN="true"
  else
    NEW_ADMIN="false"
    ADMIN_PASS="(unchanged — existing installation)"
    c_ok "Existing .env kept"
  fi
  # Safety: a deployed server ALWAYS requires real login, even if installed in a sandbox.
  sed -i '/^PREVIEW_NO_LOGIN=/d' "$INSTALL_DIR/.env"
  printf 'PREVIEW_NO_LOGIN=false\n' >> "$INSTALL_DIR/.env"
  cat > "$INSTALL_DIR/drizzle.config.json" <<EOF
{ "dialect": "postgresql", "schema": "./src/db/schema.ts", "dbCredentials": { "url": "${DATABASE_URL}" } }
EOF
  c_ok "Files deployed"
}

step_build() {
  c_info "Installing npm dependencies and building the panel (a few minutes)…"
  cd "$INSTALL_DIR"
  mkdir -p /var/log
  : > "$BUILD_LOG"
  chmod 600 "$BUILD_LOG" 2>/dev/null || true
  local avail_kb=0
  avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  c_info "Build environment: Node $(node -v), npm $(npm -v), available RAM $(( ${avail_kb:-0} / 1024 )) MB, free disk $(df -Pm "$INSTALL_DIR" | awk 'NR==2 {print $4}') MB (full log: $BUILD_LOG)"
  if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  npx drizzle-kit push --force

  # Keep the build quiet on memory and make failures diagnosable. Turbopack is
  # tried first; only a crash/OOM/Turbopack-specific failure falls back to webpack.
  export NEXT_TELEMETRY_DISABLED=1
  local heap_mb=0
  if (( avail_kb > 0 && avail_kb < 2097152 )); then heap_mb=1024;
  elif (( avail_kb >= 2097152 && avail_kb < 4194304 )); then heap_mb=2048; fi
  if (( heap_mb > 0 )); then export NODE_OPTIONS="--max-old-space-size=${heap_mb}"; fi

  local build_status=0
  npm run build 2>&1 | tee -a "$BUILD_LOG" || build_status=${PIPESTATUS[0]}
  if [[ $build_status -ne 0 ]]; then
    c_warn "Production build failed (exit ${build_status}). Last build output:"
    tail -n 60 "$BUILD_LOG" >&2 || true
    if [[ $build_status -eq 137 ]] || grep -Eqi 'JavaScript heap out of memory|ERR_WORKER_OUT_OF_MEMORY|worker.*(died|killed)|Turbopack.*(panic|error)|Killed' "$BUILD_LOG"; then
      c_warn "Retrying once with the webpack builder (lower memory / no Turbopack)…"
      build_status=0
      npx next build --webpack 2>&1 | tee -a "$BUILD_LOG" || build_status=${PIPESTATUS[0]}
    fi
  fi
  if [[ $build_status -ne 0 ]]; then
    c_err "Panel build failed (exit ${build_status}). Full log: $BUILD_LOG"
    c_err "Common causes: Node < 20.9, less than ~2 GB free RAM during build, full disk, or npm registry/network errors in the log above."
    return "$build_status"
  fi
  c_ok "Panel built"
}

step_xray() {
  c_info "Installing Xray-core (official release, SHA-256 verified)…"
  install -m 755 "$INSTALL_DIR/scripts/vvsm-core.sh" /usr/local/sbin/vvsm-core
  VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install xray
  c_ok "Xray-core $(xray version | head -1 | awk '{print $2}')"
}

step_hysteria() {
  c_info "Installing Hysteria 2 (official release, SHA-256 verified)…"
  VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install hysteria || { c_warn "Hysteria2 install failed — retry later in Admin → Protocols → Cores"; return 0; }
  c_ok "Hysteria 2 installed"
}

step_awg() {
  c_info "Installing AmneziaWG (userspace WireGuard with DPI obfuscation, built from official source)…"
  VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install awg || { c_warn "AmneziaWG install failed — retry later in Admin → Protocols → Cores"; return 0; }
  systemctl disable --now wg-quick@wg0 >/dev/null 2>&1 || true
  c_ok "AmneziaWG installed"
}

step_openvpn() {
  c_info "Installing OpenVPN from the official OpenVPN repository…"
  VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install openvpn || c_warn "OpenVPN install failed"
  c_info "Preparing OpenVPN PKI…"
  local d="$CONF_DIR/openvpn"
  if [[ ! -f "$d/ca.crt" ]]; then
    openssl ecparam -name prime256v1 -genkey -noout -out "$d/ca.key"
    openssl req -new -x509 -key "$d/ca.key" -sha256 -days 3650 -subj "/CN=VVSM CA" -out "$d/ca.crt"
    openssl ecparam -name prime256v1 -genkey -noout -out "$d/server.key"
    openssl req -new -key "$d/server.key" -subj "/CN=vvsm-server" -out "$d/server.csr"
    printf 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyAgreement\nextendedKeyUsage=serverAuth\n' > "$d/ext.cnf"
    openssl x509 -req -in "$d/server.csr" -CA "$d/ca.crt" -CAkey "$d/ca.key" -CAcreateserial -out "$d/server.crt" -days 3650 -sha256 -extfile "$d/ext.cnf"
    openvpn --genkey tls-crypt "$d/tc.key" 2>/dev/null || openvpn --genkey secret "$d/tc.key" 2>/dev/null || openvpn --genkey --secret "$d/tc.key"
    rm -f "$d/server.csr" "$d/ext.cnf"
    chmod 600 "$d"/*.key
  fi
  mkdir -p /etc/openvpn/server
  c_ok "OpenVPN PKI ready (auth is checked against the panel database)"
}

step_psiphon() {
  c_info "Installing Psiphon tunnel-core (official binaries)…"
  VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install psiphon || { c_warn "Psiphon download failed — retry later in Admin → Protocols → Cores"; return 0; }
  c_ok "Psiphon installed — enable it in Admin → Protocols → Psiphon (public network preset is filled in)"
}

step_cert_selfsigned() {
  if [[ ! -f "$CONF_DIR/certs/fullchain.pem" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}" -keyout "$CONF_DIR/certs/privkey.pem" -out "$CONF_DIR/certs/fullchain.pem" 2>/dev/null
    chmod 600 "$CONF_DIR/certs/privkey.pem"
  fi
}

step_service() {
  c_info "Creating systemd service for the panel…"
  cat > /etc/systemd/system/vvsm-panel.service <<EOF
[Unit]
Description=VVSM VPN panel
After=network-online.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=$(command -v node) ${INSTALL_DIR}/node_modules/next/dist/bin/next start -p ${PANEL_PORT} -H 127.0.0.1
Restart=always
RestartSec=3
User=root
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable vvsm-panel >/dev/null 2>&1
  systemctl restart vvsm-panel
  c_info "Waiting for the panel to come up…"
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/health" >/dev/null 2>&1 && { c_ok "Panel is healthy"; return; }
    sleep 2
  done
  c_warn "Panel did not report healthy yet — check: journalctl -u vvsm-panel -n 100"
}

nginx_http2_directive() {
  local v; v="$(nginx -v 2>&1 | sed -n 's/.*nginx\/\([0-9.]*\).*/\1/p')"
  if [[ "$(printf '%s\n1.25.1\n' "$v" | sort -V | head -1)" == "1.25.1" ]]; then echo "http2 on;"; else echo ""; fi
}

write_nginx() {
  local mode="$1" h2 listen443="listen 443 ssl;" listen443v6="listen [::]:443 ssl;"
  h2="$(nginx_http2_directive)"
  [[ -z "$h2" ]] && { listen443="listen 443 ssl http2;"; listen443v6="listen [::]:443 ssl http2;"; }
  rm -f /etc/nginx/sites-enabled/default
  if [[ "$mode" == "http" ]]; then
    cat > /etc/nginx/sites-available/vvsm.conf <<EOF
server {
  listen 80; listen [::]:80;
  server_name ${DOMAIN};
  location /.well-known/acme-challenge/ { root /var/www/html; }
  include ${CONF_DIR}/nginx-routes.conf;
  location / {
    proxy_pass http://127.0.0.1:${PANEL_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  else
    cat > /etc/nginx/sites-available/vvsm.conf <<EOF
server {
  listen 80; listen [::]:80;
  server_name ${DOMAIN};
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://\$host\$request_uri; }
}
server {
  ${listen443}
  ${listen443v6}
  ${h2}
  server_name ${DOMAIN};
  ssl_certificate ${CONF_DIR}/certs/fullchain.pem;
  ssl_certificate_key ${CONF_DIR}/certs/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_timeout 1d;
  ssl_session_cache shared:SSL:10m;
  add_header Strict-Transport-Security "max-age=31536000" always;
  client_max_body_size 10m;
  include ${CONF_DIR}/nginx-routes.conf;
  location / {
    proxy_pass http://127.0.0.1:${PANEL_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  fi
  ln -sf /etc/nginx/sites-available/vvsm.conf /etc/nginx/sites-enabled/vvsm.conf
  nginx -t
  systemctl enable nginx >/dev/null 2>&1
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
}

step_nginx_ssl() {
  c_info "Configuring Nginx (and TLS if enabled)…"
  mkdir -p /var/www/html
  write_nginx http
  if [[ "$USE_SSL" == "true" ]]; then
    # Reuse any currently valid Let's Encrypt certificate for this hostname.
    # Never request a new certificate just because install.sh was rerun.
    for existing in /etc/letsencrypt/live/*/fullchain.pem; do
      [[ -f "$existing" ]] || continue
      if openssl x509 -in "$existing" -noout -checkend 0 -checkhost "$DOMAIN" >/dev/null 2>&1 && [[ -f "$(dirname "$existing")/privkey.pem" ]]; then
        cp -L "$existing" "$CONF_DIR/certs/fullchain.pem"
        cp -L "$(dirname "$existing")/privkey.pem" "$CONF_DIR/certs/privkey.pem"
        chmod 600 "$CONF_DIR/certs/privkey.pem"
        write_nginx https
        HTTPS_OK="true"
        c_ok "Reused an existing valid certificate for ${DOMAIN}; no new ACME order was placed"
        return
      fi
    done
    if certbot certonly --webroot -w /var/www/html -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --keep-until-expiring; then
      cp -L "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "$CONF_DIR/certs/fullchain.pem"
      cp -L "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "$CONF_DIR/certs/privkey.pem"
      chmod 600 "$CONF_DIR/certs/privkey.pem"
      mkdir -p /etc/letsencrypt/renewal-hooks/deploy
      cat > /etc/letsencrypt/renewal-hooks/deploy/vvsm.sh <<EOF
#!/usr/bin/env bash
cp -L /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ${CONF_DIR}/certs/fullchain.pem
cp -L /etc/letsencrypt/live/${DOMAIN}/privkey.pem ${CONF_DIR}/certs/privkey.pem
chmod 600 ${CONF_DIR}/certs/privkey.pem
systemctl reload nginx; systemctl restart xray hysteria-server 2>/dev/null || true
EOF
      chmod +x /etc/letsencrypt/renewal-hooks/deploy/vvsm.sh
      write_nginx https
      HTTPS_OK="true"
      c_ok "HTTPS enabled for ${DOMAIN} (auto-renewal via certbot)"
      return
    fi
    c_warn "Let's Encrypt failed (is the DNS A record of ${DOMAIN} pointing to this server and port 80 open?)."
    c_warn "Falling back to HTTP + self-signed certificates for the cores. Fix DNS/ACME and Nginx configuration separately; do NOT rerun the full installer on an existing server."
    sed -i 's|^PUBLIC_URL=.*|PUBLIC_URL=http://'"${DOMAIN}"'|; s|^COOKIE_SECURE=.*|COOKIE_SECURE=false|' "$INSTALL_DIR/.env"
    systemctl restart vvsm-panel
  fi
  step_cert_selfsigned
}

install_cli() {
  cat > /usr/local/bin/vvsm <<'EOF'
#!/usr/bin/env bash
# VVSM management CLI
D=/opt/vvsm
case "${1:-help}" in
  status)  systemctl --no-pager status vvsm-panel xray hysteria-server awg-quick@awg0 openvpn-server@vvsm vvsm-psiphon nginx postgresql 2>/dev/null | grep -E '^(●|○|×)|Active:' ;;
  restart) systemctl restart vvsm-panel nginx xray hysteria-server 2>/dev/null; echo restarted ;;
  logs)    journalctl -u "${2:-vvsm-panel}" -n 200 -f ;;
  update)  cd "${2:-$D}" && bash update.sh ;;
  update-geo)   bash $D/scripts/update-geo.sh ;;
  update-cores) bash $D/scripts/update-cores.sh ;;
  reset-admin)  cd $D && node scripts/reset-admin.mjs "${2:?usage: vvsm reset-admin NEW_PASSWORD}" ;;
  backup)  mkdir -p /var/backups/vvsm && . $D/.env && pg_dump --dbname "$DATABASE_URL" -Fc -f /var/backups/vvsm/manual-$(date +%F-%H%M).dump && echo "saved in /var/backups/vvsm" ;;
  uninstall) bash $D/uninstall.sh ;;
  info)    . $D/.env; echo "Panel: $PUBLIC_URL/admin   (admin user: $ADMIN_USERNAME)"; echo "Install dir: $D   Config dir: /etc/vvsm" ;;
  *) echo "vvsm {status|restart|logs [unit]|update|update-geo|update-cores|reset-admin PASS|backup|info|uninstall}" ;;
esac
EOF
  chmod +x /usr/local/bin/vvsm
}

# ----------------------------------------------------------------------------
HTTPS_OK="false"
DATABASE_URL=""
NEW_ADMIN="true"
echo "=============================================================="
echo "  VVSM panel installer — domain: ${DOMAIN}"
echo "=============================================================="
CURRENT_STEP="system packages"; step_packages
CURRENT_STEP="Node.js runtime"; step_node
CURRENT_STEP="kernel/network settings"; step_sysctl
CURRENT_STEP="PostgreSQL"; step_postgres
CURRENT_STEP="deploy panel files"; step_files
CURRENT_STEP="npm dependencies, database schema and production build"; step_build
if [[ "$SKIP_CORES" != "true" ]]; then
  CURRENT_STEP="Xray-core"; step_xray
  CURRENT_STEP="Hysteria 2"; step_hysteria
  CURRENT_STEP="AmneziaWG"; step_awg
  CURRENT_STEP="OpenVPN PKI"; step_openvpn
  CURRENT_STEP="Psiphon"; step_psiphon
fi
CURRENT_STEP="self-signed core certificate"; step_cert_selfsigned
CURRENT_STEP="panel systemd service"; step_service
CURRENT_STEP="Nginx and TLS"; step_nginx_ssl
CURRENT_STEP="management CLI"; install_cli

SCHEME="http"; [[ "$HTTPS_OK" == "true" ]] && SCHEME="https"
echo
echo "=============================================================="
c_ok "VVSM is installed"
echo "  Public site : ${SCHEME}://${DOMAIN}/"
echo "  Admin panel : ${SCHEME}://${DOMAIN}/admin"
if [[ "$NEW_ADMIN" == "true" ]]; then
  echo "  Admin login : ${ADMIN_USER}  /  ${ADMIN_PASS}"
  echo "  (saved in ${INSTALL_DIR}/.env — change it after first login and enable 2FA)"
fi
echo
echo "  Next steps:"
echo "   1. Admin → Payments → enter your NOWPayments keys or USDT-TRC20 wallet, disable test mode"
echo "   2. Admin → Notifications → connect your Telegram bot"
echo "   3. Admin → Nodes → add remote servers (one-line install command per node)"
echo "   4. Open the ports of your inbounds in the provider firewall (UDP: 4443, 51820, 1194)"
echo "   5. Manage everything with the 'vvsm' command (vvsm status | logs | update | reset-admin)"
echo "=============================================================="
