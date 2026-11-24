#!/usr/bin/env bash
# Atomically install matching Chocolate4U GeoIP + GeoSite assets for VVSM routing.
# Never replace working assets with partial downloads or unvalidated rule sets.
set -Eeuo pipefail
DEST=/usr/local/share/xray
CONFIG=/usr/local/etc/xray/config.json
TMP=$(mktemp -d /tmp/vvsm-geo-XXXXXXXX)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"
fetch() {
  local n="$1" base
  for base in "https://raw.githubusercontent.com/Chocolate4U/Iran-v2ray-rules/release" "https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release"; do
    if curl -fsSL --retry 2 --connect-timeout 10 -m 120 -o "$TMP/$n" "$base/$n" && [[ $(stat -c%s "$TMP/$n") -gt 100000 ]]; then
      printf 'Downloaded %s (%s bytes)\n' "$n" "$(stat -c%s "$TMP/$n")"
      return 0
    fi
  done
  printf 'Failed to download %s; existing assets were not changed\n' "$n" >&2
  return 1
}
fetch geoip.dat
fetch geosite.dat
if command -v xray >/dev/null && [[ -f "$CONFIG" ]]; then
  printf 'Validating installed Xray config against new GeoIP/GeoSite…\n'
  XRAY_LOCATION_ASSET="$TMP" xray run -test -config "$CONFIG" || {
    echo 'New assets do not validate the current Xray config; existing files were not changed' >&2
    exit 1
  }
fi
for n in geoip.dat geosite.dat; do
  if [[ -f "$DEST/$n" ]]; then cp -a "$DEST/$n" "$TMP/$n.previous"; fi
  install -m 644 "$TMP/$n" "$DEST/$n"
done
if command -v systemctl >/dev/null && systemctl is-active --quiet xray; then
  if ! systemctl restart xray || ! systemctl is-active --quiet xray; then
    echo 'Xray failed after Geo update; restoring previous assets' >&2
    for n in geoip.dat geosite.dat; do
      if [[ -f "$TMP/$n.previous" ]]; then cp -a "$TMP/$n.previous" "$DEST/$n"; else rm -f "$DEST/$n"; fi
    done
    systemctl restart xray || true
    exit 1
  fi
fi
printf 'Matching Xray GeoIP/GeoSite installed and validated.\n'
