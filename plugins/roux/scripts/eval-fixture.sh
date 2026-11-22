#!/usr/bin/env bash
# The roux arms' eval fixture: a standalone copy of examples/dojo at <commit> (a grown app, a dozen
# features to copy from), or with --app a new app exported from templates/app at <commit> (only Users
# to copy from), written into <dir> (outside the repository), that builds without roux's checkout:
#   - roux's Maven modules at <commit> installed into the fixture's own local repository,
#     <dir>/.m2repo, so the pom's parent (roux-parent) and the starter resolve from there, and a later
#     `./mvnw install` in the checkout cannot change a fixture made earlier. .mvn/jvm.config points
#     every ./mvnw in the fixture (from any directory) at it. It also holds every third-party
#     artifact a build needs, since an eval's sandbox has no network and no ~/.m2;
#   - its own Maven (.mvn/maven, run by ./mvnw) and npm cache (frontend/.npm-cache), filled by one
#     full build without the end-to-end suite (needs Docker), so the sandbox can compile and test;
#   - roux-web at <commit> built and packed into <dir>/vendor/, and the frontend depending on that
#     tgz rather than linking roux's source;
#   - git init and one commit, so a run's changes show as a diff (check-roux-way.sh judges those).
# Prints <dir>.
#
# Usage: eval-fixture.sh [--app] <commit> <dir>
set -euo pipefail

app=false
if [ "${1:-}" = "--app" ]; then
  app=true
  shift
fi
if [ "$#" -ne 2 ]; then
  echo "usage: $(basename "$0") [--app] <commit> <dir>" >&2
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

# An eval's sandbox has no network and no ~/.m2, so the fixture carries everything a build needs:
# its own local repository, its own Maven and an npm cache. Its own Maven is downloaded under a
# private MAVEN_USER_HOME, so the wrapper's copy in ~/.m2 is never touched.
echo "installing roux's Maven modules at ${commit:0:7} into $dir/.m2repo" >&2
(cd "$work/roux" && MAVEN_USER_HOME="$work/mvnhome" ./mvnw -B -q install -DskipTests -P '!examples' \
  "-Dmaven.repo.local=$dir/.m2repo") >&2

echo "building and packing roux-web at ${commit:0:7}" >&2
mkdir "$dir/vendor"
(cd "$work/roux/web" && npm ci --no-audit --no-fund && npm run build -w @jwcarman/roux-web) >&2
tgz="$(cd "$work/roux/web/roux-web" && npm pack --silent --pack-destination "$dir/vendor" | tail -n 1)"
[ -f "$dir/vendor/$tgz" ] || { echo "npm pack wrote no $tgz" >&2; exit 1; }

if $app; then
  # A new app, as the starter writes it: the export of templates/app at roux's own version.
  version="$(sed -n 's:^    <version>\(.*\)</version>$:\1:p' "$work/roux/pom.xml" | head -n 1)"
  git -C "$work/roux/templates/app" init -q
  git -C "$work/roux/templates/app" add -A
  git -C "$work/roux/templates/app" -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid commit -q -m template
  "$work/roux/scripts/export-app-template.sh" --from "$work/roux/templates/app" "$version" "$work/app" >&2
  cp -R "$work/app/." "$dir/"
  # Both arms share the fixture: no project setting may bring roux's plugin into the arm without it.
  rm -rf "$dir/.claude"
else
  # The dojo and the Maven wrapper beside it.
  cp -R "$work/roux/examples/dojo/." "$dir/"
  cp -R "$work/roux/mvnw" "$work/roux/mvnw.cmd" "$work/roux/.mvn" "$dir/"
  # FINDINGS.md is roux's log of its own gaps, not part of the app; it would tell a run it is graded.
  rm -f "$dir/FINDINGS.md"
