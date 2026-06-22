#!/usr/bin/env bash
#
# One-shot deploy helper for the Weo auth bridge. Run it ON THE VPS from this
# directory (server/weo-auth-bridge). It:
#   1. ensures .env exists,
#   2. starts the bridge (Docker by default, or `--node`),
#   3. waits for /healthz,
#   4. prints the nginx reverse-proxy snippet and the CLI env vars to set.
#
# Usage:
#   ./deploy.sh            # Docker (docker compose up -d --build)
#   ./deploy.sh --node     # plain Node (background via nohup)
#
set -euo pipefail
cd "$(dirname "$0")"

MODE="docker"
[ "${1:-}" = "--node" ] && MODE="node"

# ── 1. Config ───────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — review it before continuing:"
  echo "  NEW_API_BASE_URL  (New API base, e.g. https://api.weo.asia or http://127.0.0.1:3000)"
  echo "  PUBLIC_BASE_URL   (public URL of THIS bridge, e.g. https://api.weo.asia/bridge)"
  echo
  read -r -p "Press Enter once .env looks right (Ctrl-C to abort)…" _
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
PORT="${PORT:-8787}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:$PORT}"

# ── 2. Start ────────────────────────────────────────────────────────────────
if [ "$MODE" = "docker" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found — re-run with: ./deploy.sh --node" >&2
    exit 1
  fi
  echo "==> Starting via Docker…"
  docker compose up -d --build
else
  command -v node >/dev/null 2>&1 || { echo "node not found (need >=22)"; exit 1; }
  echo "==> Starting via Node (nohup → bridge.log)…"
  pkill -f "node .*server.mjs" 2>/dev/null || true
  nohup node server.mjs >bridge.log 2>&1 &
  echo "    pid $! (logs: $(pwd)/bridge.log)"
fi

# ── 3. Health check ─────────────────────────────────────────────────────────
echo "==> Waiting for the bridge on :$PORT…"
ok=""
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 1
done
if [ -z "$ok" ]; then
  echo "!! Bridge did not become healthy on :$PORT." >&2
  [ "$MODE" = "docker" ] && echo "   Check: docker compose logs" >&2
  [ "$MODE" = "node" ] && echo "   Check: tail -f bridge.log" >&2
  exit 1
fi
echo "    healthy ✓"

# ── 4. Next steps ───────────────────────────────────────────────────────────
PUB_PATH="/$(echo "$PUBLIC_BASE_URL" | sed -E 's#^https?://[^/]+/?##')"
[ "$PUB_PATH" = "/" ] && PUB_PATH="/bridge"

cat <<EOF

────────────────────────────────────────────────────────────────────────────
Bridge is up on 127.0.0.1:$PORT.

1) Add this to your New API site's nginx server block, then \`nginx -t && nginx -s reload\`:

location ${PUB_PATH%/}/ {
    proxy_pass http://127.0.0.1:$PORT/;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
}

2) Verify publicly:
    curl ${PUBLIC_BASE_URL%/}/healthz        # expect {"ok":true}

3) Point the Weo CLI at it (on the client, or bake into your build):
    export WEO_BASE_URL=$(echo "$PUBLIC_BASE_URL" | sed -E 's#(https?://[^/]+).*#\1#')
    export WEO_BRIDGE_URL=${PUBLIC_BASE_URL%/}
    weo            # /login → account SSO,  /balance → quota

Tip: run ./verify-newapi.sh <user> <pass> first to confirm New API field shapes.
────────────────────────────────────────────────────────────────────────────
EOF
