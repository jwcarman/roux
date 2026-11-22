#!/usr/bin/env bash
# Proves an eval fixture works in the eval's sandbox before any run is spent on it. On a copy of the
# fixture it runs what an agent runs, under macOS's sandbox-exec with what `claude plugin eval`'s
# sandbox takes away: no reading of the home directory, no writing under an .idea or .vscode
# directory, and every request sent to a proxy that refuses it (403):
#   ./mvnw -B -o spotless:apply test-compile   (the Java, formatted and compiled, and the build's
#                                               own frontend steps: npm install, coverage, build)
#   frontend: npx vitest run, npx tsc -b       (the frontend's tests and type check)
# Each must succeed and print no [ERROR]; the fixture's own state is never touched. The Java tests
# need Docker, which the sandbox does not have: the check after a run (check-roux-way.sh) runs them.
#
# Usage: eval-preflight.sh <fixture dir>     (eval-fixture.sh runs it on every fixture it writes)
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -x "$1/mvnw" ]; then
  echo "usage: $(basename "$0") <fixture dir>" >&2
  exit 2
fi
fixture="$(cd "$1" && pwd -P)"
if ! command -v sandbox-exec >/dev/null; then
  echo "eval-preflight: no sandbox-exec (macOS only); the fixture is not proven" >&2
  exit 0
fi

copy="$(mktemp -d)/fixture"
cp -R "$fixture" "$copy"

# The refusing proxy, on the fixture's own Node.
node="$(ls -d "$copy"/target/node/node 2>/dev/null || command -v node)"
"$node" -e '
  const http = require("http");
  const deny = (s) => s.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
  const server = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  server.on("connect", (q, s) => deny(s));
  server.listen(0, "127.0.0.1", () => console.log(server.address().port));
' >"$(dirname "$copy")/proxy.port" &
proxy=$!
disown "$proxy"
trap 'kill "$proxy" 2>/dev/null; rm -rf "$(dirname "$copy")"' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$(dirname "$copy")/proxy.port" ] && break; sleep 0.2; done
port="$(cat "$(dirname "$copy")/proxy.port")"
export HTTP_PROXY="http://127.0.0.1:$port" HTTPS_PROXY="http://127.0.0.1:$port"
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" NO_PROXY=localhost no_proxy=localhost
log="$(dirname "$copy")/preflight.log"
# The eval's sandbox also refuses any write under an .idea directory (and .vscode): npm ci, which
# deletes node_modules first, fails on a package that ships one.
profile="(version 1)(allow default)(deny file-read* (subpath \"$HOME\"))(deny file-write* (regex #\"/\\.(idea|vscode)(/|$)\"))"
failed=0

step() {
  local name="$1"
  shift
  if (cd "$copy" && sandbox-exec -p "$profile" "$@") >"$log" 2>&1 && ! grep -q '^\[ERROR\]' "$log"; then
    echo "eval-preflight: ok   $name" >&2
  else
    echo "eval-preflight: FAIL $name" >&2
    grep -E '^\[ERROR\]|ERR!|error|FAIL|sandbox' "$log" | head -n 15 | sed 's/^/  /' >&2
    failed=1
  fi
}

step "./mvnw spotless:apply test-compile" ./mvnw -B -o -q spotless:apply test-compile
step "frontend tests (vitest)" sh -c 'cd frontend && npx vitest run'
step "frontend type check (tsc -b)" sh -c 'cd frontend && npx tsc -b'

if [ "$failed" -ne 0 ]; then
  echo "eval-preflight: $fixture does not work in the eval's sandbox" >&2
  exit 1
fi
