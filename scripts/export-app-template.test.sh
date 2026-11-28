#!/usr/bin/env bash
#
# Tests scripts/export-app-template.sh: the copy it writes, and each check that must stop it.
# Usage: scripts/export-app-template.test.sh   (CI runs it; it needs only git and python3)

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"
EXPORT="$ROOT/scripts/export-app-template.sh"
# The test's own commits need an author; a CI runner has no git identity.
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.test GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.test
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

pass() { echo "ok: $1"; }
fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

# A git repository holding template's tracked files, for a test to change.
source_copy() {
  local dir="$WORK/$1"
  mkdir -p "$dir"
  git -C template ls-files -z | (cd template && xargs -0 tar cf -) | tar xf - -C "$dir"
  git -C "$dir" init -q
  git -C "$dir" add -A
  git -C "$dir" -c user.name=t -c user.email=t@example.test commit -qm source
  echo "$dir"
}

# Runs the export; prints its output; returns its exit status.
export_from() {
  local from="$1" version="$2" out="$3"
  "$EXPORT" --from "$from" "$version" "$out" 2>&1
}

# 1. The copy: roux at the release from the module proxy and npm, nothing pointing into roux.
out="$WORK/out-release"
if export_from "$ROOT/template" 9.8.7 "$out" >"$WORK/release.log"; then
  pass "a release export succeeds"
else
  fail "a release export succeeds"; cat "$WORK/release.log"
fi
grep -q $'^\tgithub.com/jwcarman/roux v9.8.7$' "$out/go.mod" && pass "go.mod requires roux at v9.8.7" || fail "go.mod requires roux at v9.8.7"
grep -q '^replace' "$out/go.mod" && fail "the replace of roux is gone" || pass "the replace of roux is gone"
grep -q "roux's repository" "$out/go.mod" && fail "the replace's comment is gone" || pass "the replace's comment is gone"
grep -q '^ignore node_modules$' "$out/go.mod" && pass "the rest of go.mod stays" || fail "the rest of go.mod stays"
grep -q '^github.com/jwcarman/roux ' "$out/go.sum" && fail "go.sum names no roux" || pass "go.sum names no roux"
grep -q '"@jwcarman/roux-web": "9.8.7"' "$out/frontend/package.json" && pass "roux-web comes from npm at the release" || fail "roux-web comes from npm at the release"
[[ -e "$out/frontend/package-lock.json" ]] && fail "the frontend lock is left out" || pass "the frontend lock is left out"
diff -r "$ROOT/plugins/roux/skills/roux" "$out/.claude/skills/roux" >/dev/null \
  && pass "roux's skill ships in the app, as the release has it" || fail "roux's skill ships in the app, as the release has it"
grep -qs -e extraKnownMarketplaces -e enabledPlugins "$out/.claude/settings.json" \
  && fail "the app installs no plugin: its skill is in .claude/skills" || pass "the app installs no plugin: its skill is in .claude/skills"
[[ -f "$out/cmd/server/main.go" ]] && [[ -f "$out/frontend/src/main.tsx" ]] && pass "tracked files are copied" || fail "tracked files are copied"
[[ -e "$out/coverage.out" ]] && fail "untracked files stay behind" || pass "untracked files stay behind"

# 2. A version as npm writes it: a Go tag is refused, naming the form.
if export_from "$ROOT/template" v9.8.7 "$WORK/out-v" >"$WORK/v.log"; then
  fail "a v-prefixed version is refused"
else
  grep -q "0.4.0" "$WORK/v.log" && pass "a v-prefixed version is refused" || { fail "the refusal shows the form"; cat "$WORK/v.log"; }
fi

# 3. Each link into roux's repository, and each forbidden directory or file, stops the export.
src="$(source_copy no-replace)"
sed -i.bak '/^replace github.com\/jwcarman\/roux/d' "$src/go.mod" && rm "$src/go.mod.bak"
git -C "$src" commit -qam planted
if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/noreplace.log"; then
  fail "a go.mod without roux's replace is refused"
else
  grep -q "replace" "$WORK/noreplace.log" && pass "a go.mod without roux's replace is refused" || { fail "the refusal names the replace"; cat "$WORK/noreplace.log"; }
fi

src="$(source_copy name-roux-web)"
echo "// see web/roux-web" >>"$src/cmd/server/main.go"
git -C "$src" commit -qam planted
if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/name.log"; then
  fail "an export naming web/roux-web is refused"
else
  grep -q "web/roux-web" "$WORK/name.log" && pass "an export naming web/roux-web is refused" || { fail "the refusal names web/roux-web"; cat "$WORK/name.log"; }
fi

for path in node_modules dist test-results; do
  src="$(source_copy "dir-$path")"
  mkdir -p "$src/e2e/$path"
  echo x >"$src/e2e/$path/planted.txt"
  git -C "$src" add -f "e2e/$path/planted.txt"
  git -C "$src" -c user.name=t -c user.email=t@example.test commit -qm planted
  if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/dir.log"; then
    fail "an export shipping $path is refused"
  else
    grep -q "$path" "$WORK/dir.log" && pass "an export shipping $path is refused" || { fail "the refusal names $path"; cat "$WORK/dir.log"; }
  fi
done

src="$(source_copy named)"
echo '{}' >"$src/deploy/roux-app-thing.json"
git -C "$src" add deploy/roux-app-thing.json
git -C "$src" -c user.name=t -c user.email=t@example.test commit -qm planted
if export_from "$src" 9.8.7 "$WORK/out-$RANDOM" >"$WORK/named.log" 2>&1; then
  fail "a file named for roux-app is refused"
else
  grep -q "roux-app-thing.json" "$WORK/named.log" && pass "a file named for roux-app is refused" || { fail "the refusal names the file"; cat "$WORK/named.log"; }
fi

# 4. The output directory must not hold anything already, so nothing stale survives.
mkdir -p "$WORK/full" && echo x >"$WORK/full/old.txt"
export_from "$ROOT/template" 9.8.7 "$WORK/full" >"$WORK/full.log" \
  && fail "an export into a directory with files in it is refused" || pass "an export into a directory with files in it is refused"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
