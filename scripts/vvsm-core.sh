#!/usr/bin/env bash
# ============================================================================
#  vvsm-core — install / update VPN cores from their OFFICIAL sources with
#  checksum verification. Used on the panel server AND on every node/tunnel server.
#
#    vvsm-core install|update <xray|hysteria|awg|openvpn|psiphon|all>
#    vvsm-core verify <core|all>     download + verify only (no changes)
#    vvsm-core version <core>
#
#  Sources
#    Xray       github.com/XTLS/Xray-core releases           (SHA2-256 from .dgst)
#    Hysteria2  github.com/HyNetworks/hysteria (apernet)      (SHA-256 from hashes.txt)
#    AmneziaWG  github.com/amnezia-vpn/amneziawg-go  (userspace engine, built with the
#               official Go toolchain from go.dev, SHA-256 verified) +
#               github.com/amnezia-vpn/amneziawg-tools (awg/awg-quick, .sha256 verified)
#               → WireGuard protocol with DPI obfuscation, NO kernel module used.
#    OpenVPN    build.openvpn.net official apt repository (signed), distro fallback
#    Psiphon    github.com/Psiphon-Labs/psiphon-tunnel-core-binaries
#
#  Env: VVSM_MIRROR=https://panel/api/dl  VVSM_DL_KEY=<key>   (panel mirror first, GitHub second)
#       VVSM_CACHE=/opt/vvsm/data/cache   (panel: publish self-built binaries for the nodes)
# ============================================================================
set -Eeuo pipefail
ACTION="${1:-}"; CORE="${2:-}"
log() { printf '[vvsm-core] %s\n' "$*"; }
die() { printf '[vvsm-core] ✘ %s\n' "$*" >&2; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64; XR_ZIP=Xray-linux-64.zip; PSI=x86_64 ;;
  aarch64|arm64) ARCH=arm64; XR_ZIP=Xray-linux-arm64-v8a.zip; PSI=arm64 ;;
  *) die "unsupported CPU architecture $(uname -m) (amd64/arm64 only)" ;;
esac
TMP="$(mktemp -d)"; trap 'chmod -R u+w "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT
VERIFY_ONLY=false; [[ "$ACTION" == verify ]] && VERIFY_ONLY=true
if [[ "$ACTION" != verify && "$ACTION" != version ]]; then [[ $EUID -eq 0 ]] || die "run as root"; fi

fetch() { # <mirror-name> <upstream-url> <out>
  local name="$1" url="$2" out="$3"
  if [[ -n "${VVSM_MIRROR:-}" ]] && curl -fsSL --retry 2 -m 300 -o "$out" "${VVSM_MIRROR}/${name}?k=${VVSM_DL_KEY:-}" 2>/dev/null && [[ -s "$out" ]]; then return 0; fi
  [[ -n "$url" ]] || return 1
  curl -fsSL --retry 3 --retry-delay 2 -m 900 -o "$out" "$url"
}
sha_ok() { [[ -n "$2" && "$(sha256sum "$1" | cut -d' ' -f1)" == "$2" ]]; }
apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@" >/dev/null 2>&1 && return 0
  apt-get update -y >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@" >/dev/null
}
write_unit() { # <name> <content>
  local f="/etc/systemd/system/$1"
  if [[ ! -f "$f" ]] || [[ "$(cat "$f")" != "$2" ]]; then printf '%s\n' "$2" > "$f"; systemctl daemon-reload; fi
}
publish() { [[ -n "${VVSM_CACHE:-}" ]] && mkdir -p "$VVSM_CACHE" && cp -f "$1" "$VVSM_CACHE/$2" && log "published $2 for nodes"; return 0; }

