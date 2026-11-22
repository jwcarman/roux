#!/usr/bin/env bash
#
# Tests the package as npm will ship it: bundles the template at roux's version, builds, packs, and
# runs the packed starter in an empty directory. The app it makes must carry its own names
# everywhere, its .gitignore files, a runnable Maven wrapper and a first commit.
#
# Usage: web/create-roux-app/pack-test.sh   (CI runs it; it needs git, python3 and npm)

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
version="$(sed -n 's:^    <version>\(.*\)</version>$:\1:p' "$root/pom.xml" | head -1)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
pass() { echo "ok: $1"; }
fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

"$here/bundle-template.sh" "$version" >/dev/null
(cd "$here" && npm run build --silent && npm pack --silent --pack-destination "$work" >/dev/null)
tar xzf "$work"/jwcarman-create-roux-app-*.tgz -C "$work"

mkdir "$work/apps"
(
  cd "$work/apps"
  GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.test GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.test \
    node "$work/package/dist/bin.js" acme-gym --name "Acme Gym" >"$work/out.txt"
) && pass "the packed starter runs" || { fail "the packed starter runs"; cat "$work/out.txt"; }
app="$work/apps/acme-gym"

left="$(grep -rIl --exclude-dir=.git -e 'Roux App' -e 'roux-app' "$app" || true)"
[ -z "$left" ] && pass "no template name is left" || fail "no template name is left: $left"
grep -q '<artifactId>acme-gym</artifactId>' "$app/pom.xml" && pass "the artifact is acme-gym" || fail "the artifact is acme-gym"
grep -q 'app-name: "Acme Gym"' "$app/src/main/resources/application.yml" && pass "the app is called Acme Gym" || fail "the app is called Acme Gym"
[ -f "$app/.gitignore" ] && [ ! -e "$app/_gitignore" ] && pass "the .gitignore is back" || fail "the .gitignore is back"
[ -x "$app/mvnw" ] && [ -f "$app/.mvn/wrapper/maven-wrapper.properties" ] && pass "the Maven wrapper runs" || fail "the Maven wrapper runs"
[ "$(git -C "$app" rev-list --count HEAD 2>/dev/null)" = 1 ] && pass "the app has its first commit" || fail "the app has its first commit"
[ -z "$(git -C "$app" status --porcelain)" ] && pass "the commit holds everything" || fail "the commit holds everything"
grep -q "cd acme-gym" "$work/out.txt" && pass "it says how to start the app" || fail "it says how to start the app"

[ "$failures" -eq 0 ] || { echo "$failures failed"; exit 1; }
echo "all passed"
