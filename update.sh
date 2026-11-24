#!/usr/bin/env bash
# ============================================================================
#  VVSM panel updater
#    vvsm update                      → pull latest code from GitHub and update
#    sudo bash update.sh              → update from the files next to this script
#  Env: VVSM_REPO, VVSM_BRANCH, VVSM_GITHUB_TOKEN (private repo), VVSM_NO_PULL=1,
#       VVSM_SKIP_BACKUP=1
# ============================================================================
set -Eeuo pipefail
INSTALL_DIR="/opt/vvsm"
SRC_CHECKOUT="/opt/vvsm-src"
REPO_URL="${VVSM_REPO:-https://github.com/hozuedz-dot/vvsm-vpn.git}"
BRANCH="${VVSM_BRANCH:-main}"
ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[1;34m➜\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "update failed at line $LINENO (see messages above). The running panel was not stopped."' ERR

[[ $EUID -eq 0 ]] || die "run as root: sudo vvsm update"
[[ -f "$INSTALL_DIR/.env" ]] || die "VVSM is not installed — run install.sh first"

# ---------------------------------------------------------------- stage 1
# Never run from a directory that is about to be overwritten (bash reads scripts lazily).
if [[ "${VVSM_UPDATE_STAGE:-1}" == "1" ]]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo /nonexistent)"
  if [[ "${VVSM_NO_PULL:-}" != "1" && ( "$SRC" == "$INSTALL_DIR" || ! -f "$SRC/package.json" ) ]]; then
    command -v git >/dev/null || apt-get install -y git >/dev/null
    URL="$REPO_URL"
    [[ -n "${VVSM_GITHUB_TOKEN:-}" ]] && URL="${REPO_URL/https:\/\//https://${VVSM_GITHUB_TOKEN}@}"
    info "Fetching latest code from ${REPO_URL} (${BRANCH})…"
    if [[ -d "$SRC_CHECKOUT/.git" ]]; then
      git -C "$SRC_CHECKOUT" remote set-url origin "$URL"
      if GIT_TERMINAL_PROMPT=0 git -C "$SRC_CHECKOUT" fetch --depth 1 origin "$BRANCH" 2>/tmp/vvsm-git.err; then
        git -C "$SRC_CHECKOUT" reset --hard "origin/$BRANCH" >/dev/null; SRC="$SRC_CHECKOUT"
      else warn "git fetch failed: $(tail -1 /tmp/vvsm-git.err). Private repo? export VVSM_GITHUB_TOKEN=<token>. Updating from local files instead."; fi
    else
      rm -rf "$SRC_CHECKOUT.tmp"
      if GIT_TERMINAL_PROMPT=0 git clone --depth 1 -b "$BRANCH" "$URL" "$SRC_CHECKOUT.tmp" 2>/tmp/vvsm-git.err; then
        rm -rf "$SRC_CHECKOUT"; mv "$SRC_CHECKOUT.tmp" "$SRC_CHECKOUT"; SRC="$SRC_CHECKOUT"
      else warn "git clone failed: $(tail -1 /tmp/vvsm-git.err). Private repo? export VVSM_GITHUB_TOKEN=<token>. Updating from local files instead."; fi
    fi
    git -C "$SRC_CHECKOUT" remote set-url origin "$REPO_URL" 2>/dev/null || true   # do not keep the token on disk
  fi
  [[ -f "$SRC/src/lib/cores.ts" ]] || SRC="$INSTALL_DIR"
  # run the (possibly newer) updater from a copy outside the install dir
  cp "$SRC/update.sh" /tmp/vvsm-update-stage2.sh
  VVSM_UPDATE_STAGE=2 VVSM_UPDATE_SRC="$SRC" exec bash /tmp/vvsm-update-stage2.sh "$@"
fi

# ---------------------------------------------------------------- stage 2
SRC_DIR="${VVSM_UPDATE_SRC:-$INSTALL_DIR}"
set -a; . "$INSTALL_DIR/.env"; set +a

if [[ "${VVSM_SKIP_BACKUP:-}" != "1" ]]; then
  info "Backing up the database…"
  mkdir -p /var/backups/vvsm
  pg_dump --dbname "$DATABASE_URL" -Fc -f "/var/backups/vvsm/pre-update-$(date +%F-%H%M).dump" || die "database backup failed (set VVSM_SKIP_BACKUP=1 to skip)"
