#!/usr/bin/env bash
# Runs an eval case's hidden acceptance tests against a run's work, and prints one
# `PASS accept:<test>` or `FAIL accept:<test>` line per test (the reason indented under a failure).
# A test that never ran (the app did not compile, the browser suite never started) is a FAIL, so a
# broken run cannot pass by running nothing. Exits 0 whatever the tests found; 2 on bad usage.
#
# The case's tests (the agent never sees them) live in <case>/acceptance:
#   java/**.java   copied into src/test/java: Spring tests against the app (@AppTest), run by Surefire
#   e2e/*.spec.ts  copied into e2e/tests in place of the app's own specs: Playwright in the browser,
#                  run by the app's E2eIT
# It works on a copy of the run's directory. The run's own Java tests are set back to the fixture's
# (acceptance judges the app, and a test the agent broke must not hide an app that works), and its
# frontend tests and Spotless and JaCoCo's checks are skipped: check-roux-way.sh's build judges those.
# permissions.gen.ts is first written as the app's PermissionsListTest writes it.
# Needs Docker (Testcontainers) and, the first time, the network for Playwright's browser.
#
# Usage: eval-acceptance.sh <case dir> <run dir with the fixture's git history>
set -euo pipefail

if [ "$#" -ne 2 ] || [ ! -d "$1/acceptance" ] || [ ! -d "$2/.git" ]; then
  echo "usage: $(basename "$0") <case dir with acceptance/> <run dir with its git history>" >&2
  exit 2
fi
accept="$(cd "$1/acceptance" && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$2/." "$work/app"
app="$work/app"
base="$(git -C "$app" rev-list --max-parents=0 HEAD | tail -n 1)"

# The fixture's own Java tests, none of the run's, then the hidden ones.
rm -rf "$app/src/test/java"
git -C "$app" checkout -q "$base" -- src/test/java
# Except the list of the app's permission classes, which a run adds to (wiring, not a test of its
# own): PermissionClasses, or in a fixture from before it, PermissionsTest's ALL.
for wiring in PermissionClasses PermissionsTest; do
  if [ -f "$2/src/test/java/app/identity/$wiring.java" ]; then
    cp "$2/src/test/java/app/identity/$wiring.java" "$app/src/test/java/app/identity/$wiring.java"
    break
  fi
done
if [ -d "$accept/java" ]; then
  cp -R "$accept/java/." "$app/src/test/java/"
fi
e2e=false
if compgen -G "$accept/e2e/*.spec.ts" >/dev/null; then
  e2e=true
  rm -f "$app"/e2e/tests/*.spec.ts
  cp "$accept"/e2e/*.spec.ts "$app/e2e/tests/"
fi

log="$work/acceptance.log"
# permissions.gen.ts as the app writes it: PermissionsListTest, or in a fixture from before it,
# PermissionsTest (which needed Docker, so a run in the eval's sandbox could not write the file). The
# frontend steps are off: they would build against the stale file. Its result is not judged here.
(cd "$app" && ./mvnw -B -q test -Dtest='PermissionsListTest,PermissionsTest' \
  -Dsurefire.failIfNoSpecifiedTests=false \
  -Dskip.npm -Dskip.installnodenpm -Dfrontend.test.skip=true -Djacoco.skip=true \
  -Dspotless.check.skip=true) >"$work/permissions.log" 2>&1 || true
its=(-DskipITs)
if $e2e; then its=(-Dit.test=E2eIT -Dfailsafe.failIfNoSpecifiedTests=false); fi
(cd "$app" && ./mvnw -B verify -Dtest='app.acceptance.**' -Dsurefire.failIfNoSpecifiedTests=false \
  "${its[@]}" -Dmaven.test.failure.ignore=true -Dfrontend.test.skip=true -Dspotless.check.skip=true \
  -Djacoco.skip=true) >"$log" 2>&1 || true

python3 - "$accept" "$app" "$log" <<'EOF'
import glob, os, re, sys
import xml.etree.ElementTree as ET

accept, app, log = sys.argv[1:4]
results = {}  # name -> reason ("" passed)

# Expected tests, from the sources: every one must report.
expected = []
for path in sorted(glob.glob(f"{accept}/java/**/*.java", recursive=True)):
    cls = os.path.splitext(os.path.basename(path))[0]
    src = open(path).read()
    expected += [f"{cls}.{m}" for m in re.findall(r"@Test\s+void\s+(\w+)\s*\(", src)]
for path in sorted(glob.glob(f"{accept}/e2e/*.spec.ts")):
    src = open(path).read()
    expected += [f"e2e: {t}" for t in re.findall(r'^test\("((?:[^"\\]|\\.)*)"', src, re.M)]

for path in glob.glob(f"{app}/target/surefire-reports/TEST-app.acceptance.*.xml"):
    for case in ET.parse(path).getroot().iter("testcase"):
        name = f"{case.get('classname').split('.')[-1]}.{case.get('name')}"
        bad = case.find("failure")
        if bad is None:
            bad = case.find("error")
        if bad is not None:
            results[name] = (bad.get("message") or bad.get("type") or "failed").strip().splitlines()[0][:300]
        elif case.find("skipped") is not None:
            results[name] = "skipped"
        else:
            results[name] = ""

pw = f"{app}/target/playwright.log"
if os.path.exists(pw):
    out = open(pw, errors="replace").read()
    for mark, title in re.findall(r"^\s*([✓✘])\s+\d+\s+\S+ › (.+?)(?: \(\d[\d.]*(?:ms|s|m|h)\))?\s*$", out, re.M):
        name = f"e2e: {title}"
        if mark == "✓":
            results[name] = ""
        else:
            # The failure's own section: "  N) tests/x.spec.ts:L:C › <title>", then its first Error: line.
            section = re.search(r"^\s*\d+\) \S+ › " + re.escape(title) + r".*?^\s*Error: (.+?)$", out, re.M | re.S)
            results[name] = (section.group(1) if section else "failed")[:300]

build = open(log, errors="replace").read()
why_not_run = "never ran"
if "BUILD FAILURE" in build:
    m = re.search(r"^\[ERROR\] (?:Failed to execute goal|COMPILATION ERROR|.*\.java:\[\d+).*$", build, re.M)
    if m:
        why_not_run = "never ran: " + m.group(0)[8:250]
for name in expected:
    reason = results.get(name, why_not_run)
    if reason == "":
        print(f"PASS accept:{name}")
    else:
        print(f"FAIL accept:{name}")
        print(f"  {reason}")
EOF

# Keep the logs (the copy goes): the build's, the browser suite's and the app's.
kept="$(mktemp -d "${TMPDIR:-/tmp}/eval-acceptance.XXXXXX")"
cp "$log" "$kept/"
cp "$app"/target/playwright.log "$app"/target/app.log "$kept/" 2>/dev/null || true
echo "  logs: $kept"
