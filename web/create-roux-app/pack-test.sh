#!/usr/bin/env bash
#
# Tests the package as npm will ship it: bundles the template at a stand-in version, builds, packs,
# and runs the packed starter in an empty directory. The app it makes must carry its own names
# everywhere, its .gitignore files, roux at that version, and a first commit.
#
# Usage: web/create-roux-app/pack-test.sh   (CI runs it; it needs git, python3 and npm)

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# Never published: the bundle only needs a version to write, and --locks is not used.
version="0.0.0-pack.test"
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
[[ -z "$left" ]] && pass "no template name is left" || fail "no template name is left: $left"
mangled="$(grep -rIl --exclude-dir=.git -e '@jwcarman/acme-gym' -e 'create-acme-gym' "$app" || true)"
[[ -z "$mangled" ]] && pass "no starter name was renamed into the app's" || fail "no starter name was renamed into the app's: $mangled"
grep -q '^module acme-gym$' "$app/go.mod" && pass "the Go module is acme-gym" || fail "the Go module is acme-gym"
grep -q $'^\tgithub.com/jwcarman/roux v'"$version"'$' "$app/go.mod" && pass "roux is at the bundled version" || fail "roux is at the bundled version"
grep -q 'DisplayName: "Acme Gym"' "$app/cmd/server/main.go" && pass "the app is called Acme Gym" || fail "the app is called Acme Gym"
grep -q '"name": "acme-gym-web"' "$app/frontend/package.json" && pass "the front end is acme-gym-web" || fail "the front end is acme-gym-web"
[[ -f "$app/.gitignore" ]] && [[ ! -e "$app/_gitignore" ]] && pass "the .gitignore is back" || fail "the .gitignore is back"
grep -q '"roux@roux": true' "$app/.claude/settings.json" 2>/dev/null && pass "roux's plugin is enabled in the app" || fail "roux's plugin is enabled in the app"
[[ "$(git -C "$app" rev-list --count HEAD 2>/dev/null)" = 1 ]] && pass "the app has its first commit" || fail "the app has its first commit"
[[ -z "$(git -C "$app" status --porcelain)" ]] && pass "the commit holds everything" || fail "the commit holds everything"
grep -q "cd acme-gym" "$work/out.txt" && pass "it says how to start the app" || fail "it says how to start the app"

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo "all passed"
