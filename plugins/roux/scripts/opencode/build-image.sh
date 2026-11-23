#!/usr/bin/env bash
# Builds the image roux's OpenCode evals run in: OpenCode, and a Linux copy of an eval fixture
# (eval-fixture.sh) at /fixture with its git history, the run's base.
#
# Usage: build-image.sh <fixture dir> [image name]     (default image: roux-eval-opencode)
set -euo pipefail

if [ "$#" -lt 1 ] || [ ! -d "$1/.git" ]; then
  echo "usage: $(basename "$0") <fixture dir> [image name]" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
fixture="$(cd "$1" && pwd -P)"
image="${2:-roux-eval-opencode}"

context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT
rsync -a --exclude-from="$here/.dockerignore-fixture" "$fixture/" "$context/"
cp "$here/Dockerfile" "$context/Dockerfile"
docker build -t "$image" "$context"
