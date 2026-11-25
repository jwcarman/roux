#!/usr/bin/env bash
#
# The Playwright suite against the app as it is now: `make e2e`. It starts Postgres and Mailpit
# (compose.yaml), makes the database app_e2e afresh, builds and starts the server on port 8099 and
# runs the suite there, leaving `make dev`'s server and data alone. Arguments go to Playwright:
# `make e2e ARGS="tests/user.spec.ts"`.

set -euo pipefail

cd "$(dirname "$0")/.."
PORT=8099
URL="http://localhost:$PORT"
OWNER_EMAIL=owner@example.test
OWNER_NAME="Olive Owner"

docker compose up -d --wait postgres mailpit
docker compose exec -T postgres sh -c 'dropdb -U app --if-exists app_e2e && createdb -U app app_e2e'
[[ -f frontend/dist/index.html ]] || make web
go build -o bin/e2e-server ./cmd/server
(cd e2e && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && node_modules/.bin/playwright install chromium >/dev/null)

CODE_SECRET=e2e-only-code-secret-not-for-anything-else \
  DATABASE_URL=postgres://app:app@localhost:5432/app_e2e \
  OWNER_EMAIL="$OWNER_EMAIL" OWNER_NAME="$OWNER_NAME" \
  ADDR=":$PORT" PUBLIC_URL="$URL" EMAIL_RESEND_INTERVAL=1s \
  FRONTEND_DIR=frontend/dist LOG_FORMAT=text \
  bin/e2e-server >bin/e2e-server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fs "$URL/api/roux/readyz" >/dev/null; then
    break
  fi
  if ! kill -0 "$server" 2>/dev/null; then
    echo "error: the server stopped while starting; its log, bin/e2e-server.log:" >&2
    cat bin/e2e-server.log >&2
    exit 1
  fi
  sleep 1
done
curl -fs "$URL/api/roux/readyz" >/dev/null || { echo "error: the server was not ready at $URL within 60s (bin/e2e-server.log)" >&2; exit 1; }

cd e2e
E2E_BASE_URL="$URL" E2E_OWNER_EMAIL="$OWNER_EMAIL" E2E_OWNER_NAME="$OWNER_NAME" node_modules/.bin/playwright test "$@"
