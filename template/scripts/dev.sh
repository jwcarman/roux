#!/usr/bin/env bash
#
# `make dev`'s two processes, run together: the server under air (rebuilt and restarted when a Go
# file changes, .air.toml) and Vite (the pages, reloaded as you edit). Browsers use Vite's address,
# which passes /api to the server, so sign-in links, passkeys and cookies all name it. Each setting
# gives way to the environment: OWNER_EMAIL=you@example.com make dev.
#
# One Ctrl-C stops both and exits 0. If either exits by itself the other is stopped and this exits
# with a non-zero status.

set -euo pipefail

cd "$(dirname "$0")/.."

export OWNER_EMAIL="${OWNER_EMAIL:-owner@example.com}"
export OWNER_NAME="${OWNER_NAME:-Owner}"
export CODE_SECRET="${CODE_SECRET:-development-only-code-secret-do-not-deploy}"
export DATABASE_URL="${DATABASE_URL:-postgres://app:app@localhost:5432/app}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:5173}"
# The server fills in the source index.html; Vite asks it for the page (vite.config.ts, serverShell).
# It listens on this machine only: people use Vite's address, and the source is not for the network.
export FRONTEND_DIR=frontend
export ADDR="${ADDR:-127.0.0.1:8080}"
export LOG_FORMAT="${LOG_FORMAT:-text}"

# Job control gives each process its own process group, so stopping one stops everything it started
# (air's server, npm's node) and a Ctrl-C reaches only this script, which stops them in turn.
set -m

stop_all() {
  trap '' INT TERM
  kill -TERM -- "-$server" "-$web" 2>/dev/null || true
  wait "$server" "$web" 2>/dev/null || true
}
interrupted() {
  stop_all
  exit 0
}
trap interrupted INT TERM

go tool air &
server=$!
(cd frontend && exec npm run dev) &
web=$!

echo "Open $PUBLIC_URL (sign in as $OWNER_EMAIL; the link is in Mailpit, http://localhost:8025). Ctrl-C stops the server and Vite."

# Wait for either to exit; polling because `wait -n` is not in the bash macOS ships.
while kill -0 "$server" 2>/dev/null && kill -0 "$web" 2>/dev/null; do
  sleep 0.5 &
  wait $! || true
done

if kill -0 "$server" 2>/dev/null; then
  echo "dev: Vite stopped, so the server is stopped too." >&2
else
  echo "dev: the server stopped, so Vite is stopped too." >&2
fi
stop_all
exit 1
