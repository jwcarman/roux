#!/usr/bin/env bash
# The eval fixture: a new app made from roux's template at <commit>, and everything an eval's sandbox
# needs to build it, written into <dir> (outside the repository):
#
#   <dir>/app    the app, as create-roux-app writes it, but with roux at <commit> (a Go pseudo-version,
#                so <commit> must be pushed: the module proxy serves it) and roux-web at <commit>
#                packed into app/frontend/vendor/ (not app/vendor/: go would read that as vendored modules). Its node_modules are installed, golangci-lint is built into
#                bin/ where `make lint` looks, and git holds one commit, so a run's changes show as a
#                diff. No .claude/: both arms share the fixture, and its settings would load roux's
#                plugin into the arm without it.
#   <dir>/home   what the case's scaffold (place-app.sh) copies into the run's home directory.
#   <dir>/commit <commit>, in full.
#
# Why a home: `claude plugin eval`'s sandbox lets an agent run programs anywhere but read nothing
# under the real home directory, and Go and Node are installed there (mise). Its shell keeps the real
# PATH, and HOME is a fresh directory of the run's own. So:
#   - Go: the go on PATH starts but cannot read its own standard library. The home's go env
#     (Library/Application Support/go/env) sets GOTOOLCHAIN to a toolchain other than the installed
#     one, which go then runs from the module cache (home/go/pkg/mod), offline (GOPROXY=off). go
#     will not run a toolchain it has not checked against the checksum database (GOSUMDB=off refuses
#     it), so the database's state as the fixture saw it (home/go/pkg/sumdb, GOPATH's) comes along
#     and its tiles are in the module cache. GOSUMDB is named, since its default lives in
#     $GOROOT/go.env, which cannot be read. -buildvcs=false, since git does not work in the sandbox.
#   - Node: mise's shim is on PATH; with HOME the run's, mise looks for its installs and its config
#     in the home, where a copy of this machine's Node is put. npm's cache (home/.npm) holds every
#     package the app installs, and .npmrc says offline.
# The sandbox has no network and no Docker: the app's database tests cannot run there; the scoring
# after a run (check-roux-way.sh, eval-acceptance.sh) runs them.
#
# Prints <dir>. Usage: eval-fixture.sh <commit> <dir>
set -euo pipefail

# The toolchain the sandbox runs: any Go 1.27 other than the one installed (go switches only to a
# different version). The app's go.mod says go 1.27, so any 1.27.x builds it.
EVAL_GO=go1.27.3
GOLANGCI_LINT_VERSION=v2.15.0

if [ "$#" -ne 2 ]; then
  echo "usage: $(basename "$0") <commit> <dir>" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
commit="$(git -C "$root" rev-parse --verify "$1^{commit}")"
if [ -z "$(git -C "$root" branch -r --contains "$commit" 2>/dev/null)" ]; then
  echo "eval-fixture: ${commit:0:7} is not pushed; the Go module proxy serves only pushed commits" >&2
  exit 2
fi
if [ "$(GOTOOLCHAIN=local go env GOVERSION)" = "$EVAL_GO" ]; then
  echo "eval-fixture: the installed Go is $EVAL_GO; set EVAL_GO in this script to another 1.27.x" >&2
  exit 2
fi