# ---------------------------------------------------------------- Xray
core_xray() {
  local base="https://github.com/XTLS/Xray-core/releases/latest/download"
  fetch "$XR_ZIP" "$base/$XR_ZIP" "$TMP/x.zip" || die "Xray download failed"
  fetch "$XR_ZIP.dgst" "$base/$XR_ZIP.dgst" "$TMP/x.dgst" || die "Xray checksum download failed"
  sha_ok "$TMP/x.zip" "$(awk '/^SHA2-256=/{print $2}' "$TMP/x.dgst")" || die "Xray checksum MISMATCH — refusing to install"
  unzip -oq "$TMP/x.zip" xray -d "$TMP"
  log "Xray verified: $("$TMP/xray" version | head -1)"
  $VERIFY_ONLY && return 0
  install -m 755 "$TMP/xray" /usr/local/bin/xray
  mkdir -p /usr/local/etc/xray /usr/local/share/xray /var/log/xray
  for g in geoip.dat geosite.dat; do
    if fetch "$g" "https://raw.githubusercontent.com/Chocolate4U/Iran-v2ray-rules/release/$g" "$TMP/$g" && [[ $(stat -c%s "$TMP/$g") -gt 100000 ]]; then install -m 644 "$TMP/$g" /usr/local/share/xray/$g; fi
  done
  [[ -s /usr/local/etc/xray/config.json ]] || echo '{"log":{"loglevel":"warning"},"inbounds":[],"outbounds":[{"protocol":"freedom"}]}' > /usr/local/etc/xray/config.json
  rm -rf /etc/systemd/system/xray.service.d
  write_unit xray.service "[Unit]
Description=Xray-core (VVSM)
After=network-online.target
Wants=network-online.target
[Service]
User=root
Environment=XRAY_LOCATION_ASSET=/usr/local/share/xray
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
[Install]
WantedBy=multi-user.target"
  systemctl enable xray >/dev/null 2>&1 || true
  if XRAY_LOCATION_ASSET=/usr/local/share/xray /usr/local/bin/xray run -test -config /usr/local/etc/xray/config.json >/dev/null 2>&1; then systemctl restart xray; fi
  log "✔ Xray installed ($(/usr/local/bin/xray version | head -1 | awk '{print $2}'))"
}

# ---------------------------------------------------------------- Hysteria 2
core_hysteria() {
  local f="hysteria-linux-$ARCH" ok=false
  for repo in HyNetworks/hysteria apernet/hysteria; do
    local base="https://github.com/$repo/releases/latest/download"
    if fetch "$f" "$base/$f" "$TMP/hy" && fetch "hysteria-hashes.txt" "$base/hashes.txt" "$TMP/hh"; then ok=true; break; fi
  done
  $ok || die "Hysteria download failed"
  sha_ok "$TMP/hy" "$(awk -v f="build/$f" '$2==f{print $1}' "$TMP/hh")" || die "Hysteria checksum MISMATCH — refusing to install"
  chmod +x "$TMP/hy"; log "Hysteria verified: $("$TMP/hy" version 2>/dev/null | awk '/^Version/{print $2}')"
  $VERIFY_ONLY && return 0
  install -m 755 "$TMP/hy" /usr/local/bin/hysteria
  mkdir -p /etc/hysteria
  rm -rf /etc/systemd/system/hysteria-server.service.d
  write_unit hysteria-server.service "[Unit]
Description=Hysteria 2 server (VVSM)
After=network-online.target
Wants=network-online.target
[Service]
User=root
ExecStart=/usr/local/bin/hysteria server --config /etc/hysteria/config.yaml
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
[Install]
WantedBy=multi-user.target"
  if [[ -s /etc/hysteria/config.yaml ]]; then systemctl enable hysteria-server >/dev/null 2>&1; systemctl restart hysteria-server; fi
  log "✔ Hysteria installed"
}

