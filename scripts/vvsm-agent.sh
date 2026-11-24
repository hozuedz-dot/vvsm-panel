#!/usr/bin/env bash
# VVSM node agent — pulls the Xray config generated for this node from the panel,
# validates it, applies it and reports health/metrics every 30 s.
PANEL="__PANEL__"
TOKEN="__TOKEN__"
VER="4"
CONF=/usr/local/etc/xray/config.json
STATE=/var/lib/vvsm
CERT=/etc/vvsm/certs/fullchain.pem
mkdir -p "$STATE"
export XRAY_LOCATION_ASSET=/usr/local/share/xray

read_cpu() { awk '/^cpu / {print $2+$3+$4+$6+$7+$8, $5}' /proc/stat; }
prev_rx=0; prev_tx=0; prev_t=0
read pc_busy pc_idle < <(read_cpu)
last_err=""

while true; do
  # ---- pull config
  resp="$(curl -fsS -m 25 -H "Authorization: Bearer $TOKEN" "$PANEL/api/node/sync" 2>"$STATE/curl.err")"
  if [ -z "$resp" ]; then
    last_err="cannot reach panel: $(tail -c 200 "$STATE/curl.err" 2>/dev/null)"
  else
    hash="$(printf '%s' "$resp" | jq -r '.hash // empty' 2>/dev/null)"
    if [ -n "$hash" ] && [ "$hash" != "$(cat "$STATE/agent.hash" 2>/dev/null)" ]; then
      printf '%s' "$resp" | jq -r '.config' > "$STATE/xray.new.json"
      if out="$(xray run -test -format json -config "$STATE/xray.new.json" 2>&1)"; then
        cp "$STATE/xray.new.json" "$CONF"
        systemctl restart xray
        echo "$hash" > "$STATE/agent.hash"
        last_err=""
      else
        last_err="xray rejected config: $(printf '%s' "$out" | grep -v Warning | tail -c 400)"
      fi
    elif [ -n "$hash" ]; then
      case "$last_err" in cannot*) last_err="";; esac
    fi
    # open firewall ports requested by the panel (inbounds + tunnel listeners)
    ports="$(printf '%s' "$resp" | jq -r '.ports[]?' 2>/dev/null | sort -u | tr '\n' ' ')"
    if [ "$ports" != "${last_ports:-}" ]; then
      last_ports="$ports"
      if command -v iptables >/dev/null; then
        iptables -N VVSM_IN 2>/dev/null; iptables -F VVSM_IN
        iptables -C INPUT -j VVSM_IN 2>/dev/null || iptables -I INPUT 1 -j VVSM_IN
        for p in $ports; do iptables -A VVSM_IN -p "${p#*/}" --dport "${p%/*}" -j ACCEPT; done
      fi
      if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
        for p in $ports; do ufw allow "$p" >/dev/null 2>&1; done
      fi
    fi
  fi

  # ---- metrics
  read c_busy c_idle < <(read_cpu)
  db=$((c_busy - pc_busy)); di=$((c_idle - pc_idle)); pc_busy=$c_busy; pc_idle=$c_idle
  cpu=0; [ $((db + di)) -gt 0 ] && cpu=$(( 100 * db / (db + di) ))
  mem="$(free | awk '/Mem:/ {printf "%.1f", ($2-$7)/$2*100}')"
  load="$(cut -d' ' -f1 /proc/loadavg)"
  read rx tx < <(awk -F'[: ]+' 'NR>2 && $2!="lo" {r+=$3; t+=$11} END {printf "%d %d", r, t}' /proc/net/dev)
  now=$(date +%s); rate_rx=0; rate_tx=0
  if [ "$prev_t" -gt 0 ] && [ $((now - prev_t)) -gt 0 ]; then rate_rx=$(( (rx - prev_rx) / (now - prev_t) )); rate_tx=$(( (tx - prev_tx) / (now - prev_t) )); fi
  [ "$rate_rx" -lt 0 ] && rate_rx=0; [ "$rate_tx" -lt 0 ] && rate_tx=0
  prev_rx=$rx; prev_tx=$tx; prev_t=$now
  xa=false; systemctl is-active --quiet xray && xa=true
  if [ "$xa" = false ] && [ -z "$last_err" ]; then last_err="xray not running: $(journalctl -u xray -n 3 --no-pager --output=cat 2>/dev/null | tail -c 300)"; fi
  cert=""; [ -f "$CERT" ] && cert="$(openssl x509 -in "$CERT" -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
  payload="$(jq -nc --argjson cpu "${cpu:-0}" --arg mem "${mem:-0}" --arg load "${load:-0}" --argjson rx "$rate_rx" --argjson tx "$rate_tx" \
    --arg hash "$(cat "$STATE/agent.hash" 2>/dev/null)" --argjson xa "$xa" --arg err "$last_err" --arg ver "$VER" --arg cert "$cert" \
    '{cpu:$cpu, mem:($mem|tonumber? // 0), load:($load|tonumber? // 0), rxBps:$rx, txBps:$tx, configHash:$hash, xrayActive:$xa, error:$err, version:$ver, certSha256:$cert}')"
  curl -fsS -m 15 -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$payload" "$PANEL/api/node/sync" >/dev/null 2>&1 || true
  sleep 30
done