fi

if [[ "$SRC_DIR" != "$INSTALL_DIR" ]]; then
  info "Syncing files from $SRC_DIR…"
  rsync -a --delete --exclude node_modules --exclude .next --exclude .env --exclude data --exclude .git \
    --exclude drizzle.config.json --exclude 'apps/*/node_modules' "$SRC_DIR/" "$INSTALL_DIR/"
fi
cd "$INSTALL_DIR"
sed -i '/^PREVIEW_NO_LOGIN=/d' .env && printf 'PREVIEW_NO_LOGIN=false\n' >> .env   # a server must require login
chmod +x scripts/*.sh install.sh update.sh uninstall.sh 2>/dev/null || true
NODE_CUR="$(node -v 2>/dev/null | sed 's/^v//' || echo 0.0.0)"
[[ "$(printf '%s\n%s\n' "20.9.0" "$NODE_CUR" | sort -V | head -n1)" == "20.9.0" ]] || die "Node.js >= 20.9 required (found ${NODE_CUR})"

info "Installing dependencies…"
if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund >/var/log/vvsm-npm.log 2>&1 || { tail -30 /var/log/vvsm-npm.log; die "npm ci failed"; }
else npm install --no-audit --no-fund >/var/log/vvsm-npm.log 2>&1 || { tail -30 /var/log/vvsm-npm.log; die "npm install failed"; }; fi
info "Migrating the database schema…"
# --force: non-interactive (no TTY under systemd/ssh pipes); the schema only adds columns
npx drizzle-kit push --force >/var/log/vvsm-migrate.log 2>&1 || { tail -30 /var/log/vvsm-migrate.log; die "database migration failed"; }

info "Building (a few minutes)…"
BUILD_LOG="/var/log/vvsm-build.log"
export NEXT_TELEMETRY_DISABLED=1
avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
(( avail_kb > 0 && avail_kb < 2097152 )) && export NODE_OPTIONS="--max-old-space-size=1024"
build_status=0
npm run build >"$BUILD_LOG" 2>&1 || build_status=$?
if [[ $build_status -ne 0 ]] && grep -Eqi 'heap out of memory|ERR_WORKER_OUT_OF_MEMORY|Killed|Turbopack' "$BUILD_LOG"; then
  warn "Retrying with webpack (lower memory)…"; build_status=0
  npx next build --webpack >>"$BUILD_LOG" 2>&1 || build_status=$?
fi
if [[ $build_status -ne 0 ]]; then tail -n 40 "$BUILD_LOG" >&2; die "build failed — the running panel was NOT restarted (log: $BUILD_LOG)"; fi

# keep helper scripts in sync
install -m 755 scripts/vvsm-core.sh /usr/local/sbin/vvsm-core
install -m 755 scripts/vvsm-nat.sh /usr/local/sbin/vvsm-nat
# make sure every core is installed from the official, verified sources (missing ones only; use the panel for updates)
command -v awg >/dev/null && command -v amneziawg-go >/dev/null || VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install awg || warn "AmneziaWG install failed — retry in Admin → Protocols → Cores"
command -v hysteria >/dev/null || VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install hysteria || warn "Hysteria install failed"
command -v psiphon-tunnel-core >/dev/null || vvsm-core install psiphon || warn "Psiphon install failed"
[[ -f "$INSTALL_DIR/data/cache/amneziawg-go-linux-amd64" ]] || VVSM_CACHE="$INSTALL_DIR/data/cache" vvsm-core install awg >/dev/null 2>&1 || true
if [[ -f /etc/openvpn/server/vvsm.conf ]]; then sed -i 's#ovpn-auth.sh via-env#ovpn-auth.sh via-file#; /^ecdh-curve/d; /^persist-key/d' /etc/openvpn/server/vvsm.conf; fi

systemctl restart vvsm-panel
sleep 4
if systemctl is-active --quiet vvsm-panel; then ok "VVSM updated — open the panel and press Apply"; else journalctl -u vvsm-panel -n 30 --no-pager; die "panel did not start"; fi
rm -f /tmp/vvsm-update-stage2.sh
