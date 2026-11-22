#!/usr/bin/env bash
#
# Writes templates/app as an app of its own, for the jwcarman/roux-app-template repository: roux at
# VERSION from Maven Central and npm, no link to roux's repository, and a Maven wrapper.
#
# Usage: scripts/export-app-template.sh [--from DIR] [--locks] VERSION OUT
#
#   VERSION   the roux release (or, in CI, roux's SNAPSHOT version: then the template's
#             roux.version must already be VERSION)
#   OUT       the directory to write; it must not exist or be empty
#   --from    the template to export (default templates/app); only its git-tracked files are copied
#   --locks   regenerate the frontend and e2e package locks (npm, which must find roux-web VERSION
#             on the registry: a release). Without it the frontend lock, which links roux's own
#             roux-web, is left out.
#
# It fails when the copy still names web/roux-web, roux-parent or roux-repository, or ships
# node_modules, target, dist or test-results.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FROM="$ROOT/templates/app"
LOCKS=false
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="$(cd "$2" && pwd)"; shift 2 ;;
    --locks) LOCKS=true; shift ;;
    *) break ;;
  esac
done
[ $# -eq 2 ] || { echo "usage: $0 [--from DIR] [--locks] VERSION OUT" >&2; exit 2; }
VERSION="$1"
OUT="$2"

if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ]; then
  echo "error: $OUT is not empty" >&2
  exit 1
fi

current="$(sed -n 's:.*<roux.version>\(.*\)</roux.version>.*:\1:p' "$FROM/pom.xml")"
if [[ "$VERSION" == *-SNAPSHOT ]] && [ "$current" != "$VERSION" ]; then
  echo "error: the template's roux.version is $current, but roux is $VERSION: set it in $FROM/pom.xml" >&2
  exit 1
fi

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
git -C "$FROM" ls-files -z | (cd "$FROM" && xargs -0 tar cf -) | tar xf - -C "$OUT"
cp "$ROOT/mvnw" "$ROOT/mvnw.cmd" "$OUT/"
mkdir -p "$OUT/.mvn/wrapper"
cp "$ROOT/.mvn/wrapper/maven-wrapper.properties" "$OUT/.mvn/wrapper/"
chmod +x "$OUT/mvnw"

python3 - "$OUT" "$VERSION" <<'EOF'
import json, re, sys
out, version = sys.argv[1], sys.argv[2]

pom_path = f"{out}/pom.xml"
pom = open(pom_path).read()
pom = re.sub(r"<roux.version>.*?</roux.version>", f"<roux.version>{version}</roux.version>", pom, count=1)
# The roux-repository profile, with the comment above it.
pom, removed = re.subn(r"\n[ \t]*<!--[^>]*?roux's repository.*?-->\s*<profile>\s*<id>roux-repository</id>.*?</profile>", "", pom, count=1, flags=re.S)
if removed != 1:
    sys.exit("error: the roux-repository profile was not found in pom.xml")
open(pom_path, "w").write(pom)

package_path = f"{out}/frontend/package.json"
package = json.load(open(package_path))
package["dependencies"]["@jwcarman/roux-web"] = version
with open(package_path, "w") as f:
    json.dump(package, f, indent=2)
    f.write("\n")
EOF

if $LOCKS; then
  (cd "$OUT/frontend" && rm -f package-lock.json && npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)
  (cd "$OUT/e2e" && rm -f package-lock.json && npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)
else
  rm "$OUT/frontend/package-lock.json"
fi

status=0
for name in web/roux-web roux-parent roux-repository; do
  if grep -rIl --exclude-dir=.git -F "$name" "$OUT" >/dev/null; then
    echo "error: the copy still names $name:" >&2
    grep -rIn --exclude-dir=.git -F "$name" "$OUT" | sed "s:^$OUT/:  :" >&2
    status=1
  fi
done
for dir in node_modules target dist test-results; do
  found="$(find "$OUT" -name "$dir" -not -path "$OUT/.git/*" | sed "s:^$OUT/:  :")"
  if [ -n "$found" ]; then
    echo "error: the copy ships $dir:" >&2
    echo "$found" >&2
    status=1
  fi
done
[ $status -eq 0 ] && echo "exported roux $VERSION's app template to $OUT"
exit $status
