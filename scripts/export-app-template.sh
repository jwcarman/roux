#!/usr/bin/env bash
#
# Writes template/ as an app of its own, the template create-roux-app ships
# (web/create-roux-app/bundle-template.sh): roux at VERSION from the Go module proxy and npm, and no
# link to roux's repository.
#
# Usage: scripts/export-app-template.sh [--from DIR] [--locks] VERSION OUT
#
#   VERSION   the roux release, as npm writes it (0.4.0; the Go module's tag is v0.4.0)
#   OUT       the directory to write; it must not exist or be empty
#   --from    the template to export (default template/); only its git-tracked files are copied
#   --locks   resolve the locks against the published release: go.sum through `go mod tidy` (the Go
#             module proxy must serve v<VERSION>) and the frontend lock's roux-web from npm (npm must
#             serve it); every other locked version stays the one roux's build tested. Without it
#             the frontend lock, which links roux's own roux-web, is left out, and go.sum lacks roux.
#
# It fails when the copy still points into roux's repository (a replace of the Go module, a link to
# web/roux-web), or ships node_modules, dist, test-results or coverage.out.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FROM="$ROOT/template"
LOCKS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM="$(cd "$2" && pwd)"; shift 2 ;;
    --locks) LOCKS=true; shift ;;
    *) break ;;
  esac
done
[[ $# -eq 2 ]] || { echo "usage: $0 [--from DIR] [--locks] VERSION OUT" >&2; exit 2; }
VERSION="$1"
OUT="$2"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "error: VERSION is a version as npm writes it, 0.4.0 or 0.4.0-rc.1, not '$VERSION' (the v of the Go tag is added here)" >&2
  exit 2
fi
if [[ -e "$OUT" ]] && [[ -n "$(ls -A "$OUT")" ]]; then
  echo "error: $OUT is not empty" >&2
  exit 1
fi

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
git -C "$FROM" ls-files -z | (cd "$FROM" && xargs -0 tar cf -) | tar xf - -C "$OUT"

python3 - "$OUT" "$VERSION" <<'EOF'
import json, re, sys
out, version = sys.argv[1], sys.argv[2]
tag = "v" + version

mod_path = f"{out}/go.mod"
mod = open(mod_path).read()
# The replace that builds the template against roux's runtime beside it, with its comment.
mod, removed = re.subn(r"\n(?://[^\n]*\n)*replace github\.com/jwcarman/roux => \.\./?\n", "", mod, count=1)
if removed != 1:
    sys.exit("error: go.mod has no 'replace github.com/jwcarman/roux => ../' to remove")
mod, pinned = re.subn(r"(\n\tgithub\.com/jwcarman/roux) v\S+", rf"\1 {tag}", mod, count=1)
if pinned != 1:
    sys.exit("error: go.mod does not require github.com/jwcarman/roux")
open(mod_path, "w").write(mod)

sum_path = f"{out}/go.sum"
lines = open(sum_path).read().splitlines(keepends=True)
open(sum_path, "w").writelines(l for l in lines if not l.startswith("github.com/jwcarman/roux "))

# roux's Claude Code plugin at this release.
settings_path = f"{out}/.claude/settings.json"
settings = json.load(open(settings_path))
settings["extraKnownMarketplaces"]["roux"]["source"]["ref"] = tag
with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")

package_path = f"{out}/frontend/package.json"
package = json.load(open(package_path))
package["dependencies"]["@jwcarman/roux-web"] = version
with open(package_path, "w") as f:
    json.dump(package, f, indent=2)
    f.write("\n")
EOF

if $LOCKS; then
  # GOFLAGS=-mod=mod: tidy may write go.sum. GONOSUMDB is left alone: the checksum database vouches
  # for the release like any other module.
  (cd "$OUT" && GOFLAGS=-mod=mod go mod tidy)
  # --prefer-online: a roux-web published minutes ago is not in a cached copy of the registry's list.
  (cd "$OUT/frontend" && npm install --package-lock-only --prefer-online --ignore-scripts --no-audit --no-fund >/dev/null)
else
  rm "$OUT/frontend/package-lock.json"
fi

status=0
for name in web/roux-web "jwcarman/roux => "; do
  if grep -rIl --exclude-dir=.git -F "$name" "$OUT" >/dev/null; then
    echo "error: the copy still names $name:" >&2
    grep -rIn --exclude-dir=.git -F "$name" "$OUT" | sed "s:^$OUT/:  :" >&2
    status=1
  fi
done
for path in node_modules dist test-results coverage.out; do
  found="$(find "$OUT" -name "$path" -not -path "$OUT/.git/*" | sed "s:^$OUT/:  :")"
  if [[ -n "$found" ]]; then
    echo "error: the copy ships $path:" >&2
    echo "$found" >&2
    status=1
  fi
done
[[ $status -eq 0 ]] && echo "exported roux $VERSION's app template to $OUT"
exit $status
