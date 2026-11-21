#!/usr/bin/env bash
# Records native metadata with GraalVM's tracing agent while the Playwright suite drives the app
# on the JVM, then builds the native binary with it and runs the same suite against the binary.
#
#   scripts/trace.sh           trace, then the traced native end-to-end run
#   scripts/trace.sh --only    trace only
#
# The metadata lands in target/native-trace (reachability-metadata.json). It measures what who and
# its stack do not ship yet; it is not committed. Logs: target/trace-*.log, target/app.log.
set -euo pipefail
cd "$(dirname "$0")/.."
# GraalVM 25: GRAALVM_HOME if set, otherwise JAVA_HOME.
export JAVA_HOME=${GRAALVM_HOME:-$JAVA_HOME}
export PATH="$JAVA_HOME/bin:$PATH"

# clean: no AOT output or stale metadata from an earlier native build on the traced classpath.
log=$(mktemp)
./mvnw -B -Pnative-trace clean verify | tee "$log"
cp "$log" target/trace-jvm.log
cp target/app.log target/trace-jvm-app.log
ls -l target/native-trace

if [[ "${1:-}" != "--only" ]]; then
  ./mvnw -B -Pnative-e2e,traced verify | tee target/trace-native.log
fi
