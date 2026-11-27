#!/usr/bin/env bash
# Proves an eval fixture (eval-fixture.sh) works in the eval's sandbox before any run is spent on it.
# On a copy of the fixture's app, with a copy of its home as HOME (as place-app.sh lays them out), it
# runs what an agent runs, under macOS's sandbox-exec with what `claude plugin eval`'s sandbox takes
# away: no reading under the real home directory (where Go and Node are installed), no writing
# under an .idea or .vscode directory, and every request sent to a proxy that refuses it (403):
#   make fmt vet lint                       the Go checks but the tests
#   go test -run '^$' ./...                 every test compiled (the database tests need Docker)
#   frontend: npm run lint, coverage, build the frontend's gates
#   make build                              the release binary, the front end's install and build in it
#   the skill's scripts/check.sh            at the plugin's commit, as the arm with the plugin runs it
# Each must succeed; the fixture itself is never touched.
#
# Usage: eval-preflight.sh <fixture dir> [<plugin commit>]   (default: the fixture's commit;
#        eval-fixture.sh runs it on every fixture it writes)
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [ ! -d "$1/app/.git" ] || [ ! -d "$1/home" ]; then
  echo "usage: $(basename "$0") <fixture dir with app/ and home/> [<plugin commit>]" >&2
  exit 2
fi
fixture="$(cd "$1" && pwd -P)"
if ! command -v sandbox-exec >/dev/null; then
  echo "eval-preflight: no sandbox-exec (macOS only); the fixture is not proven" >&2
  exit 0
fi

# Under /private/tmp, as the eval's runs are: not in the per-user temp directory it denies below.
base="$(mktemp -d /private/tmp/eval-preflight.XXXXXX)"
base="$(cd "$base" && pwd -P)"
run_home="$base/home"
copy="$run_home/cwd"
mkdir -p "$run_home"
cp -c -R "$fixture/home/." "$run_home/" 2>/dev/null || cp -R "$fixture/home/." "$run_home/"
chmod -R u+w "$run_home/go"
mkdir "$copy"
cp -R "$fixture/app/." "$copy/"
mkdir "$base/tmp"

# The refusing proxy.
node -e '
  const http = require("http");
  const deny = (s) => s.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
  const server = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  server.on("connect", (q, s) => deny(s));
  server.listen(0, "127.0.0.1", () => console.log(server.address().port));
' >"$base/proxy.port" &
proxy=$!
disown "$proxy"
trap 'kill "$proxy" 2>/dev/null; chmod -R u+w "$base" 2>/dev/null; rm -rf "$base"' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$base/proxy.port" ] && break; sleep 0.2; done
port="$(cat "$base/proxy.port")"
proxy_url="http://127.0.0.1:$port"
log="$base/preflight.log"

# The real home is unreadable, but its programs still run (the eval's sandbox lets the go and mise
# on PATH start): sandbox-exec needs the read to map a binary, so each one PATH finds is allowed.
allow=""
for tool in go gofmt node npm mise golangci-lint; do
  found="$(command -v "$tool" || true)"
  [ -n "$found" ] || continue
  allow+="(allow file-read* (literal \"$found\") (literal \"$(readlink -f "$found")\"))"
done
# mise's shims (node, npm) run too, as they do in the sandbox.
shims="$HOME/.local/share/mise/shims"
[ ! -d "$shims" ] || allow+="(allow file-read* (subpath \"$shims\"))"
# Nor can it write macOS's per-user temp directory (where `mktemp -t` writes whatever TMPDIR says,
# and xcrun keeps its cache); the agent's TMPDIR is a claude-<uid> directory under the run's tmp.
user_tmp="$(getconf DARWIN_USER_TEMP_DIR)"
user_tmp="$(cd "$user_tmp" && pwd -P)"
run_tmp="$base/tmp/claude-$(id -u)"
mkdir -p "$run_tmp"
profile="(version 1)(allow default)(deny file-read* (subpath \"$HOME\"))$allow(deny file-write* (regex #\"/\\.(idea|vscode)(/|$)\"))(deny file-write* (subpath \"$user_tmp\"))"
failed=0

step() {
  local name="$1"
  shift
  if (cd "$copy" && env -u GOMODCACHE -u GOCACHE -u GOFLAGS -u GOTOOLCHAIN -u GOPROXY -u GOROOT \
    -u npm_config_cache HOME="$run_home" TMPDIR="$run_tmp" HTTP_PROXY="$proxy_url" \
    HTTPS_PROXY="$proxy_url" http_proxy="$proxy_url" https_proxy="$proxy_url" NO_PROXY=localhost \
    no_proxy=localhost sandbox-exec -p "$profile" "$@") >"$log" 2>&1; then
    echo "eval-preflight: ok   $name" >&2
  else
    echo "eval-preflight: FAIL $name" >&2
    tail -n 15 "$log" | sed 's/^/  /' >&2
    failed=1
  fi
}

step "go runs the fixture's toolchain" sh -c 'go version | grep -q "$(sed -n "s/^GOTOOLCHAIN=//p" "$HOME/Library/Application Support/go/env")"'
step "make fmt vet lint" make fmt vet lint
step "go test -run '^\$' ./... (compiles every test)" go test -count=1 -run '^$' ./...
step "frontend: npm run lint" sh -c 'cd frontend && npm run lint'
step "frontend: npm run coverage" sh -c 'cd frontend && npm run coverage'
step "frontend: npm run build" sh -c 'cd frontend && npm run build'
step "make build" make build
# The skill's own check script, as the arm with the plugin runs it (its database tests skipped).
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
plugin_commit="${2:-$(cat "$fixture/commit" 2>/dev/null)}"
if [ -n "$plugin_commit" ] &&
  git -C "$root" show "$plugin_commit:plugins/roux/skills/roux/scripts/check.sh" >"$base/check.sh" 2>/dev/null; then
  step "the skill's scripts/check.sh" bash "$base/check.sh"
fi

if [ "$failed" -ne 0 ]; then
  echo "eval-preflight: $fixture does not work in the eval's sandbox" >&2
  exit 1
fi
