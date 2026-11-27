#!/usr/bin/env bash
# The case's scaffold: the app the run works in, copied into the run directory (the current one), and
# the toolchain's settings and caches into the run's home (HOME), from $ROUX_EVAL_APP_FIXTURE, a
# fixture written by eval-fixture.sh (its app/ and home/; that script says why a home). The app's
# git history comes along, so the run's changes show as a diff.
set -euo pipefail
# claude plugin eval runs this with a cleaned environment, so the fixture can also be named in
# evals/fixture-app.local (git-ignored): one line, the fixture's absolute path.
local_file="$(cd "$(dirname "$0")/.." && pwd)/fixture-app.local"
if [ -z "${ROUX_EVAL_APP_FIXTURE:-}" ] && [ -f "$local_file" ]; then
  ROUX_EVAL_APP_FIXTURE="$(head -n 1 "$local_file")"
fi
: "${ROUX_EVAL_APP_FIXTURE:?set ROUX_EVAL_APP_FIXTURE, or write the path to evals/fixture-app.local, to a fixture written by eval-fixture.sh}"
[ -d "$ROUX_EVAL_APP_FIXTURE/app/.git" ] && [ -d "$ROUX_EVAL_APP_FIXTURE/home" ] ||
  { echo "$ROUX_EVAL_APP_FIXTURE is not a fixture (no app/.git or home/)" >&2; exit 1; }
cp -R "$ROUX_EVAL_APP_FIXTURE/app/." .
# A clone where the file system can make one (APFS): the module cache is large.
cp -c -R "$ROUX_EVAL_APP_FIXTURE/home/." "$HOME/" 2>/dev/null || cp -R "$ROUX_EVAL_APP_FIXTURE/home/." "$HOME/"
chmod -R u+w "$HOME/go"