fi
# Maven's launcher puts the fixture's own directory in for ${MAVEN_PROJECTBASEDIR}, so the local
# repository is the copy's own wherever the copy is (place-dojo.sh copies .m2repo with it).
[ ! -e "$dir/.mvn/jvm.config" ] || { echo "eval-fixture: .mvn/jvm.config exists already" >&2; exit 1; }
printf '%s\n' "-Dmaven.repo.local=\${MAVEN_PROJECTBASEDIR}/.m2repo" >"$dir/.mvn/jvm.config"
# The wrapper would download Maven into ~/.m2/wrapper, which the sandbox cannot reach; mvnw runs the
# copy's own instead.
maven_home="$(dirname "$(dirname "$(find "$work/mvnhome/wrapper/dists" -type f -path '*/bin/mvn' | head -n 1)")")"
[ -x "$maven_home/bin/mvn" ] || { echo "eval-fixture: no Maven under $work/mvnhome" >&2; exit 1; }
cp -R "$maven_home" "$dir/.mvn/maven"
rm -f "$dir/mvnw.cmd"
# The JDK too: an eval's sandbox cannot read one installed under the home directory, and macOS's
# /usr/bin/java is only a stub. JAVA_HOME names the one to copy (the build below runs on it).
[ -x "${JAVA_HOME:-}/bin/java" ] || { echo "eval-fixture: set JAVA_HOME to a JDK 25" >&2; exit 1; }
cp -R "$JAVA_HOME" "$dir/.mvn/jdk"
cat >"$dir/mvnw" <<'MVNW'
#!/bin/sh
# Maven and a JDK, bundled with this copy of the app so it builds without a download.
base="$(cd "$(dirname "$0")" && pwd)"
JAVA_HOME="$base/.mvn/jdk"
PATH="$JAVA_HOME/bin:$PATH"
export JAVA_HOME PATH
# Java's home inside the copy: Spotless reads ~/.gitconfig through JGit, which the sandbox forbids,
# and every such read prints an [ERROR] that reads like a failed build.
mkdir -p "$base/.mvn/home"
MAVEN_OPTS="-Duser.home=$base/.mvn/home ${MAVEN_OPTS:-}"
export MAVEN_OPTS
exec "$base/.mvn/maven/bin/mvn" "$@"
MVNW
chmod +x "$dir/mvnw"
# npm reads a relative cache against the folder holding .npmrc, so the cache travels with the copy.
printf '%s\n' 'cache=.npm-cache' 'prefer-offline=true' 'audit=false' 'fund=false' >"$dir/frontend/.npmrc"
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

if $app; then
  # The export's roux-web is the SNAPSHOT version on npm, which does not exist: use the tgz.
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.dependencies["@jwcarman/roux-web"] = "file:../vendor/" + process.argv[2];
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$dir/frontend/package.json" "$tgz"
  # The arm without the plugin must not be told to stop and ask for it.
  rewrite CLAUDE.md 's{\*\*Use the \x60roux\x60 skill \(roux.s Claude Code plugin\) and read its guide for the task before\nwriting code\*\*}{**When the \x60roux\x60 skill (roux\x27s Claude Code plugin) is available, read its guide for the task\nbefore writing code**}'
  rewrite CLAUDE.md 's{ \x60\.claude/settings\.json\x60 names roux.s plugin at this app.s roux version; if the skill is\nmissing, ask the person to run \x60/plugin install roux\@roux\x60\.}{}'
else
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
fi

if grep -n '\.\./\.\./\|reactor\|roux code beside\|examples/dojo -am' "$dir/pom.xml" "$dir/frontend/package.json" \
  "$dir/frontend/vite.config.ts" "$dir/README.md" "$dir/CLAUDE.md" >&2; then
  echo "eval-fixture: a path into roux's checkout is left" >&2
  exit 1
fi

# The lock, for the tgz in place of the link.
echo "regenerating the frontend's lock" >&2
(cd "$dir/frontend" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund) >&2

# One full build fills the local repository (every plugin, test provider and Node) and the npm cache.
# Tests need Docker; the end-to-end suite is left out.
echo "building the fixture once, to fill its repository and caches" >&2
(cd "$dir" && ./mvnw -B -q verify -DskipITs) >&2
# From here npm never asks the registry (the sandbox has none): the cache the build above filled
# holds everything.
rewrite frontend/.npmrc 's{^prefer-offline=true$}{offline=true}m'
# And the build installs with `npm install`, not `npm ci`. The sandbox refuses any write under an
# .idea directory, and a package (tunnel, through Stryker) ships one: `npm ci` deletes node_modules
# first, fails on that file and leaves node_modules half gone, with no vitest or tsc. `npm install`
# finds node_modules already matching the lock file and touches nothing. A fixture-only change: the
# template keeps `npm ci`, and the run's diff starts after it.
rewrite pom.xml 's{<arguments>ci</arguments>}{<arguments>install --offline</arguments>}g'
printf '%s\n' '.m2repo/' '.mvn/maven/' '.mvn/jdk/' '.mvn/home/' 'frontend/.npm-cache/' >>"$dir/.gitignore"

git -C "$dir" init -q -b main
git -C "$dir" add -A
git -C "$dir" -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid \
  commit -q -m "$($app && echo "A new app" || echo "The dojo") at roux ${commit:0:7}"

# Prove it works in the eval's sandbox before any run is spent on it.
"$(dirname "$0")/eval-preflight.sh" "$dir"

echo "$dir"
