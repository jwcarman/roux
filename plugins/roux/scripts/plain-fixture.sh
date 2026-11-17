#!/usr/bin/env bash
# The plain-stack arm's eval fixture: noir-app-template at 27095cb, its main before roux. Same stack
# as the dojo (Spring Boot, who, PostgreSQL, React with Chakra UI and TanStack), the same members,
# invitations, Appearance and Settings, and its own copies of the error, client, table and form
# code. noir's generator markers (`noir-gen:`) and .noir/ are removed, then git init and one commit,
# so a run's changes show as a diff. Prints <dir>.
#
# The template is read from https://github.com/jwcarman/noir-app-template, or from $TEMPLATE_REPO
# (any URL or path git can clone) when set.
#
# Usage: plain-fixture.sh <dir>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <dir>" >&2
  exit 2
fi

template_repo="${TEMPLATE_REPO:-https://github.com/jwcarman/noir-app-template}"
template_commit=27095cb

mkdir -p "$1"
dir="$(cd "$1" && pwd -P)"
if [ -n "$(ls -A "$dir")" ]; then
  echo "$dir is not empty" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "reading noir-app-template at $template_commit from $template_repo" >&2
git clone -q --no-checkout "$template_repo" "$work/template"
git -C "$work/template" archive "$template_commit" | tar -x -C "$dir"

rm -rf "$dir/.noir"

# The markers: whole-line comments (// in Java and TypeScript, <!-- --> in the changelog master)
# and inline /* */ ones. A marker between two blank lines takes one of them with it, so the code
# stays as google-java-format writes it; a file no longer ends in a blank line.
grep -rl --exclude=CLAUDE.md 'noir-gen:' "$dir" | while IFS= read -r file; do
  perl -0pi -e '
    s{(\n\n)[ \t]*// noir-gen:[^\n]*\n\n}{$1}g;
    s{^[ \t]*// noir-gen:[^\n]*\n}{}mg;
    s{^[ \t]*<!-- noir-gen:[^\n]*-->[ \t]*\n}{}mg;
    s{ /\* noir-gen: [^*]*\*/}{}g;
    s{\n+\z}{\n};
  ' "$file"
done
# Without its markers a Java line can fit where it did not (AppRoles' OWNER), so the Java is
# formatted as the build's Spotless check expects it.
(cd "$dir" && ./mvnw -B -q spotless:apply) >&2
rm -rf "$dir/target"

# CLAUDE.md's section on noir's generators described those markers; what is left of it is the rule
# about the router's generated file.
before="$(cat "$dir/CLAUDE.md")"
perl -0pi -e 's{## Generators\n.*\z}{## Generated files\n\n- Never hand-edit `frontend/src/routeTree.gen.ts`; TanStack\x27s router plugin writes it.\n}s' "$dir/CLAUDE.md"
if [ "$before" = "$(cat "$dir/CLAUDE.md")" ]; then
  echo "plain-fixture: no Generators section in CLAUDE.md" >&2
  exit 1
fi

if grep -rn 'noir-gen' "$dir" >&2; then
  echo "plain-fixture: a noir-gen marker is left" >&2
  exit 1
fi

git -C "$dir" init -q -b main
git -C "$dir" add -A
git -C "$dir" -c user.name=plain-fixture -c user.email=plain-fixture@example.invalid \
  commit -q -m "noir-app-template at $template_commit, without noir's generator markers"

echo "$dir"
