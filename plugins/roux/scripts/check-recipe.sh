#!/usr/bin/env bash
# Proves the skill's recipe (plugins/roux/skills/roux/references/feature.md, then the list tests of
# references/lists.md added to the same feature): builds its `labels` feature (a migration, a domain
# service, cqrs queries and commands, a surface and its binding) into a fresh copy of template/ and
# runs that app's checks: gofmt, the permissions and contract tests, go vet, golangci-lint, the Go
# tests, and the front end's format check, surface types check, tests with their 100% coverage gate,
# build and lint.
#
# The recipe marks each code block it means literally:
#   <!-- file: <path> -->     the block is that whole file, relative to the app's root;
#   <!-- fragment: <name> --> a piece of an existing file, put in place here by name;
#   <!-- run: <dir> -->       commands the recipe has the agent run in <dir> (relative to the app's
#                             root); run here in the recipe's order, once the contract is generated.
# The copy lives at recipe-app/ (one level down, like template/) so the template's relative links
# to roux (go.mod's replace) and to roux-web (frontend/package.json) still resolve.
#
# Usage: check-recipe.sh   (from anywhere; needs Go, Node, npm's registry or its cache, and
#                           PostgreSQL through TEST_DATABASE_URL or Docker, whose test containers
#                           take free ports; builds roux-web first, so it tests this checkout's roux)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
recipes=("$root/plugins/roux/skills/roux/references/feature.md" "$root/plugins/roux/skills/roux/references/lists.md")
app="$root/recipe-app"

cd "$root"
echo "check-recipe: building roux-web" >&2
(cd web && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run -s build -w @jwcarman/roux-web >/dev/null)

rm -rf "$app"
mkdir -p "$app"
(cd template && tar --exclude=./bin --exclude=./frontend/node_modules --exclude=./frontend/dist \
  --exclude=./frontend/coverage --exclude=./coverage.out -cf - .) | (cd "$app" && tar -xf -)

# Reads the recipe's marked blocks. `write` writes the files and fragments into the app; `run` runs
# its commands, in order, each in its directory.
read -r -d '' recipe <<'PY' || true
import re, subprocess, sys
from pathlib import Path

mode, app = sys.argv[1], Path(sys.argv[2])
recipe = "\n".join(Path(name).read_text() for name in sys.argv[3:])  # in order: lists.md builds on feature.md
blocks = re.findall(r"<!-- (file|fragment|run): (\S+) -->\n( *)```\w*\n(.*?)\n\3```", recipe, re.S)
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

if mode == "run":
    for kind, target, indent, body in blocks:
        if kind == "run":
            print(f"check-recipe: running the recipe's commands in {target}", file=sys.stderr)
            subprocess.run(["bash", "-euo", "pipefail", "-c", dedent(indent, body)], cwd=app / target, check=True)
    sys.exit(0)

modules = app / "cmd/server/modules.go"
written = 0
for kind, target, indent, body in blocks:
    body = dedent(indent, body)
    if kind == "run":
        continue
    written += 1
    if kind == "file":
        path = app / target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
    elif target == "modules-import":
        # Each line beside the file's other imports; gofmt sorts them.
        insert_after(modules, "import (\n", "".join("\t" + line.strip() + "\n" for line in body.strip().split("\n")))
    elif target == "modules-append":
        replace_once(modules, "mods = append(mods, email, members, cqrs.Module{})", body.strip())
    elif target == "permissions":
        replace_once(modules, "return slices.Concat(app.RouxPermissions())", body.strip())
    elif target == "endpoints":
        replace_once(modules, "return slices.Concat[[]cqrs.Endpoint]()", body.strip())
    elif target == "nav":
        imports, entry = [part for part in body.split("\n\n") if part.strip()]
        nav = app / "frontend/src/shell/nav.ts"
        # The icon joins nav.ts's one react-icons/lu import (one import per module).
        nav.write_text(re.sub(r'^import \{[^}]*\} from "react-icons/lu";$', imports.split("//")[0].rstrip(),
                              nav.read_text(), count=1, flags=re.M))
        insert_before(nav, "]);", "".join("  " + line + "\n" for line in entry.strip().split("\n")))
    else:
        sys.exit(f"check-recipe: unknown fragment {target}")
print(f"check-recipe: wrote {written} blocks", file=sys.stderr)
PY

python3 -c "$recipe" write "$app" "${recipes[@]}"

cd "$app"
echo "check-recipe: checking the app with the recipes' feature" >&2
gofmt -w $(go list -f '{{.Dir}}' ./...)
# The first run of each rewrites its generated file (permissions.gen.ts, contract.gen.ts) and fails;
# the second must pass.
for generated in TestTheFrontEndListsEveryPermission TestTheFrontEndContractIsCurrent; do
  go test ./cmd/server -run "$generated" >/dev/null 2>&1 || go test ./cmd/server -run "$generated"
done
# The front end is installed as create-roux-app leaves it, before the recipe's commands use its bins.
(cd frontend && npm ci --ignore-scripts --no-audit --no-fund >/dev/null \
  && npm ci --ignore-scripts --no-audit --no-fund --prefix lint-tools >/dev/null)
python3 -c "$recipe" run "$app" "${recipes[@]}"
make fmt vet lint
make test
(cd frontend && npm run format:check && npm run surfaces:check \
  && npm run coverage && npm run build && npm run lint)
echo "check-recipe: ok, the recipes' feature builds and passes its checks" >&2
