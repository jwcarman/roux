#!/usr/bin/env bash
#
# Runs the app template's native-image tests on a Linux build host over ssh.
#
# The committed HEAD is sent as a git bundle (nothing is pushed), checked out on the host, roux's
# modules are installed there, and templates/app is tested as a native image:
#   ../../mvnw -PnativeTest verify    the Java tests compiled into a native image
#   ../../mvnw -Pnative-e2e verify    the native binary, then the Playwright suite against it
#
# Usage: scripts/native-remote.sh
#
# Environment:
#   NATIVE_HOST       required: the ssh host to build on
#   NATIVE_JAVA_HOME  the GraalVM (or Liberica NIK) home on the host; default: the host's JAVA_HOME
#   NATIVE_DIR        the working copy on the host; default: ~/roux-native
#
# The examples (dojo, template) are left out of the install: the template is the thing under test.
# The host needs git, Docker (the tests start PostgreSQL and Mailpit), gcc and zlib headers. Node
# and the Playwright browser are installed by the build; the browser also needs its system libraries
# (on Debian/Ubuntu: sudo npx playwright install-deps chromium). Logs stay on the host in $NATIVE_DIR:
# install.log, native-test.log and native-e2e.log. Exits non-zero when any step fails.

set -euo pipefail

: "${NATIVE_HOST:?set NATIVE_HOST to the ssh host to build on}"
NATIVE_DIR="${NATIVE_DIR:-~/roux-native}"
NATIVE_JAVA_HOME="${NATIVE_JAVA_HOME:-}"

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "warning: uncommitted changes are not sent; the host builds $(git rev-parse --short HEAD)" >&2
fi

bundle="$(mktemp -t roux-native.XXXXXX)"
trap 'rm -f "$bundle"' EXIT
git bundle create --quiet "$bundle" HEAD
scp -q "$bundle" "$NATIVE_HOST:roux-native.bundle"

echo "building $(git rev-parse --short HEAD) on the build host"

# The remote script takes its settings as arguments, so nothing local is expanded inside it.
ssh -o ServerAliveInterval=60 "$NATIVE_HOST" bash -s -- \
  "$NATIVE_DIR" "$NATIVE_JAVA_HOME" <<'REMOTE'
set -uo pipefail
dir="${1/#\~/$HOME}"; java_home="$2"
if [[ -n "$java_home" ]]; then
  export JAVA_HOME="$java_home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
[[ -n "${JAVA_HOME:-}" ]] || { echo "JAVA_HOME is not set on the host; set NATIVE_JAVA_HOME" >&2; exit 2; }
if [[ ! -d "$dir/.git" ]]; then
  git clone --quiet ~/roux-native.bundle "$dir"
fi
cd "$dir"
git fetch --quiet ~/roux-native.bundle HEAD
git checkout --quiet --force --detach FETCH_HEAD

# step <name> <log> <dir> <command...>: runs one step, logs it, stops the run when it fails.
step() {
  local name="$1" log="$dir/$2" where="$3"; shift 3
  local start=$SECONDS result=passed code=0
  (cd "$where" && "$@") > "$log" 2>&1 || { code=$?; result=FAILED; }
  local tests
  tests="$(grep -E 'Tests run:.*Failures' "$log" | tail -1 | sed 's/^\[[A-Z]*\] *//')"
  echo "$name: $result in $((SECONDS - start))s ${tests:+($tests)} (log: $log)"
  return $code
}

step "install roux" install.log "$dir" ./mvnw -B install -DskipTests -P '!examples' || exit 1
step "native tests" native-test.log "$dir/templates/app" ../../mvnw -B -PnativeTest verify; test_code=$?
step "native e2e" native-e2e.log "$dir/templates/app" ../../mvnw -B -Pnative-e2e verify; e2e_code=$?
exit $((test_code || e2e_code))
REMOTE
