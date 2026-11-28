#!/usr/bin/env bash
#
# The Playwright suite against the app as it is now: `make e2e`. It makes the database app_e2e afresh
# on the Postgres server DATABASE_URL names (cmd/e2edb), builds and starts the server on port 8099,
# sending its mail to SMTP_ADDR, and runs the suite there, reading mail from E2E_MAILPIT_URL;
# `make dev`'s server and data are left alone. It starts nothing: each address defaults to
# `make services`' Postgres and Mailpit on this machine, and gives way to the environment.
# Arguments go to Playwright: `make e2e ARGS="tests/user.spec.ts"`.

set -euo pipefail

cd "$(dirname "$0")/.."
PORT=8099
URL="http://localhost:$PORT"
OWNER_EMAIL=owner@example.test
OWNER_NAME="Olive Owner"

DATABASE_URL="${DATABASE_URL:-postgres://app:app@localhost:5432/app}"
E2E_MAILPIT_URL="${E2E_MAILPIT_URL:-http://localhost:8025}"
SMTP_ADDR="${SMTP_ADDR:-localhost:1025}"

if ! curl -fs "$E2E_MAILPIT_URL/api/v1/info" >/dev/null; then
  echo "error: no Mailpit at $E2E_MAILPIT_URL: run make services for this machine's, or set E2E_MAILPIT_URL (and SMTP_ADDR) to the one to use" >&2
  exit 1
fi
E2E_DATABASE_URL="$(DATABASE_URL="$DATABASE_URL" go run ./cmd/e2edb)"
make --no-print-directory frontend/dist/index.html
go build -o bin/e2e-server ./cmd/server
(cd e2e && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && node_modules/.bin/playwright install chromium >/dev/null)

CODE_SECRET=e2e-only-code-secret-not-for-anything-else \
  DATABASE_URL="$E2E_DATABASE_URL" SMTP_ADDR="$SMTP_ADDR" SMTP_ALLOW_PLAINTEXT=true \
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
E2E_BASE_URL="$URL" E2E_MAILPIT_URL="$E2E_MAILPIT_URL" E2E_OWNER_EMAIL="$OWNER_EMAIL" E2E_OWNER_NAME="$OWNER_NAME" node_modules/.bin/playwright test "$@"
