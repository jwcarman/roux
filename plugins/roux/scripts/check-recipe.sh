#!/usr/bin/env bash
# Proves the skill's recipe (plugins/roux/skills/roux/references/feature.md): builds its `ranks`
# feature into a fresh copy of templates/app and runs that app's whole build, Java tests and both
# 100% coverage gates included (Docker; -DskipITs leaves out Playwright).
#
# The recipe marks each code block it means literally:
#   <!-- file: <path> -->    the block is that whole file, relative to the app's root;
#   <!-- files: <dir>/ -->   a Java block of several top-level types: its package and imports, then
#                            one file per type, named for it;
#   <!-- fragment: <name> --> a piece of an existing file, put in place here by name.
# The copy lives at target/recipe-app (two levels down, like templates/app) so the template's
# relative links to roux-web and the root pom still resolve.
#
# Usage: check-recipe.sh     (from anywhere; needs Java 25, Node, Docker; installs roux's modules
#                             and builds roux-web first, so it tests this checkout's roux)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
recipe="$root/plugins/roux/skills/roux/references/feature.md"
app="$root/target/recipe-app"

cd "$root"
echo "check-recipe: installing roux's modules and building roux-web" >&2
./mvnw -B -q install -DskipTests -Dskip.npm -pl runtime/roux-bom,runtime/roux-spring-boot-starter,runtime/roux-theme,runtime/roux-test -am
(cd web && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run -s build -w @jwcarman/roux-web >/dev/null)

rm -rf "$app"
mkdir -p "$app"
(cd templates/app && tar --exclude=./target --exclude=./frontend/node_modules --exclude=./frontend/dist -cf - .) | (cd "$app" && tar -xf -)

# Write the files and fragments out of the recipe.
python3 - "$recipe" "$app" <<'PY'
import re, sys
from pathlib import Path

recipe, app = Path(sys.argv[1]).read_text(), Path(sys.argv[2])
blocks = re.findall(r"<!-- (file|files|fragment): (\S+) -->\n( *)```\w*\n(.*?)\n\3```", recipe, re.S)
if not blocks:
    sys.exit("check-recipe: no marked blocks in the recipe")

def dedent(indent, body):
    return "\n".join(line[len(indent):] if line.startswith(indent) else line for line in body.split("\n")) + "\n"

def insert_before(path, anchor, text, last=True):
    source = path.read_text()
    at = source.rindex(anchor) if last else source.index(anchor)
    path.write_text(source[:at] + text + source[at:])

def insert_after(path, anchor, text):
    source = path.read_text()
    at = source.index(anchor) + len(anchor)
    path.write_text(source[:at] + text + source[at:])

changelogs = app / "src/main/resources/db/changelog"
for kind, target, indent, body in blocks:
    body = dedent(indent, body)
    if kind == "file":
        path = app / target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
    elif kind == "files":
        head, *types = re.split(r"(?m)^(?=public (?:interface|record|class|enum) )", body)
        for code in types:
            name = re.match(r"public \w+ (\w+)", code).group(1)
            path = app / target / f"{name}.java"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(head + code.rstrip() + "\n")
    elif target == "changelog":
        roles = (changelogs / "roles.xml").read_text()
        header = roles[: roles.index(">", roles.index("<databaseChangeLog")) + 1]
        (changelogs / "ranks.xml").write_text(header + "\n" + body + "</databaseChangeLog>\n")
        insert_before(changelogs / "db.changelog-master.xml", "</databaseChangeLog>",
                      '  <include file="classpath:db/changelog/ranks.xml"/>\n')
    elif target == "roles":
        changeset = "\n".join(line for line in body.split("\n")
                              if "</databaseChangeLog>" not in line and not line.strip().startswith("<!--"))
        insert_before(changelogs / "roles.xml", "</databaseChangeLog>", changeset.strip("\n") + "\n")
    elif target == "query-keys":
        insert_after(app / "frontend/src/queryKeys.ts", "export const queryKeys = {\n", body)
    elif target == "nav":
        imports, entry = [part for part in body.split("\n\n") if part.strip()]
        nav = app / "frontend/src/shell/nav.ts"
        nav.write_text(imports.split("//")[0].rstrip() + "\n" + nav.read_text())
        insert_before(nav, "]);", "  " + entry.strip() + "\n")
    else:
        sys.exit(f"check-recipe: unknown fragment {target}")

# The one edit the recipe gives in words: a new app's first Permissions class is listed for roux.
classes = app / "src/test/java/app/identity/PermissionClasses.java"
insert_after(classes, "static final Class<?>[] ALL = {\n", "    Permissions.class,\n")
print(f"check-recipe: wrote {len(blocks)} blocks", file=sys.stderr)
PY

cd "$app"
mvnw() { "$root/mvnw" -f "$app/pom.xml" "$@"; }
echo "check-recipe: building the app with the recipe's feature" >&2
mvnw -B -q spotless:apply
mvnw -B -q test -Dskip.npm -Dtest=PermissionsListTest -Dsurefire.failIfNoSpecifiedTests=false \
  || mvnw -B -q test -Dskip.npm -Dtest=PermissionsListTest -Dsurefire.failIfNoSpecifiedTests=false
mvnw -B verify -DskipITs
echo "check-recipe: ok, the recipe's feature builds and passes both coverage gates" >&2
