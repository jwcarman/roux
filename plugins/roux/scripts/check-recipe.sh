#!/usr/bin/env bash
# Proves the skill's recipe (plugins/roux/skills/roux/references/feature.md): builds its `ranks`
# feature into a fresh copy of template/ and runs that app's checks: gofmt, go vet, golangci-lint,
# the Go tests (with the permissions tests) and the front end's tests with their 100% coverage gate
# and its build.
#
# The recipe marks each code block it means literally:
#   <!-- file: <path> -->     the block is that whole file, relative to the app's root;
#   <!-- fragment: <name> --> a piece of an existing file, put in place here by name.
# The copy lives at recipe-app/ (one level down, like template/) so the template's relative links
# to roux (go.mod's replace) and to roux-web (frontend/package.json) still resolve.
#
# Usage: check-recipe.sh   (from anywhere; needs Go, Node, and PostgreSQL through
#                           TEST_DATABASE_URL or Docker; builds roux-web first, so it tests this
#                           checkout's roux)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
recipe="$root/plugins/roux/skills/roux/references/feature.md"
app="$root/recipe-app"

cd "$root"
echo "check-recipe: building roux-web" >&2
(cd web && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run -s build -w @jwcarman/roux-web >/dev/null)

rm -rf "$app"
mkdir -p "$app"
(cd template && tar --exclude=./bin --exclude=./frontend/node_modules --exclude=./frontend/dist \
  --exclude=./frontend/coverage --exclude=./coverage.out -cf - .) | (cd "$app" && tar -xf -)

# Write the files and fragments out of the recipe.
python3 - "$recipe" "$app" <<'PY'
import re, sys
from pathlib import Path

recipe, app = Path(sys.argv[1]).read_text(), Path(sys.argv[2])
blocks = re.findall(r"<!-- (file|fragment): (\S+) -->\n( *)```\w*\n(.*?)\n\3```", recipe, re.S)
if not blocks:
    sys.exit("check-recipe: no marked blocks in the recipe")

def dedent(indent, body):
    return "\n".join(line[len(indent):] if line.startswith(indent) else line for line in body.split("\n")) + "\n"

def replace_once(path, old, new):
    source = path.read_text()
    if source.count(old) != 1:
        sys.exit(f"check-recipe: {path.name} does not hold exactly one {old!r}")
    path.write_text(source.replace(old, new))

def insert_before(path, anchor, text):
    source = path.read_text()
    at = source.rindex(anchor)
    path.write_text(source[:at] + text + source[at:])

def insert_after(path, anchor, text):
    source = path.read_text()
    at = source.index(anchor) + len(anchor)
    path.write_text(source[:at] + text + source[at:])

modules = app / "cmd/server/modules.go"
for kind, target, indent, body in blocks:
    body = dedent(indent, body)
    if kind == "file":
        path = app / target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
    elif target == "modules-import":
        insert_after(modules, "import (\n", "\t" + body.strip() + "\n")
    elif target == "modules-append":
        replace_once(modules, "mods = append(mods, email, members)", body.strip())
    elif target == "permissions":
        replace_once(modules, "return app.RouxPermissions()", body.strip())
    elif target == "query-keys":
        replace_once(app / "frontend/src/queryKeys.ts", "export const queryKeys = {};",
                     "export const queryKeys = {\n" + body + "};")
    elif target == "nav":
        imports, entry = [part for part in body.split("\n\n") if part.strip()]
        nav = app / "frontend/src/shell/nav.ts"
        nav.write_text(imports.split("//")[0].rstrip() + "\n" + nav.read_text())
        insert_before(nav, "]);", "  " + entry.strip() + "\n")
    else:
        sys.exit(f"check-recipe: unknown fragment {target}")
print(f"check-recipe: wrote {len(blocks)} blocks", file=sys.stderr)
PY

cd "$app"
echo "check-recipe: checking the app with the recipe's feature" >&2
gofmt -w $(go list -f '{{.Dir}}' ./...)
# The first run rewrites permissions.gen.ts and fails; the second must pass.
go test ./cmd/server -run TestTheFrontEndListsEveryPermission >/dev/null 2>&1 \
  || go test ./cmd/server -run TestTheFrontEndListsEveryPermission
make fmt vet
if command -v "${GOLANGCI_LINT:-golangci-lint}" >/dev/null 2>&1; then
  make lint
else
  echo "check-recipe: SKIPPED golangci-lint (not installed; CI lints recipe-app after this script)" >&2
fi
make test
(cd frontend && npm ci --ignore-scripts --no-audit --no-fund >/dev/null \
  && npm run coverage && npm run build)
echo "check-recipe: ok, the recipe's feature builds and passes its checks" >&2
