#!/usr/bin/env bash
# NAT for VVSM WireGuard and OpenVPN. Reads current WG subnet from wg0.conf,
# stores applied rules so changing subnet can remove old NAT rules safely.
set -euo pipefail
STATE=/var/lib/vvsm/nat-state
mkdir -p /var/lib/vvsm
iface() { ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}'; }
wg_net() {
  local f=/etc/amnezia/amneziawg/awg0.conf; [[ -r $f ]] || f=/etc/wireguard/wg0.conf; [[ -r $f ]] || return 0
  awk -F= '/^[[:space:]]*Address[[:space:]]*=/ {gsub(/[[:space:]]/, "", $2); split($2, addr, ","); for (i in addr) if (addr[i] ~ /^[0-9]+\./) {print addr[i]; exit}}' "$f"
}
rule() {
  local mode="$1" net="$2" dev="$3" flag="-A"
  [[ "$mode" == stop ]] && flag="-D"
  if [[ "$mode" == start ]]; then
    iptables -t nat -C POSTROUTING -s "$net" -o "$dev" -j MASQUERADE 2>/dev/null || iptables -t nat "$flag" POSTROUTING -s "$net" -o "$dev" -j MASQUERADE
    iptables -C FORWARD -s "$net" -j ACCEPT 2>/dev/null || iptables "$flag" FORWARD -s "$net" -j ACCEPT
    iptables -C FORWARD -d "$net" -j ACCEPT 2>/dev/null || iptables "$flag" FORWARD -d "$net" -j ACCEPT
  else
    iptables -t nat "$flag" POSTROUTING -s "$net" -o "$dev" -j MASQUERADE 2>/dev/null || true
    iptables "$flag" FORWARD -s "$net" -j ACCEPT 2>/dev/null || true
    iptables "$flag" FORWARD -d "$net" -j ACCEPT 2>/dev/null || true
  fi
}
case "${1:-}" in
  start)
    DEV="$(iface)"; [[ -n "$DEV" ]] || exit 0
    WG="$(wg_net)"; [[ -n "$WG" ]] || WG="10.66.0.0/16"
    for NET in "$WG" 10.77.0.0/16; do rule start "$NET" "$DEV"; done
    printf 'DEV=%q\nWG=%q\n' "$DEV" "$WG" > "$STATE"
    chmod 600 "$STATE"
    ;;
  stop)
    [[ -f "$STATE" ]] || exit 0
    source "$STATE"
    for NET in "$WG" 10.77.0.0/16; do rule stop "$NET" "$DEV"; done
    rm -f "$STATE"
    ;;
  *) echo 'Usage: vvsm-nat.sh start|stop' >&2; exit 2;;
esac
