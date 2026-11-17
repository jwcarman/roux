#!/usr/bin/env bash
# Checks a run's work on an eval fixture (eval-fixture.sh) for roux's way, by script where it can
# be checked by script. Prints one `PASS <check>` or `FAIL <check>` line per check, a failure's
# evidence indented under it, and exits 0 whatever the checks found.
#
# Only what the run changed is judged: the lines added to files changed since the fixture's first
# commit, and every line of a file that is new, so the copied shell never fails a check. On an
# untouched fixture every check passes.
#
#   build                 ./mvnw -B verify -DskipITs succeeds
#   no-fetch              no fetch( in frontend/src outside tests: calls go through roux's client
#   no-roux-internals     roux-web is imported only by its six entry points, never dist/ or src/
#   no-retyped-messages   none of roux's rule messages typed out as string literals in frontend/src
#   no-exception-handler  no @ExceptionHandler or ResponseStatusException in src/main/java
#   schema-form           a form the run wrote is built with useSchemaForm or FormDialog
#
# Usage: check-roux-way.sh <dir>
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -d "$1/.git" ]; then
  echo "usage: $(basename "$0") <fixture dir with its git history>" >&2
  exit 2
fi
dir="$(cd "$1" && pwd -P)"
base="$(git -C "$dir" rev-list --max-parents=0 HEAD | tail -n 1)"

# Files the run added or modified (deleted ones have nothing left to judge).
changed=()
while IFS= read -r file; do
  changed+=("$file")
done < <({
  git -C "$dir" diff --name-only --diff-filter=d "$base"
  git -C "$dir" ls-files --others --exclude-standard
} | sort -u)

# The lines the run wrote in a file: all of a new file, the added lines of a modified one.
added() {
  if git -C "$dir" cat-file -e "$base:$1" 2>/dev/null; then
    git -C "$dir" diff -U0 "$base" -- "$1" | grep '^+' | grep -v '^+++' | cut -c2- || true
  else
    cat "$dir/$1"
  fi
}

is_test() {
  case "$1" in
    *.test.ts | *.test.tsx | frontend/src/test/* | frontend/src/testing/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Changed files whose path matches the regex $1; tests left out unless $2 is "with-tests".
files_matching() {
  local file
  for file in ${changed[@]+"${changed[@]}"}; do
    if [[ "$file" =~ $1 ]] && { [ "${2:-}" = "with-tests" ] || ! is_test "$file"; }; then
      echo "$file"
    fi
  done
}

# Prints PASS or FAIL for check $1 from the evidence in $2 (one finding per line; none is a pass).
report() {
  if [ -z "$2" ]; then
    echo "PASS $1"
  else
    echo "FAIL $1"
    printf '%s\n' "$2" | sed 's/^/  /'
  fi
}

# Every added line of the files in $1 (one per line) that matches the extended regex $2, as file: line.
grep_added() {
  local file
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    added "$file" | grep -E -- "$2" | sed "s|^|$file: |" || true
  done <<<"$1"
}

frontend_code='^frontend/.*\.(ts|tsx|js|jsx|mjs)$'
frontend_src='^frontend/src/.*\.(ts|tsx|js|jsx)$'

# build
tmp="${TMPDIR:-/tmp}"
log="$(mktemp "${tmp%/}/check-roux-way-build.XXXXXX")"
if (cd "$dir" && ./mvnw -B verify -DskipITs) >"$log" 2>&1; then
  rm -f "$log"
  report build ""
else
  report build "log: $log"
fi

# no-fetch: fetch( on its own or as a member (window.fetch), not refetch( or fetchQuery(.
report no-fetch "$(grep_added "$(files_matching "$frontend_src")" '(^|[^A-Za-z0-9_$])fetch\(')"

# no-roux-internals
internals=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  while IFS= read -r spec; do
    [[ "$spec" =~ ^@jwcarman/roux-web/(problem|api|paging|table|feedback|form)$ ]] ||
      internals+="$file: $spec"$'\n'
  done < <(added "$file" | grep -oE "@jwcarman/roux-web/[^'\"\`[:space:]]*" || true)
done <<<"$(files_matching "$frontend_code" with-tests)"
report no-roux-internals "${internals%$'\n'}"

# no-retyped-messages: roux-web's rule messages (form/rules.ts) opening a string literal.
messages='Must not be blank|Must not be empty|Is not in the expected format|Must be a valid email address|Must be a valid web address|Must be a whole number|Must be between 0 and|Must be at least|Must be at most'
report no-retyped-messages "$(grep_added "$(files_matching "$frontend_src")" "[\"'\`]($messages)")"

# no-exception-handler
report no-exception-handler \
  "$(grep_added "$(files_matching '^src/main/java/.*\.java$')" '@([A-Za-z0-9_]+\.)*ExceptionHandler([^A-Za-z0-9_]|$)|ResponseStatusException')"

# schema-form: a component whose added lines make a form (useAppForm, useForm, <form>, onSubmit=)
# must build it with useSchemaForm or FormDialog.
hand_rolled=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  if added "$file" | grep -qE 'useAppForm\(|useForm\(|<form([[:space:]>]|$)|onSubmit='; then
    grep -qE 'useSchemaForm|FormDialog' "$dir/$file" || hand_rolled+="$file"$'\n'
  fi
done <<<"$(files_matching '^frontend/src/.*\.tsx$')"
report schema-form "${hand_rolled%$'\n'}"