mkdir -p "$2"
dir="$(cd "$2" && pwd -P)"
case "$dir/" in
  "$root"/*)
    rmdir "$dir" 2>/dev/null || true
    echo "$dir is inside the roux repository; write the fixture outside it" >&2
    exit 2
    ;;
esac
if [ -n "$(ls -A "$dir")" ]; then
  echo "$dir is not empty" >&2
  exit 2
fi
app="$dir/app"
home="$dir/home"
mkdir -p "$home"

work="$(mktemp -d)"
trap 'chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT

# roux exactly as committed at <commit>, away from the checkout (no local edits, no build output).
mkdir "$work/roux"
git -C "$root" archive "$commit" | tar -x -C "$work/roux"

# The template exported as the starter ships it, then roux at <commit> in place of a release.
git -C "$work/roux/template" init -q
git -C "$work/roux/template" add -A
git -C "$work/roux/template" -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid commit -q -m template
"$work/roux/scripts/export-app-template.sh" --from "$work/roux/template" 0.0.0 "$app" >&2
rm -rf "$app/.claude"

# Go: every module into the home's module cache, through the eval's toolchain.
export GOPATH="$home/go" GOMODCACHE="$home/go/pkg/mod" GOTOOLCHAIN="$EVAL_GO" GOFLAGS=-mod=mod
echo "fetching $EVAL_GO and the app's modules, roux at ${commit:0:7}" >&2
# The template requires v0.0.0, which go cannot resolve, so the commit's pseudo-version goes in by hand.
roux_version="$(cd "$work" && go list -m -f '{{.Version}}' "github.com/jwcarman/roux@$commit")"
(cd "$app" && go mod edit -require="github.com/jwcarman/roux@$roux_version" && go mod tidy && go mod download all) >&2
[ "$(cd "$app" && go env GOVERSION)" = "$EVAL_GO" ] || { echo "eval-fixture: go did not switch to $EVAL_GO" >&2; exit 1; }
echo "building golangci-lint $GOLANGCI_LINT_VERSION into app/bin" >&2
GOBIN="$app/bin" go install "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$GOLANGCI_LINT_VERSION" >&2
mv "$app/bin/golangci-lint" "$app/bin/golangci-lint-$GOLANGCI_LINT_VERSION"
grep -q "^GOLANGCI_LINT_VERSION := $GOLANGCI_LINT_VERSION\$" "$app/Makefile" ||
  { echo "eval-fixture: the Makefile pins another golangci-lint; raise GOLANGCI_LINT_VERSION here" >&2; exit 1; }
unset GOFLAGS GOPATH GOMODCACHE GOTOOLCHAIN
mkdir -p "$home/Library/Application Support/go"
printf '%s\n' "GOTOOLCHAIN=$EVAL_GO" GOPROXY=off GOSUMDB=sum.golang.org GOFLAGS=-buildvcs=false \
  >"$home/Library/Application Support/go/env"

# Node: this machine's, for mise in the run's home.
node_version="$(node -p 'process.versions.node')"
node_home="$(cd "$(dirname "$(node -p 'process.execPath')")/.." && pwd -P)"
mkdir -p "$home/.local/share/mise/installs/node" "$home/.config/mise"
cp -R "$node_home" "$home/.local/share/mise/installs/node/$node_version"
if [ -f "$(dirname "$node_home")/.mise.backend.toml" ]; then
  cp "$(dirname "$node_home")/.mise.backend.toml" "$home/.local/share/mise/installs/node/"
fi
printf '[tools]\nnode = "%s"\n' "$node_version" >"$home/.config/mise/config.toml"

# roux-web at <commit>, packed, and the frontend on that tgz, installed through the home's npm cache.
echo "building and packing roux-web at ${commit:0:7}" >&2
mkdir "$app/frontend/vendor"
(cd "$work/roux/web" && npm ci --no-audit --no-fund && npm run build -w @jwcarman/roux-web) >&2
tgz="$(cd "$work/roux/web/roux-web" && npm pack --silent --pack-destination "$app/frontend/vendor" | tail -n 1)"
[ -f "$app/frontend/vendor/$tgz" ] || { echo "npm pack wrote no $tgz" >&2; exit 1; }
node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.dependencies["@jwcarman/roux-web"] = "file:vendor/" + process.argv[2];
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$app/frontend/package.json" "$tgz"
export npm_config_cache="$home/.npm"
echo "installing the frontend and its lint tools" >&2
(cd "$app/frontend" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund &&
  npm ci --no-audit --no-fund) >&2
(cd "$app/frontend/lint-tools" && npm ci --no-audit --no-fund) >&2
# Proves the cache holds everything: a clean install offline.
(cd "$app/frontend" && rm -rf node_modules && npm ci --offline --no-audit --no-fund) >&2
unset npm_config_cache
printf '%s\n' offline=true audit=false fund=false >"$home/.npmrc"

# The Makefile installs with `npm install`, not `npm ci`. The sandbox refuses any write under an .idea
# directory, and a package (tunnel, through Stryker) ships one: `npm ci` deletes node_modules first,
# fails on that file and leaves node_modules half gone. `npm install` finds node_modules already
# matching the lock and touches nothing. A fixture-only change, made before its commit, so a run's
# diff starts after it.
grep -q 'npm ci' "$app/Makefile" || { echo "eval-fixture: the Makefile has no npm ci to replace" >&2; exit 1; }
sed -i '' 's/npm ci/npm install/g' "$app/Makefile"

# The front end built once, so the Go build (which embeds it under -tags embedweb) has a dist.
(cd "$app/frontend" && npm run build) >&2

git -C "$app" init -q -b main
git -C "$app" add -A
git -C "$app" -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid \
  commit -q -m "A new app at roux ${commit:0:7}"

# The commit, for run-evals.sh: the plugin runs at the same commit as the app's roux.
echo "$commit" >"$dir/commit"

# Prove it works in the eval's sandbox before any run is spent on it.
"$(dirname "$0")/eval-preflight.sh" "$dir"

echo "$dir"
