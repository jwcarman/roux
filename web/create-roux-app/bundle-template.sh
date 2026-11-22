#!/usr/bin/env bash
#
# Puts roux's app template in this package (template/), for a publish: scripts/export-app-template.sh
# at VERSION, then each .gitignore renamed _gitignore, since npm leaves .gitignore files out of a
# package (the starter renames them back).
#
# Usage: web/create-roux-app/bundle-template.sh [--locks] VERSION   (--locks: see the export script)

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$here/template"
"$here/../../scripts/export-app-template.sh" "$@" "$here/template"
find "$here/template" -name .gitignore -execdir mv .gitignore _gitignore \;
