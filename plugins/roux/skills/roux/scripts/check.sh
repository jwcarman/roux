#!/usr/bin/env bash
# The roux app's checks that need no Docker, in the order the build needs them. Run it from the
# app's root before you finish:  bash <this skill's directory>/scripts/check.sh
#
#   1. Every Liquibase changelog is well-formed XML (one that is not stops the app from starting).
#   2. ./mvnw spotless:apply formats the Java: every later Maven run checks the format and fails on it.
#   3. PermissionsListTest rewrites frontend/src/permissions.gen.ts from the Permissions constants
#      (the frontend build fails against a stale one); it runs again when the first run rewrote it.
#   4. ./mvnw test-compile compiles main and test code, and runs the frontend's npm ci, its tests
#      with the 100% coverage gate, and its type-checked build.
#
# It stops at the first failure with what to do. The Java tests need Docker: ./mvnw verify runs them.
set -uo pipefail

if [ ! -x ./mvnw ] || [ ! -f pom.xml ]; then
  echo "check: run this from the app's root (where mvnw is)" >&2
  exit 2
fi
log="$(mktemp -t roux-check.XXXXXX)"

fail() {
  echo "check: FAIL $1" >&2
  echo "  $2" >&2
  [ -n "${3:-}" ] && head -n 5 "$log" | sed 's/^/  /' >&2
  # Compile errors, failing tests and type errors; then coverage rows that list uncovered lines.
  grep -E '^\[ERROR\] .*\.(java|xml)|ERROR: Coverage|error TS|FAIL |AssertionError|violations|Expected' "$log" \
    | sed -E 's/^\[INFO\] //' | awk '!seen[$0]++' | head -n 20 | sed 's/^/  /' >&2
  grep -E '\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| *[0-9][0-9,-]* *$' "$log" | sed -E 's/^\[INFO\] //' \
    | head -n 10 | sed 's/^/  uncovered: /' >&2
  echo "  full output: $log" >&2
  exit 1
}

# 1. Changelogs.
for xml in src/main/resources/db/changelog/*.xml; do
  [ -f "$xml" ] || continue
  if command -v xmllint >/dev/null; then
    xmllint --noout "$xml" >"$log" 2>&1
  else
    python3 -c 'import sys, xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])' "$xml" >"$log" 2>&1
  fi || fail "$xml is not well-formed XML" \
    "every changeSet goes inside <databaseChangeLog>, before its closing tag; nothing after it" raw
done
echo "check: ok   changelogs are well-formed"

# 2. Format.
./mvnw -B spotless:apply >"$log" 2>&1 || fail "./mvnw spotless:apply" "a Java file that does not parse"
echo "check: ok   Java formatted"

# 3. The permissions list.
if [ -f frontend/src/permissions.gen.ts ]; then
  permissions() {
    ./mvnw -B test -Dskip.npm -Dtest=PermissionsListTest -Dsurefire.failIfNoSpecifiedTests=false >"$log" 2>&1
  }
  permissions || permissions || fail "PermissionsListTest (it compiles the app first)" \
    "a Java compile error below; or Permissions.class missing from PermissionClasses.ALL"
  echo "check: ok   permissions.gen.ts matches the Permissions constants"
fi

# 4. Compile, and the frontend's gates.
./mvnw -B test-compile >"$log" 2>&1 || fail "./mvnw test-compile" \
  "a Java compile error, or the frontend's tests, 100% coverage or type check (cd frontend && npm run coverage; npm run build)"
echo "check: ok   Java compiled; frontend tests, 100% coverage and build pass"

rm -f "$log"
echo "check: ok   (the Java tests need Docker: ./mvnw verify runs them)"
