#!/usr/bin/env bash
# One eval run inside the roux-eval-opencode image: OpenCode on a fresh copy of /fixture, with or
# without roux's skill, then the run's diff. Writes to /out:
#   events.jsonl  OpenCode's events (--format json)
#   run.diff      what the run changed against the fixture (the skill's own files left out)
#   exit.txt      OpenCode's exit code (124: the time limit)
#   seconds.txt   how long OpenCode ran
# /skill (read-only) holds roux's skill; /prompt.md the case's prompt (its frontmatter is dropped).
#
# Usage (as the image's command):
#   in-container.sh <with|without> <model> <time limit in seconds> <context window in tokens>
# The context window must match the one LM Studio loaded the model with: OpenCode compacts the
# conversation as it nears it, and without it never compacts.
set -uo pipefail
arm="$1" model="$2" limit="$3" context="$4"

cp -a /fixture /work
cd /work
if [ "$arm" = "with" ]; then
  mkdir -p .claude/skills
  cp -R /skill .claude/skills/roux
fi

mkdir -p ~/.config/opencode
cat >~/.config/opencode/opencode.json <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "$model",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio",
      "options": { "baseURL": "http://host.docker.internal:1234/v1" },
      "models": { "${model#lmstudio/}": { "limit": { "context": $context, "output": 16384 } } }
    }
  }
}
JSON

prompt="$(awk 'BEGIN{f=0} /^---$/{f++; next} f>=2' /prompt.md)"
start=$(date +%s)
timeout "$limit" opencode run --standalone --auto --format json --model "$model" "$prompt" \
  >/out/events.jsonl 2>/out/opencode.log
echo $? >/out/exit.txt
echo $(($(date +%s) - start)) >/out/seconds.txt

git add -A -N . 2>/dev/null
git diff HEAD -- . ':!.claude' ':!frontend/src/routeTree.gen.ts' ':!frontend/package-lock.json' >/out/run.diff
