#!/usr/bin/env bash
# Replace the skill's references/ with copies of docs/guides/*.md (README.md excluded).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
guides="$root/docs/guides"
references="$root/plugins/roux/skills/roux/references"

rm -rf "$references"
mkdir -p "$references"
for guide in "$guides"/*.md; do
  [ -e "$guide" ] || continue
  [ "$(basename "$guide")" = "README.md" ] || cp "$guide" "$references/"
done
echo "synced $(find "$references" -name '*.md' | wc -l | tr -d ' ') guide(s) into ${references#"$root"/}"
