#!/usr/bin/env bash
#
# Tests scripts/export-app-template.sh: the copy it writes, and each check that must stop it.
# Usage: scripts/export-app-template.test.sh   (CI runs it; it needs only git and python3)

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"
EXPORT="$ROOT/scripts/export-app-template.sh"
ROUX_VERSION="$(sed -n 's:^    <version>\(.*\)</version>$:\1:p' pom.xml | head -1)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

pass() { echo "ok: $1"; }
fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

# A git repository holding templates/app's tracked files, for a test to change.
source_copy() {
  local dir="$WORK/$1"
  mkdir -p "$dir"
  git -C templates/app ls-files -z | (cd templates/app && xargs -0 tar cf -) | tar xf - -C "$dir"
  git -C "$dir" init -q
  git -C "$dir" add -A
  git -C "$dir" -c user.name=t -c user.email=t@example.test commit -qm source
  echo "$dir"
}

# Runs the export; prints its output; returns its exit status.
export_from() {
  "$EXPORT" --from "$1" "$2" "$3" 2>&1
}

# 1. The copy: the release version, no trace of roux's repository, a wrapper of its own.
out="$WORK/out-release"
if export_from "$ROOT/templates/app" 9.8.7 "$out" >"$WORK/release.log"; then
  pass "a release export succeeds"
else
  fail "a release export succeeds"; cat "$WORK/release.log"
fi
grep -q '<roux.version>9.8.7</roux.version>' "$out/pom.xml" && pass "roux.version is the release" || fail "roux.version is the release"
grep -q '"@jwcarman/roux-web": "9.8.7"' "$out/frontend/package.json" && pass "roux-web comes from npm at the release" || fail "roux-web comes from npm at the release"
grep -q 'roux-repository' "$out/pom.xml" && fail "the roux-repository profile is gone" || pass "the roux-repository profile is gone"
[ -x "$out/mvnw" ] && [ -f "$out/mvnw.cmd" ] && [ -f "$out/.mvn/wrapper/maven-wrapper.properties" ] \
  && pass "the Maven wrapper is added" || fail "the Maven wrapper is added"
[ -e "$out/.factorypath" ] && fail "untracked files stay behind" || pass "untracked files stay behind"
[ -f "$out/README.md" ] && [ -f "$out/frontend/src/App.tsx" ] && pass "tracked files are copied" || fail "tracked files are copied"

# 2. A SNAPSHOT export checks the template follows roux's version.
export_from "$ROOT/templates/app" "$ROUX_VERSION" "$WORK/out-snapshot" >"$WORK/snapshot.log" \
  && pass "a SNAPSHOT export at roux's version succeeds" || { fail "a SNAPSHOT export at roux's version succeeds"; cat "$WORK/snapshot.log"; }

src="$(source_copy stale)"
sed -i.bak "s:<roux.version>$ROUX_VERSION</roux.version>:<roux.version>0.0.1-SNAPSHOT</roux.version>:" "$src/pom.xml"
rm "$src/pom.xml.bak"
if export_from "$src" "$ROUX_VERSION" "$WORK/out-stale" >"$WORK/stale.log"; then
  fail "a SNAPSHOT export refuses a template behind roux's version"
else
  grep -q "roux.version" "$WORK/stale.log" && pass "a SNAPSHOT export refuses a template behind roux's version" \
    || { fail "the refusal names roux.version"; cat "$WORK/stale.log"; }
fi

# 3. Each forbidden name and directory stops the export.
for name in web/roux-web roux-parent; do
  src="$(source_copy "name-${name//\//-}")"
  echo "see $name" >>"$src/README.md"
  git -C "$src" commit -qam planted
  if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/name.log"; then
    fail "an export naming $name is refused"
  else
    grep -q "$name" "$WORK/name.log" && pass "an export naming $name is refused" || { fail "the refusal names $name"; cat "$WORK/name.log"; }
  fi
done

for dir in node_modules target dist test-results; do
  src="$(source_copy "dir-$dir")"
  mkdir -p "$src/e2e/$dir"
  echo x >"$src/e2e/$dir/planted.txt"
  git -C "$src" add -f "e2e/$dir/planted.txt"
  git -C "$src" -c user.name=t -c user.email=t@example.test commit -qm planted
  if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/dir.log"; then
    fail "an export shipping $dir is refused"
  else
    grep -q "$dir" "$WORK/dir.log" && pass "an export shipping $dir is refused" || { fail "the refusal names $dir"; cat "$WORK/dir.log"; }
  fi
done

# 4. The output directory must not hold anything already, so nothing stale survives.
mkdir -p "$WORK/full" && echo x >"$WORK/full/old.txt"
export_from "$ROOT/templates/app" 9.8.7 "$WORK/full" >"$WORK/full.log" \
  && fail "an export into a directory with files in it is refused" || pass "an export into a directory with files in it is refused"

if [ "$failures" -gt 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
