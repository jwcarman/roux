#!/usr/bin/env bash
# Runs one eval case with OpenCode and a local model, with and without roux's skill, one run at a
# time, and scores each run on the Mac exactly as run-evals.sh does: the case's hidden acceptance
# tests (eval-acceptance.sh) and the app's own build (check-roux-way.sh).
#
# The agent works in a container (build-image.sh), which sees only its own copy of the app: never
# this repository, the hidden tests or the Mac's home. LM Studio serves the model on the Mac.
#
# Usage: run-opencode.sh [--runs N] [--arms "with without"] [--limit SECONDS] [--image NAME]
#                        --context TOKENS <model> <Mac fixture dir> <out dir> <case>
#   --context: the context window LM Studio loaded the model with (lms ps), which OpenCode needs
#   to know to compact the conversation before it overflows
#   model: OpenCode's name for it, e.g. lmstudio/qwen/qwen3-coder-30b
# Writes per run, to <out dir>: <tag>.events.jsonl, <tag>.diff, <tag>.accept.txt, <tag>.check.txt,
# <tag>.meta (exit code, seconds), and a summary line per run to stdout.
set -uo pipefail

runs=3 arms="with without" limit=3600 image=roux-eval-opencode context=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runs) runs="$2"; shift 2 ;;
    --arms) arms="$2"; shift 2 ;;
    --limit) limit="$2"; shift 2 ;;
    --image) image="$2"; shift 2 ;;
    --context) context="$2"; shift 2 ;;
    *) break ;;
  esac
done
if [ "$#" -ne 4 ] || [ -z "$context" ]; then
  echo "usage: $(basename "$0") [--runs N] [--arms \"with without\"] [--limit S] [--image NAME] --context TOKENS <model> <fixture> <out> <case>" >&2
  exit 2
fi
model="$1" fixture="$(cd "$2" && pwd -P)" case="$4"
mkdir -p "$3"
out="$(cd "$3" && pwd -P)"
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../.." && pwd)"
casedir="$plugin/evals/$case"

for n in $(seq 1 "$runs"); do
  for arm in $arms; do
    tag="$case-$arm-$n"
    box="$(mktemp -d)"
    docker run --rm --add-host=host.docker.internal:host-gateway \
      -v "$plugin/skills/roux:/skill:ro" -v "$casedir/prompt.md:/prompt.md:ro" -v "$box:/out" \
      -v "$here/in-container.sh:/in-container.sh:ro" \
      "$image" bash /in-container.sh "$arm" "$model" "$limit" "$context" >"$box/docker.log" 2>&1
    cp "$box/events.jsonl" "$out/$tag.events.jsonl" 2>/dev/null
    cp "$box/opencode.log" "$out/$tag.opencode.log" 2>/dev/null
    cp "$box/run.diff" "$out/$tag.diff" 2>/dev/null
    echo "exit $(cat "$box/exit.txt" 2>/dev/null) seconds $(cat "$box/seconds.txt" 2>/dev/null)" >"$out/$tag.meta"

    # The run's work, on a copy of the Mac fixture.
    work="$(mktemp -d)"
    rsync -a "$fixture/" "$work/"
    if [ -s "$out/$tag.diff" ] && ! git -C "$work" apply --whitespace=nowarn "$out/$tag.diff" 2>"$out/$tag.apply.txt"; then
      echo "  $tag: the diff did not apply ($(head -1 "$out/$tag.apply.txt"))"
    fi
    "$plugin/scripts/eval-acceptance.sh" "$casedir" "$work" >"$out/$tag.accept.txt" 2>&1
    "$plugin/scripts/check-roux-way.sh" "$work" >"$out/$tag.check.txt" 2>&1
    echo "  $tag: $(cat "$out/$tag.meta"), accept $(grep -c '^PASS' "$out/$tag.accept.txt")/$(grep -cE '^(PASS|FAIL)' "$out/$tag.accept.txt"), checks $(grep -c '^PASS' "$out/$tag.check.txt")/$(grep -cE '^(PASS|FAIL)' "$out/$tag.check.txt") ($(grep '^FAIL' "$out/$tag.check.txt" | cut -c6- | tr '\n' ' '))"
    rm -rf "$box" "$work"
  done
done