# ---------------------------------------------------------------- AmneziaWG (userspace WireGuard + obfuscation)
build_awg_go() { # builds the userspace engine with the official Go toolchain
  log "building amneziawg-go from source (official Go toolchain)…"
  fetch "go-versions.json" "https://go.dev/dl/?mode=json" "$TMP/go.json" || die "cannot reach go.dev"
  local file sum
  file="$(grep -o "\"filename\": *\"go[0-9.]*\.linux-$ARCH\.tar\.gz\"" "$TMP/go.json" | head -1 | cut -d'"' -f4)"
  sum="$(tr -d '\n' < "$TMP/go.json" | grep -o "\"filename\": *\"$file\"[^}]*" | head -1 | grep -o '"sha256": *"[0-9a-f]*"' | cut -d'"' -f4)"
  [[ -n "$file" ]] || die "cannot parse go.dev release list"
  fetch "go-linux-$ARCH.tar.gz" "https://go.dev/dl/$file" "$TMP/go.tgz" || die "Go toolchain download failed"
  sha_ok "$TMP/go.tgz" "$sum" || die "Go toolchain checksum MISMATCH"
  tar -C "$TMP" -xzf "$TMP/go.tgz"
  fetch "amneziawg-go-src.tar.gz" "https://github.com/amnezia-vpn/amneziawg-go/archive/refs/heads/master.tar.gz" "$TMP/src.tgz" || die "amneziawg-go source download failed"
  mkdir -p "$TMP/src" && tar -C "$TMP/src" --strip-components=1 -xzf "$TMP/src.tgz"
  local GOBIN_="$TMP/go/bin/go"
  (cd "$TMP/src" && GOCACHE="$TMP/gocache" GOPATH="$TMP/gopath" GOFLAGS="-mod=mod -modcacherw" CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" "$GOBIN_" build -trimpath -ldflags "-s -w" -o "$TMP/amneziawg-go" .) || die "amneziawg-go build failed"
  if [[ -n "${VVSM_CACHE:-}" ]]; then # panel: also publish both architectures for the nodes
    publish "$TMP/amneziawg-go" "amneziawg-go-linux-$ARCH"
    local other=amd64; [[ "$ARCH" == amd64 ]] && other=arm64
    (cd "$TMP/src" && GOCACHE="$TMP/gocache" GOPATH="$TMP/gopath" GOFLAGS="-mod=mod -modcacherw" CGO_ENABLED=0 GOOS=linux GOARCH="$other" "$GOBIN_" build -trimpath -ldflags "-s -w" -o "$TMP/amneziawg-go-$other" .) && publish "$TMP/amneziawg-go-$other" "amneziawg-go-linux-$other"
  fi
}
core_awg() {
  $VERIFY_ONLY || apt_install iproute2 iptables ca-certificates unzip
  # 1) userspace engine
  if fetch "amneziawg-go-linux-$ARCH" "" "$TMP/amneziawg-go" 2>/dev/null && chmod +x "$TMP/amneziawg-go" && "$TMP/amneziawg-go" --version >/dev/null 2>&1; then log "amneziawg-go taken from the panel mirror"
  else build_awg_go; fi
  "$TMP/amneziawg-go" --version | head -1 | sed 's/^/[vvsm-core] engine: /'
  # 2) tools (awg, awg-quick)
  local tools_ok=false
  if [[ "$ARCH" == amd64 ]] && fetch "amneziawg-tools.zip" "https://github.com/amnezia-vpn/amneziawg-tools/releases/latest/download/ubuntu-22.04-amneziawg-tools.zip" "$TMP/t.zip"; then
    unzip -oq "$TMP/t.zip" -d "$TMP/t"; local d; d="$(dirname "$(find "$TMP/t" -name awg -type f | head -1)")"
    if sha_ok "$d/awg" "$(cut -d' ' -f1 "$d/awg.sha256")" && sha_ok "$d/awg-quick" "$(cut -d' ' -f1 "$d/awg-quick.sha256")"; then
      chmod +x "$d/awg" "$d/awg-quick"; cp "$d/awg" "$d/awg-quick" "$TMP/"
      "$TMP/awg" --version >/dev/null 2>&1 && tools_ok=true
    else die "amneziawg-tools checksum MISMATCH"; fi
  fi
  if ! $tools_ok; then # old glibc or arm64 → build the C tools from source
    log "building amneziawg-tools from source…"
    $VERIFY_ONLY || apt_install build-essential
    fetch "amneziawg-tools-src.tar.gz" "https://github.com/amnezia-vpn/amneziawg-tools/archive/refs/heads/master.tar.gz" "$TMP/ts.tgz" || die "amneziawg-tools source download failed"
    mkdir -p "$TMP/ts" && tar -C "$TMP/ts" --strip-components=1 -xzf "$TMP/ts.tgz"
    make -s -C "$TMP/ts/src" >/dev/null || die "amneziawg-tools build failed"
    cp "$TMP/ts/src/wg" "$TMP/awg" 2>/dev/null || cp "$TMP/ts/src/awg" "$TMP/awg"
    cp "$TMP/ts/src/wg-quick/linux.bash" "$TMP/awg-quick" 2>/dev/null || cp "$TMP/ts/src/awg-quick/linux.bash" "$TMP/awg-quick"
    chmod +x "$TMP/awg" "$TMP/awg-quick"
  fi
  log "tools: $("$TMP/awg" --version)"
  $VERIFY_ONLY && return 0
  [[ -c /dev/net/tun ]] || die "/dev/net/tun is missing (enable TUN/TAP in your VPS panel)"
  install -m 755 "$TMP/amneziawg-go" /usr/bin/amneziawg-go
  install -m 755 "$TMP/awg" /usr/bin/awg
  install -m 755 "$TMP/awg-quick" /usr/bin/awg-quick
  mkdir -p /etc/amnezia/amneziawg && chmod 700 /etc/amnezia/amneziawg
  write_unit "awg-quick@.service" "[Unit]
Description=AmneziaWG (userspace) tunnel %i — VVSM
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
Environment=WG_QUICK_USERSPACE_IMPLEMENTATION=amneziawg-go
Environment=WG_ENDPOINT_RESOLUTION_RETRIES=infinity
ExecStart=/usr/bin/awg-quick up %i
ExecStop=/usr/bin/awg-quick down %i
ExecReload=/bin/bash -c 'exec /usr/bin/awg syncconf %i <(exec /usr/bin/awg-quick strip %i)'
[Install]
WantedBy=multi-user.target"
  log "✔ AmneziaWG installed (userspace engine, kernel module NOT used)"
}

