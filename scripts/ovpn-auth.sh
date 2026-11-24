#!/usr/bin/env bash
# OpenVPN auth-user-pass-verify: asks the panel whether username/password are valid
# and the subscription is active. Exit 0 = allow.
# Works with "via-file" (recommended, script-security 2: $1 = file with username/password lines)
# and "via-env" (needs script-security 3).
ENV_FILE=/opt/vvsm/.env
if [ -n "${1:-}" ] && [ -f "$1" ]; then
  username="$(sed -n 1p "$1")"
  password="$(sed -n 2p "$1")"
fi
SESSION_SECRET="$(grep -m1 '^SESSION_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")"
PORT="$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")"
KEY="$(printf 'int:%s' "$SESSION_SECRET" | sha256sum | cut -c1-32)"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST \
  -H "x-internal-key: $KEY" \
  --data-urlencode "username=${username:-}" --data-urlencode "password=${password:-}" \
  "http://127.0.0.1:${PORT:-3000}/api/internal/ovpn-auth")"
[ "$code" = "200" ]
