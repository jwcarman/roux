#!/usr/bin/env bash
#
# Runs the app template the way a new app runs it in Docker: `make up`'s compose stack (the image
# built from the Dockerfile, Postgres and Mailpit beside it), then checks that the app is ready, that
# its startup check reached the mail server, and that a sign-in email arrives in Mailpit.
#
# Usage: scripts/check-image.sh
#
# The app is the template as create-roux-app ships it (scripts/export-app-template.sh), with roux and
# roux-web from this checkout instead of the Go module proxy and npm: roux's Go module copied into
# the app as .roux (a replace in go.mod), roux-web packed into frontend/. Two COPY lines in the
# Dockerfile bring them into the build; nothing else differs from an app made from a release.
# Ports are Docker's choice, so it runs beside `make dev` or anything else on this machine.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
APP="$WORK/check-app"
PROJECT="roux-image-check"
compose() { (cd "$APP" && docker compose -p "$PROJECT" -f compose.yaml -f "$WORK/ports.yaml" --profile app "$@"); }
cleanup() {
  if [[ -f "$WORK/ports.yaml" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT
fail() {
  echo "error: $1" >&2
  echo "--- the app's log:" >&2
  compose logs app >&2 || true
  exit 1
}

"$ROOT/scripts/export-app-template.sh" 0.0.0-image-check "$APP" >/dev/null

# roux's Go module: everything tracked outside the web, examples, template, docs and tooling.
mkdir "$APP/.roux"
(cd "$ROOT" && git ls-files -z | grep -zvE '^(web|examples|template|docs|plugins|scripts|\.github)/' | xargs -0 tar cf -) |
  tar xf - -C "$APP/.roux"
(cd "$APP" && go mod edit -replace github.com/jwcarman/roux=./.roux && GOFLAGS=-mod=mod go mod tidy)

# roux-web, built and packed into the front end.
(cd "$ROOT/web" && npm run -s build -w @jwcarman/roux-web >/dev/null)
pack="$(cd "$ROOT/web/roux-web" && npm pack --silent --pack-destination "$APP/frontend")"
(cd "$APP/frontend" &&
  npm pkg set "dependencies.@jwcarman/roux-web=file:./$pack" &&
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)

python3 - "$APP/Dockerfile" "$pack" <<'EOF'
import sys
path, pack = sys.argv[1], sys.argv[2]
s = open(path).read()
for old, new in [
    ("COPY frontend/package.json frontend/package-lock.json ./\n",
     f"COPY frontend/package.json frontend/package-lock.json frontend/{pack} ./\n"),
    ("COPY go.mod go.sum ./\n", "COPY go.mod go.sum ./\nCOPY .roux .roux\n"),
]:
    if s.count(old) != 1:
        sys.exit(f"error: the Dockerfile no longer has {old.strip()!r}: update scripts/check-image.sh")
    s = s.replace(old, new)
open(path, "w").write(s)
EOF

# Published ports of Docker's choosing, none fixed.
cat >"$WORK/ports.yaml" <<'EOF'
services:
  postgres:
    ports: !reset []
  mailpit:
    ports: !override ["127.0.0.1::8025"]
  app:
    ports: !override ["127.0.0.1::8080"]
EOF

compose up -d --build --wait >"$WORK/up.log" 2>&1 || { cat "$WORK/up.log" >&2; fail "docker compose up failed"; }
# Both are published on this machine only (ports.yaml), so plain HTTP never leaves it.
app="http://127.0.0.1:$(compose port app 8080 | sed 's/.*://')"
mailpit="http://127.0.0.1:$(compose port mailpit 8025 | sed 's/.*://')"

for _ in $(seq 1 60); do
  curl -fs "$app/api/roux/readyz" >/dev/null && break
  sleep 1
done
curl -fs "$app/api/roux/readyz" >/dev/null || fail "the app never became ready at $app/api/roux/readyz"

# Ask for a sign-in email for the first owner, as the sign-in page does.
jar="$WORK/cookies"
curl -fs -c "$jar" -o /dev/null "$app/api/roux/auth/me" || true
token="$(awk '/XSRF-TOKEN/ {print $7}' "$jar")"
status="$(curl -s -b "$jar" -H "X-XSRF-TOKEN: $token" -H 'Content-Type: application/json' -o /dev/null -w '%{http_code}' \
  -X POST "$app/api/roux/auth/email/send" -d '{"email":"owner@example.com"}')"
[[ "$status" == 202 ]] || fail "asking for a sign-in email answered $status, not 202"

for _ in $(seq 1 30); do
  [[ "$(curl -fs "$mailpit/api/v1/messages" | python3 -c 'import json,sys; print(json.load(sys.stdin)["total"])')" -ge 1 ]] && break
  sleep 1
done
curl -fs "$mailpit/api/v1/messages" | grep -q 'owner@example.com' || fail "no sign-in email reached Mailpit"

logs="$(compose logs app)"
grep -q 'mail server ready' <<<"$logs" || fail "the startup mail check did not report the mail server ready"
if grep -q '"level":"ERROR"' <<<"$logs"; then fail "the app logged an ERROR"; fi

echo "the image builds, runs beside Postgres and Mailpit, and sends a sign-in email"