# ---------------------------------------------------------------- OpenVPN
core_openvpn() {
  # shellcheck disable=SC1091
  . /etc/os-release
  local cn="${VERSION_CODENAME:-}" repo="https://build.openvpn.net/debian/openvpn/stable"
  if $VERIFY_ONLY; then
    curl -fsS -m 20 -o /dev/null "$repo/dists/${cn:-bookworm}/Release" && log "official OpenVPN repo available for ${cn:-bookworm}" || log "official repo unreachable — distro package would be used"
    return 0
  fi
  apt_install ca-certificates curl gnupg
  if [[ -n "$cn" ]] && curl -fsS -m 20 -o /dev/null "$repo/dists/$cn/Release"; then
    mkdir -p /etc/apt/keyrings
    if fetch "openvpn-repo-public.gpg" "https://swupdate.openvpn.net/repos/repo-public.gpg" "$TMP/ovpn.gpg"; then
      gpg --dearmor < "$TMP/ovpn.gpg" > /etc/apt/keyrings/openvpn.gpg 2>/dev/null || cp "$TMP/ovpn.gpg" /etc/apt/keyrings/openvpn.gpg
      echo "deb [signed-by=/etc/apt/keyrings/openvpn.gpg] $repo $cn main" > /etc/apt/sources.list.d/openvpn-official.list
      if ! apt-get update -y >/dev/null 2>&1; then rm -f /etc/apt/sources.list.d/openvpn-official.list; log "official repo failed — using distro package"; fi
    fi
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openvpn >/dev/null || { apt-get update -y >/dev/null 2>&1; DEBIAN_FRONTEND=noninteractive apt-get install -y openvpn >/dev/null; }
  mkdir -p /etc/openvpn/server /var/log/openvpn
  log "✔ OpenVPN installed ($(openvpn --version | head -1 | awk '{print $2}'))"
}

# ---------------------------------------------------------------- Psiphon
core_psiphon() {
  fetch "psiphon-$PSI" "https://github.com/Psiphon-Labs/psiphon-tunnel-core-binaries/raw/master/linux/psiphon-tunnel-core-$PSI" "$TMP/psi" || die "Psiphon download failed"
  [[ "$(head -c4 "$TMP/psi" | od -An -tx1 | tr -d ' ')" == "7f454c46" ]] || die "Psiphon download is not a Linux binary"
  chmod +x "$TMP/psi"; "$TMP/psi" --version 2>&1 | grep -q Psiphon || die "Psiphon binary does not run"
  log "Psiphon verified: $("$TMP/psi" --version 2>&1 | grep -m1 'Build Date' | xargs)"
  $VERIFY_ONLY && return 0
  install -m 755 "$TMP/psi" /usr/local/bin/psiphon-tunnel-core
  mkdir -p /var/lib/vvsm/psiphon /etc/vvsm
  write_unit vvsm-psiphon.service "[Unit]
Description=Psiphon tunnel-core (VVSM upstream)
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/psiphon-tunnel-core -config /etc/vvsm/psiphon.config
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target"
  if [[ -s /etc/vvsm/psiphon.config ]]; then systemctl enable vvsm-psiphon >/dev/null 2>&1; systemctl restart vvsm-psiphon; fi
  log "✔ Psiphon installed"
}

core_version() {
  case "$1" in
    xray) xray version 2>/dev/null | head -1 | awk '{print $2}' ;;
    hysteria) hysteria version 2>/dev/null | awk '/^Version/{print $2}' ;;
    awg) awg --version 2>/dev/null | awk '{print $2}' ;;
    openvpn) openvpn --version 2>/dev/null | head -1 | awk '{print $2}' ;;
    psiphon) psiphon-tunnel-core --version 2>&1 | grep -m1 'Build Date' | awk '{print $3}' ;;
  esac
}

run_core() {
  case "$1" in
    xray) core_xray ;; hysteria|hysteria2) core_hysteria ;; awg|wireguard|amneziawg) core_awg ;;
    openvpn) core_openvpn ;; psiphon) core_psiphon ;;
    all) for c in xray hysteria awg openvpn psiphon; do run_core "$c"; done ;;
    *) die "unknown core: $1" ;;
  esac
}

case "$ACTION" in
  install|update|verify) [[ -n "$CORE" ]] || die "usage: vvsm-core $ACTION <xray|hysteria|awg|openvpn|psiphon|all>"; run_core "$CORE" ;;
  version) core_version "$CORE" ;;
  *) die "usage: vvsm-core install|update|verify|version <core>" ;;
esac
