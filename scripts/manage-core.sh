#!/usr/bin/env bash
# VVSM core installer/updater invoked by the authenticated admin API (Protocols → Cores).
# Delegates to vvsm-core.sh (official sources + checksum verification).
set -Eeuo pipefail
CORE="${1:-}"; ACTION="${2:-}"
[[ $EUID -eq 0 ]] || { echo "Root is required for core management" >&2; exit 1; }
[[ "$ACTION" == install || "$ACTION" == update ]] || { echo "Use: manage-core.sh <xray|hysteria2|wireguard|openvpn|psiphon> <install|update>" >&2; exit 2; }
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$CORE" in
  xray) C=xray ;; hysteria2|hysteria) C=hysteria ;; wireguard|awg|amneziawg) C=awg ;; openvpn) C=openvpn ;; psiphon) C=psiphon ;;
  *) echo "Unsupported core: $CORE" >&2; exit 2 ;;
esac
install -m 755 "$DIR/vvsm-core.sh" /usr/local/sbin/vvsm-core
# the panel publishes self-built binaries (amneziawg-go) so that nodes can download them through the mirror
VVSM_CACHE="$(cd "$DIR/.." && pwd)/data/cache" exec /usr/local/sbin/vvsm-core "$ACTION" "$C"
