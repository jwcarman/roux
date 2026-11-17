#!/usr/bin/env bash
# The roux arms' eval fixture: a standalone copy of examples/dojo at <commit>, written into <dir>
# (outside the repository), that builds without roux's checkout:
#   - roux's Maven modules at <commit> installed into the fixture's own local repository,
#     <dir>/.m2repo, so the pom's parent (roux-parent) and the starter resolve from there, and a later
#     `./mvnw install` in the checkout cannot change a fixture made earlier. .mvn/jvm.config points
#     every ./mvnw in the fixture (from any directory) at it, with ~/.m2/repository as a read-only
#     tail for third-party artifacts, so the fixture holds only roux's (about 1 MB); an artifact in
#     neither is downloaded into .m2repo;
#   - roux-web at <commit> built and packed into <dir>/vendor/, and the frontend depending on that
#     tgz rather than linking roux's source;
#   - git init and one commit, so a run's changes show as a diff (check-roux-way.sh judges those).
# Prints <dir>.
#
# Usage: eval-fixture.sh <commit> <dir>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $(basename "$0") <commit> <dir>" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
commit="$(git -C "$root" rev-parse --verify "$1^{commit}")"

mkdir -p "$2"
dir="$(cd "$2" && pwd -P)"
case "$dir/" in
  "$root"/*)
    rmdir "$dir" 2>/dev/null || true
    echo "$dir is inside the roux repository; write the fixture outside it" >&2
    exit 2
    ;;
esac
if [ -n "$(ls -A "$dir")" ]; then
  echo "$dir is not empty" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# roux exactly as committed at <commit>, away from the checkout (no local edits, no build output).
mkdir "$work/roux"
git -C "$root" archive "$commit" | tar -x -C "$work/roux"

# Maven reads the tail as a second, read-only local repository (Maven 3.9 or later).
tail_repo="$HOME/.m2/repository"
echo "installing roux's Maven modules at ${commit:0:7} into $dir/.m2repo" >&2
(cd "$work/roux" && ./mvnw -B -q install -DskipTests -P '!examples' \
  "-Dmaven.repo.local=$dir/.m2repo" "-Dmaven.repo.local.tail=$tail_repo") >&2

echo "building and packing roux-web at ${commit:0:7}" >&2
mkdir "$dir/vendor"
(cd "$work/roux/web" && npm ci --no-audit --no-fund && npm run build -w @jwcarman/roux-web) >&2
tgz="$(cd "$work/roux/web/roux-web" && npm pack --silent --pack-destination "$dir/vendor" | tail -n 1)"
[ -f "$dir/vendor/$tgz" ] || { echo "npm pack wrote no $tgz" >&2; exit 1; }

# The dojo and the Maven wrapper beside it.
cp -R "$work/roux/examples/dojo/." "$dir/"
cp -R "$work/roux/mvnw" "$work/roux/mvnw.cmd" "$work/roux/.mvn" "$dir/"
# Maven's launcher puts the fixture's own directory in for ${MAVEN_PROJECTBASEDIR}, so the local
# repository is the copy's own wherever the copy is (place-dojo.sh copies .m2repo with it).
[ ! -e "$dir/.mvn/jvm.config" ] || { echo "eval-fixture: .mvn/jvm.config exists already" >&2; exit 1; }
printf '%s\n' "-Dmaven.repo.local=\${MAVEN_PROJECTBASEDIR}/.m2repo" \
  "-Dmaven.repo.local.tail=$tail_repo" >"$dir/.mvn/jvm.config"
printf '\n# roux, installed for this copy (eval-fixture.sh)\n.m2repo/\n' >>"$dir/.gitignore"

# Rewrites one file with a Perl substitution and fails when the pattern is not there, so a change
# to the dojo that this script no longer matches stops it rather than leaving roux's paths behind.
rewrite() {
  local file="$1" expr="$2"
  local before
  before="$(cat "$dir/$file")"
  perl -0pi -e "$expr" "$dir/$file"
  if [ "$before" = "$(cat "$dir/$file")" ]; then
    echo "eval-fixture: no match in $file for: $expr" >&2
    exit 1
  fi
}

# pom.xml: roux-parent from ~/.m2, and no build of roux-web from roux's npm workspace.
rewrite pom.xml 's{<!-- roux.s reactor builds the dojo.*?-->}{<!-- roux-parent, from the local Maven repository. -->}s'
rewrite pom.xml 's{<relativePath>\.\./\.\./pom\.xml</relativePath>}{<relativePath/>}'
rewrite pom.xml 's{\n\s*<!-- The frontend links roux-web from source.*?<id>roux-web-build</id>.*?</execution>}{}s'

# The frontend: roux-web from the packed tgz. Installed, not linked, so Vite and Vitest need no
# preserveSymlinks or inlining to keep a single React.
node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.dependencies["@jwcarman/roux-web"] = "file:../vendor/" + process.argv[2];
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$dir/frontend/package.json" "$tgz"
rewrite frontend/vite.config.ts 's{\n  // roux-web is linked from roux.s source.*?resolve: \{ preserveSymlinks: true \},}{}s'
rewrite frontend/vite.config.ts 's{\n  // roux-web goes through Vite, not Node.s loader:.*?second React\.}{}s'
rewrite frontend/vite.config.ts 's{\n    server: \{ deps: \{ inline: \["\@jwcarman/roux-web"\] \} \},}{}'
rewrite frontend/src/roux-link.test.tsx 's{roux-web is linked from roux.s source \(file:\), with its own node_modules beside it\.}{roux-web is installed from a packed tgz.}'

# Prose that pointed at roux's checkout.
rewrite CLAUDE.md 's{ It builds in roux.s reactor against the roux code beside it\.}{}'
rewrite README.md 's{built on roux in roux.s own repository, against the roux code beside\nit: it is how roux finds out what is still hard for an app\.}{built on roux.}'
rewrite README.md 's{\nIt builds in roux.s reactor \(\x60\./mvnw verify\x60 from the repository.s root\) and is never published\.\n}{}'
rewrite README.md 's{From the repository.s root, build roux once \(\x60\./mvnw install -DskipTests\x60\), then:\n\n\x60\x60\x60bash\ncd examples/dojo\n\.\./\.\./mvnw }{\x60\x60\x60bash\n./mvnw }'
rewrite README.md 's{From the repository.s root:\n\n\x60\x60\x60bash\n\./mvnw verify[^\n]*\n\./mvnw verify -pl examples/dojo -am[^\n]*\n}{\x60\x60\x60bash\n./mvnw verify\n}'
# roux's guides, linked as they are at <commit>.
rewrite README.md "s{\\]\\(\\.\\./\\.\\./docs/guides/}{](https://github.com/jwcarman/roux/blob/$commit/docs/guides/}g"

if grep -n '\.\./\.\./\|reactor\|roux code beside\|examples/dojo -am' "$dir/pom.xml" "$dir/frontend/package.json" \
  "$dir/frontend/vite.config.ts" "$dir/README.md" "$dir/CLAUDE.md" >&2; then
  echo "eval-fixture: a path into roux's checkout is left" >&2
  exit 1
fi

# The lock, for the tgz in place of the link.
echo "regenerating the frontend's lock" >&2
(cd "$dir/frontend" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund) >&2

git -C "$dir" init -q -b main
git -C "$dir" add -A
git -C "$dir" -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid \
  commit -q -m "The dojo at roux ${commit:0:7}"

echo "$dir"
