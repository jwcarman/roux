#!/usr/bin/env bash
# Runs eval cases with and without roux's plugin, then scores every run's work by script, on a copy
# of its work tree carrying the fixture's untouched .git:
#   <tag>.accept.txt  eval-acceptance.sh: the case's hidden acceptance tests (when it has acceptance/)
#   <tag>.check.txt   check-roux-way.sh: the app's own gates, and roux's way
#   <tag>.diff        what the run changed (git diff against the fixture, new files included)
#   <tag>.trace.jsonl the run's transcript
# The fixture is evals/fixture-app.local's (eval-fixture.sh). The plugin is loaded from a git
# worktree at the fixture's commit, so the skill the agent reads describes the roux its app is
# built on; this checkout's evals/ is copied into it (the cases and their tests are today's).
#
# Usage: run-evals.sh [--runs N] [--model M] [--ablation with-without|none] <out dir> <case>...
#        (defaults: 3 runs, sonnet, with-without; none runs only the arm with the plugin)
set -uo pipefail
runs=3
model=sonnet
ablation=with-without
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runs) runs="$2"; shift 2 ;;
    --model) model="$2"; shift 2 ;;
    --ablation) ablation="$2"; shift 2 ;;
    *) break ;;
  esac
done
if [ "$#" -lt 2 ]; then
  echo "usage: $(basename "$0") [--runs N] [--model M] [--ablation with-without|none] <out dir> <case>..." >&2
  exit 2
fi
OUT="$1"; shift
PLUGIN="$(cd "$(dirname "$0")/.." && pwd -P)"
ROOT="$(cd "$PLUGIN/../.." && pwd -P)"
FIXTURE="$(head -n 1 "$PLUGIN/evals/fixture-app.local")"
COMMIT="$(cat "$FIXTURE/commit")"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd -P)"

worktree="$(mktemp -d)/roux"
git -C "$ROOT" worktree add -q --detach "$worktree" "$COMMIT" || exit 1
trap 'git -C "$ROOT" worktree remove --force "$worktree"' EXIT
rm -rf "$worktree/plugins/roux/evals"
rsync -a --exclude /results "$PLUGIN/evals/" "$worktree/plugins/roux/evals/"
echo "plugin at ${COMMIT:0:7} ($worktree), fixture $FIXTURE" | tee "$OUT/setup.txt"

for case in "$@"; do
  echo "== $case $(date +%T)"
  (cd "$worktree/plugins/roux" && ROUX_EVAL_APP_FIXTURE="$FIXTURE" claude plugin eval . --scaffold --trust-plugin \
    --ablation "$ablation" --runs "$runs" --model "$model" --concurrency 3 --case "$case" \
    --allow-tools Bash Write Edit --no-publish --max-cost-usd 25 --keep-temp \
    --json "$OUT/$case.json" --output-dir "$OUT/$case-out" >"$OUT/$case.log" 2>&1)
  echo "eval exit $?"
  python3 -c '
import json,sys
r=json.load(open(sys.argv[1]))
for c in r["cases"]:
  for arm,runs in c["arms"].items():
    for i,run in enumerate(runs):
      print(arm, i+1, run["tracePath"].rsplit("/out/",1)[0])
' "$OUT/$case.json" | while read -r arm n kept; do
    tag="$case-$arm-$n"
    chmod 700 "$kept" "$kept/sealed" 2>/dev/null
    chmod -R u+w "$kept/sealed" 2>/dev/null
    cp "$kept/out/trace.jsonl" "$OUT/$tag.trace.jsonl" 2>/dev/null
    work="$(mktemp -d)/work"
    rsync -a --exclude /.git "$kept/sealed/home/cwd/" "$work/"
    cp -R "$FIXTURE/app/.git" "$work/.git"
    (cd "$work" && git add -A -N . && git diff -- . ':!frontend/src/routeTree.gen.ts' ':!frontend/package-lock.json') >"$OUT/$tag.diff" 2>/dev/null
    git -C "$work" reset -q
    accepted=""
    if [ -d "$PLUGIN/evals/$case/acceptance" ]; then
      "$PLUGIN/scripts/eval-acceptance.sh" "$PLUGIN/evals/$case" "$work" >"$OUT/$tag.accept.txt" 2>&1
      accepted="accept $(grep -c '^PASS' "$OUT/$tag.accept.txt")/$(grep -cE '^(PASS|FAIL)' "$OUT/$tag.accept.txt"), "
    fi
    "$PLUGIN/scripts/check-roux-way.sh" "$work" >"$OUT/$tag.check.txt" 2>&1
    echo "  $tag: ${accepted}checks $(grep -c '^PASS' "$OUT/$tag.check.txt")/$(grep -cE '^(PASS|FAIL)' "$OUT/$tag.check.txt") ($(grep '^FAIL' "$OUT/$tag.check.txt" | cut -c6- | tr '\n' ' '))"
    rm -rf "$(dirname "$work")"
    chmod -R u+w "$kept" 2>/dev/null; rm -rf "$kept"
  done
done
echo "done $(date +%T)"
