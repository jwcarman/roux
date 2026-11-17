#!/usr/bin/env bash
# The case's scaffold: the app the run works in, copied into the run directory (the current one)
# from $ROUX_EVAL_FIXTURE: eval-fixture.sh's dojo for the roux arms, plain-fixture.sh's app for the
# plain-stack arm. Its git history comes along, so the run's changes show as a diff.
set -euo pipefail
: "${ROUX_EVAL_FIXTURE:?set ROUX_EVAL_FIXTURE to a fixture written by eval-fixture.sh or plain-fixture.sh}"
[ -d "$ROUX_EVAL_FIXTURE/.git" ] || { echo "$ROUX_EVAL_FIXTURE is not a fixture (no .git)" >&2; exit 1; }
cp -R "$ROUX_EVAL_FIXTURE/." .
