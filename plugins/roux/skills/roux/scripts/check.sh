#!/usr/bin/env bash
# A roux app's checks, in the order the build needs them. Run it from the app's root (where go.mod
# is) before you finish:  bash <this skill's directory>/scripts/check.sh
#
#   1. gofmt -w formats the Go (the build's format check fails on any unformatted file).
#   2. The permissions test rewrites frontend/src/permissions.gen.ts from permissions() in
#      cmd/server/modules.go (the frontend fails to compile against a stale one); it runs twice,
#      since the run that rewrites the file fails.
#   3. go vet, then golangci-lint when it is installed.
#   4. The Go tests, when a database is reachable: TEST_DATABASE_URL, or Docker for a container.
#   5. The frontend: npm ci when node_modules is missing, its lint and format checks if it has them,
#      its tests with the 100% coverage gate, and its type-checked build.
#
# It stops at the first failure with what to do, and ends by naming every step it skipped: a
# skipped step has not passed.
set -uo pipefail

if [ ! -f go.mod ] || [ ! -d cmd/server ]; then
  echo "check: run this from the app's root (where go.mod and cmd/server are)" >&2
  exit 2
fi
log="$(mktemp -t roux-check.XXXXXX)"
skipped=()

fail() {
  echo "check: FAIL $1" >&2
  echo "  $2" >&2
  # Compile and vet errors with file and line, failing tests, lint findings, type errors, and
  # coverage shortfalls; then the rows that list uncovered lines.
  grep -E '\.go:[0-9]+|^--- FAIL|^FAIL|panic:|error TS|ERROR: Coverage|FAIL |AssertionError|Expected|✗|[0-9]+:[0-9]+ +error' "$log" \
    | awk '!seen[$0]++' | head -n 25 | sed 's/^/  /' >&2
  grep -E '\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| *[0-9][0-9,-]* *$' "$log" | head -n 10 | sed 's/^/  uncovered: /' >&2
  echo "  full output: $log" >&2
  exit 1
}

step() { echo "check: $1" >&2; }

# 1. Format.
step "gofmt"
go list -f '{{.Dir}}' ./... >"$log.dirs" 2>"$log" || fail "go list" "the module does not load: fix go.mod or the import named below"
xargs gofmt -w <"$log.dirs" >"$log" 2>&1 || fail "gofmt" "a file does not parse: fix the syntax error below"
rm -f "$log.dirs"

# 2. The permissions list.
if [ -f cmd/server/permissions_test.go ]; then
  step "permissions.gen.ts"
  perms="TestTheFrontEndListsEveryPermission"
  if ! go test ./cmd/server -run "$perms" >"$log" 2>&1; then
    go test ./cmd/server -run "$perms" >"$log" 2>&1 \
      || fail "permissions" "the permissions test fails twice: read it; permissions() in cmd/server/modules.go must compile and list each feature's Permissions"
  fi
else
  skipped+=("permissions.gen.ts (no cmd/server/permissions_test.go)")
fi

# 3. Vet and lint.
step "go vet"
go vet ./... >"$log" 2>&1 || fail "go vet" "fix each finding below (it compiles the tests too)"
lint="${GOLANGCI_LINT:-golangci-lint}"
if command -v "$lint" >/dev/null 2>&1; then
  step "golangci-lint"
  "$lint" run ./... >"$log" 2>&1 || fail "golangci-lint" "fix each finding below; never silence one with nolint"
else
  skipped+=("golangci-lint (not installed; CI runs it)")
fi

# 4. The Go tests.
if [ -n "${TEST_DATABASE_URL:-}" ] || docker info >/dev/null 2>&1; then
  step "go test"
  go test ./... >"$log" 2>&1 || fail "go test" "a test fails: fix the code (or the test's data), never delete the test"
else
  skipped+=("the Go tests (no TEST_DATABASE_URL and no Docker): read each test against the recipe's step 7")
fi

# 5. The frontend.
if [ -f frontend/package.json ]; then
  has() { grep -q "\"$1\":" frontend/package.json; }
  if [ ! -d frontend/node_modules ]; then
    step "npm ci"
    (cd frontend && npm ci --no-audit --no-fund) >"$log" 2>&1 || fail "npm ci" "the frontend's dependencies do not install"
  fi
  for script in format:check lint; do
    if has "$script"; then
      step "npm run $script"
      (cd frontend && npm run -s "$script") >"$log" 2>&1 || fail "npm run $script" "fix each finding below"
    fi
  done
  if has coverage; then
    step "npm run coverage"
    (cd frontend && npm run -s coverage) >"$log" 2>&1 \
      || fail "frontend tests" "a test fails, or a line or branch runs in no test (100% gate): test it, don't delete it"
  else
    step "npm test"
    (cd frontend && npm test) >"$log" 2>&1 || fail "frontend tests" "a test fails"
  fi
  step "npm run build"
  (cd frontend && npm run -s build) >"$log" 2>&1 || fail "frontend build" "a type error or a missing import: fix each one below"
else
  skipped+=("the frontend (no frontend/package.json)")
fi

for s in "${skipped[@]+"${skipped[@]}"}"; do
  echo "check: SKIPPED $s" >&2
done
rm -f "$log"
echo "check: ok"
