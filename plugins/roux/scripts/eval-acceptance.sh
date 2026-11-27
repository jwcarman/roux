#!/usr/bin/env bash
# Runs an eval case's hidden acceptance tests against a run's work, and prints one
# `PASS accept:<test>` or `FAIL accept:<test>` line per test (the reason indented under a failure).
# A test that never ran (the app did not build, the server did not start) is a FAIL, so a broken run
# cannot pass by running nothing. Exits 0 whatever the tests found; 2 on bad usage.
#
# The case's tests (the agent never sees them) are Playwright specs in <case>/acceptance/e2e: black
# box, over HTTP and in the browser, against the app the run built, so they hold whatever the run
# named its code. They take the place of the app's own specs (e2e/tests/helpers.ts is the fixture's).
# It works on a copy of the run's directory: permissions.gen.ts is first written as the app's
# permissions test writes it, then the front end and the server are built and the server started,
# as e2e/run.sh does, but on a port of its own (57243) beside eval-services.sh's Postgres and Mailpit,
# so nothing on this machine's usual ports is touched.
# Needs Docker, and the network for modules and Playwright's browser.
#
# Usage: eval-acceptance.sh <case dir> <run dir with the fixture's git history>
set -euo pipefail

if [ "$#" -ne 2 ] || [ ! -d "$1/acceptance/e2e" ] || [ ! -d "$2/.git" ]; then
  echo "usage: $(basename "$0") <case dir with acceptance/e2e/> <run dir with its git history>" >&2
  exit 2
fi
APP_PORT=57243

accept="$(cd "$1/acceptance" && pwd -P)"
work="$(mktemp -d)"
server=""
trap '[ -z "$server" ] || kill "$server" 2>/dev/null || true; rm -rf "$work"' EXIT
cp -R "$2/." "$work/app"
app="$work/app"
base="$(git -C "$app" rev-list --max-parents=0 HEAD | tail -n 1)"
log="$work/acceptance.log"
: >"$log"

# The hidden specs in place of the app's own, beside the fixture's helpers.
rm -rf "$app/e2e/tests"
git -C "$app" checkout -q "$base" -- e2e/tests/helpers.ts
cp "$accept"/e2e/*.spec.ts "$app/e2e/tests/"

# shellcheck source=eval-services.sh
. "$(dirname "$0")/eval-services.sh"
eval_services >>"$log" 2>&1
database_url="$(eval_database app_accept 2>>"$log")"

why_not_run="never ran"
started=false
url="http://localhost:$APP_PORT"
if ! (cd "$app" && go test -count=1 -run '^TestTheFrontEndListsEveryPermission$' ./cmd/server) >>"$log" 2>&1 &&
  ! (cd "$app" && go test -count=1 -run '^TestTheFrontEndListsEveryPermission$' ./cmd/server) >>"$log" 2>&1; then
  # The test fails once when it rewrites the file; a second failure is the app's.
  why_not_run="never ran: the permissions test fails (go test ./cmd/server)"
elif ! (cd "$app/frontend" && npm install --no-audit --no-fund && npm run build) >>"$log" 2>&1; then
  why_not_run="never ran: the front end does not build (npm run build)"
elif ! (cd "$app" && go build -o bin/accept-server ./cmd/server) >>"$log" 2>&1; then
  why_not_run="never ran: the server does not build (go build ./cmd/server)"
elif ! (cd "$app/e2e" && npm ci --ignore-scripts --no-audit --no-fund && node_modules/.bin/playwright install chromium) >>"$log" 2>&1; then
  why_not_run="never ran: Playwright did not install"
else
  (cd "$app" && CODE_SECRET=acceptance-only-code-secret-not-for-anything-else \
    DATABASE_URL="$database_url" \
    OWNER_EMAIL=owner@example.test OWNER_NAME="Olive Owner" \
    ADDR="127.0.0.1:$APP_PORT" PUBLIC_URL="$url" EMAIL_RESEND_INTERVAL=1s \
    SMTP_ADDR="localhost:$EVAL_SMTP_PORT" FRONTEND_DIR=frontend/dist LOG_FORMAT=text \
    exec bin/accept-server) >"$work/app.log" 2>&1 &
  server=$!
  for _ in $(seq 1 60); do
    if curl -fs "$url/api/roux/readyz" >/dev/null; then
      started=true
      break
    fi
    kill -0 "$server" 2>/dev/null || break
    sleep 1
  done
  if $started; then
    (cd "$app/e2e" && E2E_BASE_URL="$url" E2E_MAILPIT_URL="http://localhost:$EVAL_MAILPIT_PORT" \
      E2E_OWNER_EMAIL=owner@example.test E2E_OWNER_NAME="Olive Owner" \
      PLAYWRIGHT_JSON_OUTPUT_NAME="$work/playwright.json" \
      node_modules/.bin/playwright test --reporter=json) >"$work/playwright.log" 2>&1 || true
  else
    why_not_run="never ran: the server did not start (app.log: $(tail -n 1 "$work/app.log" | cut -c1-200))"
  fi
fi

python3 - "$accept" "$work/playwright.json" "$why_not_run" <<'EOF'
import glob, json, os, re, sys

accept, report, why_not_run = sys.argv[1:4]
# Expected tests, from the sources: every one must report.
expected = []
for path in sorted(glob.glob(f"{accept}/e2e/*.spec.ts")):
    src = open(path).read()
    expected += [t.replace('\\"', '"') for t in re.findall(r'^test\(\s*"((?:[^"\\]|\\.)*)"', src, re.M)]

results = {}  # title -> reason ("" passed)
if os.path.exists(report):
    def walk(suite):
        for spec in suite.get("specs", []):
            for t in spec.get("tests", []):
                runs = t.get("results", [])
                last = runs[-1] if runs else {}
                if last.get("status") == "passed":
                    results[spec["title"]] = ""
                else:
                    err = (last.get("error") or {}).get("message") or last.get("status") or "failed"
                    err = re.sub(r"\x1b\[[0-9;]*m", "", err)
                    results[spec["title"]] = " ".join(err.split())[:300]
        for child in suite.get("suites", []):
            walk(child)
    for suite in json.load(open(report)).get("suites", []):
        walk(suite)

for name in expected:
    reason = results.get(name, why_not_run)
    if reason == "":
        print(f"PASS accept:{name}")
    else:
        print(f"FAIL accept:{name}")
        print(f"  {reason}")
EOF

# Keep the logs (the copy goes): the build's, the browser suite's and the app's.
kept="$(mktemp -d "${TMPDIR:-/tmp}/eval-acceptance.XXXXXX")"
cp "$log" "$kept/"
cp "$work"/playwright.json "$work"/playwright.log "$work"/app.log "$kept/" 2>/dev/null || true
echo "  logs: $kept"
