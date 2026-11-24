#!/usr/bin/env bash
# Compatible with Settings > System > Update cores. Fail loudly on errors.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Root required' >&2; exit 1; }
LOG=/var/log/vvsm-update.log
mkdir -p /var/log
printf '=== core update %s ===\n' "$(date -Is)" >> "$LOG"
for core in xray hysteria2; do
  printf 'Updating %s…\n' "$core" | tee -a "$LOG"
  if ! bash /opt/vvsm/scripts/manage-core.sh "$core" update >> "$LOG" 2>&1; then
    printf '%s update failed; see %s\n' "$core" "$LOG" >&2
    exit 1
  fi
done
printf 'All requested cores updated and checked.\n' | tee -a "$LOG"
