#!/usr/bin/env bash
# The roux app's checks that need no Docker, in the order the build needs them. Run it from the
# app's root before you finish:  bash <this skill's directory>/scripts/check.sh
#
#   1. Every Liquibase changelog is well-formed XML (one that is not stops the app from starting).
#   2. If pom.xml has Spotless: ./mvnw spotless:apply formats the Java (every later Maven run checks
#      the format and fails on it).
#   3. If the app has PermissionsListTest: it rewrites frontend/src/permissions.gen.ts from the
#      Permissions constants (the frontend build fails against a stale one); it runs again when the
#      first run rewrote it.
#   4. ./mvnw test-compile compiles main and test code. The frontend's tests (npm run coverage, or
#      npm test) and build (npm run build) run too: through the pom when it runs them (a template-made
#      app's does, in test-compile), here otherwise.
#
# A roux app made from the template has all of these; one that isn't may lack some. The script
# checks what the app has and says what it skipped, so a skipped step is never reported as passed.
# It stops at the first failure with what to do. The Java tests need Docker: ./mvnw verify runs them.
set -uo pipefail

if [ ! -x ./mvnw ] || [ ! -f pom.xml ]; then
  echo "check: run this from the app's root (where mvnw is)" >&2
  exit 2
fi
log="$(mktemp -t roux-check.XXXXXX)"
skipped=()

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

# The npm scripts the pom runs itself (frontend-maven-plugin's <arguments>run X</arguments>).
pom_runs() {
  grep -Eq "<arguments>run $1</arguments>" pom.xml
}
# Whether frontend/package.json defines an npm script.
has_script() {
  [ -f frontend/package.json ] && node -e 'process.exit(require("./frontend/package.json").scripts?.[process.argv[1]] ? 0 : 1)' "$1" 2>/dev/null
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
if grep -q "<artifactId>spotless-maven-plugin</artifactId>" pom.xml; then
  ./mvnw -B spotless:apply >"$log" 2>&1 || fail "./mvnw spotless:apply" "a Java file that does not parse"
  echo "check: ok   Java formatted"
else
  skipped+=("formatting (no Spotless in pom.xml)")
fi

# 3. The permissions list.
if [ -n "$(find src/test -name PermissionsListTest.java 2>/dev/null | head -n 1)" ]; then
  permissions() {
    ./mvnw -B test -Dskip.npm -Dtest=PermissionsListTest -Dsurefire.failIfNoSpecifiedTests=false >"$log" 2>&1
  }
  permissions || permissions || fail "PermissionsListTest (it compiles the app first)" \
    "a Java compile error below; or Permissions.class missing from PermissionClasses.ALL"
  echo "check: ok   permissions.gen.ts matches the Permissions constants"
else
  skipped+=("the permissions list (no PermissionsListTest)")
fi

# 4. Compile, and the frontend's tests and build: the pom's, or here.
./mvnw -B test-compile >"$log" 2>&1 || fail "./mvnw test-compile" \
  "a Java compile error, or a frontend step the pom runs (cd frontend && npm run coverage; npm run build)"
echo "check: ok   Java compiled"

if [ -f frontend/package.json ]; then
  frontend_test=""
  if pom_runs coverage || pom_runs test; then
    echo "check: ok   frontend tests (run by the pom)"
  elif has_script coverage; then
    frontend_test=coverage
  elif has_script test; then
    frontend_test=test
  else
    skipped+=("frontend tests (no coverage or test script)")
  fi
  if [ -n "$frontend_test" ]; then
    [ -d frontend/node_modules ] || (cd frontend && npm ci) >"$log" 2>&1 || fail "npm ci" "the frontend's dependencies"
    once=()
    [ "$frontend_test" = test ] && once=(-- --run) # vitest's test script watches without it
    (cd frontend && npm run "$frontend_test" "${once[@]+"${once[@]}"}") >"$log" 2>&1 || fail "npm run $frontend_test" \
      "a failing frontend test or uncovered lines"
    echo "check: ok   frontend tests (npm run $frontend_test)"
  fi
  if pom_runs build; then
    echo "check: ok   frontend build (run by the pom)"
  elif has_script build; then
    (cd frontend && npm run build) >"$log" 2>&1 || fail "npm run build" "a type error or a bundling error"
    echo "check: ok   frontend build (npm run build)"
  else
    skipped+=("the frontend build (no build script)")
  fi
fi

rm -f "$log"
for step in "${skipped[@]+"${skipped[@]}"}"; do
  echo "check: skipped $step"
done
echo "check: ok   (the Java tests need Docker: ./mvnw verify runs them)"
