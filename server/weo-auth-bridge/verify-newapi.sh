#!/usr/bin/env bash
#
# Verify that this New API instance exposes the endpoints the Weo auth bridge
# relies on. Run this ON THE VPS with a real (test) account. It prints the raw
# JSON so we can confirm field names match the bridge's assumptions:
#   - POST /api/user/login   → success + data.id, and a `session` Set-Cookie
#   - POST /api/token/       → creates a token (with New-Api-User header)
#   - GET  /api/token/       → lists tokens, each exposing `key`
#
# Usage:
#   NEW_API_BASE_URL=https://api.weo.asia ./verify-newapi.sh <username> <password>
#
set -euo pipefail

BASE="${NEW_API_BASE_URL:-https://api.weo.asia}"
USER="${1:?usage: verify-newapi.sh <username> <password>}"
PASS="${2:?usage: verify-newapi.sh <username> <password>}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "== 1) POST /api/user/login =="
LOGIN_JSON="$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/user/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")"
echo "$LOGIN_JSON"
echo "-- cookies set --"; cat "$COOKIE_JAR"
USER_ID="$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
echo "-- parsed user id: ${USER_ID:-<none>} --"
echo

echo "== 2) POST /api/token/ (create) =="
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/token/" \
  -H 'content-type: application/json' \
  -H "New-Api-User: ${USER_ID:-}" \
  -d '{"name":"weo-cli-verify","remain_quota":-1,"expired_time":-1,"unlimited_quota":true}'
echo; echo

echo "== 3) GET /api/token/ (list — look for the token \"key\") =="
curl -s -b "$COOKIE_JAR" "$BASE/api/token/?p=0&size=50" \
  -H "New-Api-User: ${USER_ID:-}"
echo; echo

echo "== 4) GET /v1/dashboard/billing/subscription (quota; needs an sk- token) =="
echo "   (skip unless you paste an API key:  curl -H 'Authorization: Bearer sk-...' $BASE/v1/dashboard/billing/subscription )"
