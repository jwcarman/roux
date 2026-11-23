# Agent skill, round 2: fix what the Haiku runs broke on

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the rewritten skill's success on a new app (Haiku, `app-locations`) from 20 of 30
toward 26+ while keeping its cost near $0.08 a run, by removing the failure causes the runs found.

**Architecture:** The recipe (`references/feature.md`) stops causing failures: its examples become
complete and correct for the three things agents got wrong. A deterministic gate script in the
skill (`scripts/check.sh`) replaces the remembered check order. The recipe's code is proven by
building it into a fresh app in CI (`check-recipe.sh`). Then one pre-registered Haiku arm is run
against the 60 runs already recorded.

**Tech Stack:** Markdown skill, bash, Node (`check-guides.mjs`), the app template (Maven, Vitest),
`claude plugin eval`.

**Spec:** `docs/superpowers/specs/2026-11-22-agent-skill-design.md`. The evidence this plan argues
from is `plugins/roux/evals/PROTOCOL.md`, "Result: agent-friendly wording on a new app, Haiku"
(50bb88e).

## Global Constraints

- Word budgets: SKILL.md ≤ 1,200 words; `feature.md` ≤ 4,000; each card ≤ ~1,000.
- `node plugins/roux/scripts/check-guides.mjs` passes after every commit (commit only on its `ok:`).
- No change under `templates/app/`: the re-measure reuses fixture 143165c so today's 60 runs stay a
  valid comparison.
- Rules carry a one-line reason ("do X: Y breaks when Z"); no bare ALWAYS/NEVER.
- No star imports; no warning suppression; commit locally, push only after the user agrees and
  `./mvnw verify` and `./mvnw -Ppit verify` pass.

## Review Focus

1. An agent in the eval sandbox runs `check.sh` from the app root with no Docker and no network:
   it must not need either (Maven offline, `npm ci` cached) and must exit non-zero on any failure.
2. `check.sh` run in a grown app with no permission change and no new changelog still passes.
3. A malformed changelog other than `roles.xml` (e.g. the feature's own) is caught too.
4. The recipe's Java test, copied as is, passes the 100% JaCoCo gate on the recipe's service.
5. Size labels in SKILL.md that drift from the files are caught by `check-guides`.

---

### Task 1: The recipe's three failure causes and the uncovered branch

The runs failed on: a permissions changeset placed after `</databaseChangeLog>` (2), a stale-version
test whose first edit changed nothing (2), the `signedIn(...)` line copied twice with one address
(2), and the untested "the name is this record's own" side of `requireUniqueName` (all 5 Java
coverage failures, both arms).

**Files:** Modify `plugins/roux/skills/roux/references/feature.md` (steps 5, 11, Check, Pitfalls).

- [ ] **Step 1:** Step 5's `roles.xml` block shows the changeset inside its file's existing
  `<databaseChangeLog>`, just before the closing tag, with the reason: XML after the root element
  stops every database from starting.
- [ ] **Step 2:** Step 11's test gains, as code: `an_edit_at_a_stale_version_is_a_409` (create,
  update at version 0 with a *changed* name so the version moves to 1, then update at 0 again → 409;
  comment: an edit that changes nothing does not move the version);
  `an_edit_that_keeps_its_own_name_is_saved` (comment: the other side of `requireUniqueName`'s
  filter; the 100% branch gate fails without it); `a_name_another_rank_has_is_a_400_on_the_name_field`.
  The 403 test signs in once into a local `TestUser`; note that each `signedIn` needs its own
  address (a second sign-in with the same address throws `EmailAddressTakenException`).
- [ ] **Step 3:** Pitfalls gain the three, each with its reason.
- [ ] **Step 4:** `node plugins/roux/scripts/check-guides.mjs` → `ok:`; word count ≤ 4,000. Commit
  `docs(plugin): the recipe's tests cover the stale edit, the record's own name and one sign-in per address`.

### Task 2: `scripts/check.sh`, the gate an agent runs

**Files:** Create `plugins/roux/skills/roux/scripts/check.sh`. Modify SKILL.md "Before you finish"
and `feature.md` "Check".

- [ ] **Step 1: The failing cases.** In a scratch copy of the app fixture (`fixture-app.local`), make
  three broken states and record that today nothing catches them before Docker: a changeset after
  `</databaseChangeLog>` in `roles.xml`; an unformatted Java file; a new permission constant with a
  stale `permissions.gen.ts`.
- [ ] **Step 2: Write `check.sh`** (run from the app root, `bash <skill dir>/scripts/check.sh`),
  stopping at the first failure with one line saying what failed and what to do:
  1. every `src/main/resources/db/changelog/*.xml` is well-formed (`xmllint --noout`, falling back
     to `python3 -c 'import xml.dom.minidom'`);
  2. `./mvnw -q test -Dskip.npm -Dtest=PermissionsListTest -Dsurefire.failIfNoSpecifiedTests=false`,
     run a second time if the first rewrote `permissions.gen.ts`;
  3. `./mvnw -q spotless:apply test-compile` (also runs the frontend's `npm ci`, coverage gate and
     build).
  Last line `check: ok (Java tests need Docker: ./mvnw verify)`.
- [ ] **Step 3:** Each broken state from step 1 fails with its line; the clean fixture prints `ok`.
  Also run it under `eval-preflight.sh`'s sandbox profile (no `$HOME` reads, refusing proxy).
- [ ] **Step 4:** SKILL.md "Before you finish" and `feature.md` "Check" say *run* the script (with
  why: it does the steps in the order the build needs) instead of listing commands; keep the Docker
  line. Commit `feat(plugin): the skill's check script runs the Docker-free gate in order`.

### Task 3: Reasons on rules, a self-contained recipe, a shorter description

**Files:** Modify SKILL.md, `feature.md`, the cards.

- [ ] **Step 1:** Every rule in SKILL.md's conventions and `feature.md`'s Rules gets its reason in
  one clause. Cards: the rules whose violation fails a build or a test get theirs.
- [ ] **Step 2:** `feature.md` points out only for variants (long list, a field type it doesn't
  show); nothing the common job needs lives only in a card.
- [ ] **Step 3:** The description: what it is, the trigger names (`org.jwcarman.roux`,
  `@jwcarman/roux-web`, `useSchemaForm`, `QueryTable`, `PageDto`, `NotFoundException`), the task
  kinds; ≤ 60 words.
- [ ] **Step 4:** check-guides `ok:`, budgets hold. Commit
  `docs(plugin): every rule says why; the recipe stands alone`.

### Task 4: Size labels in the index, checked

**Files:** Modify SKILL.md's table, `plugins/roux/scripts/check-guides.mjs`.

- [ ] **Step 1:** Add check (e): every `references/*.md` row in SKILL.md carries `(~N tokens)`, and
  N is within 20% of the file's bytes / 4. Run it before adding labels → fails, naming each file.
- [ ] **Step 2:** Add the labels → passes. Commit
  `feat(plugin): the reference index gives each file's size, checked`.

### Task 5: The recipe's code, built into a fresh app

**Files:** Create `plugins/roux/scripts/check-recipe.sh`; modify `feature.md` (file markers),
`.github/workflows/ci.yml` (plugin job).

- [ ] **Step 1:** Each whole-file block in `feature.md` is preceded by `<!-- file: <path> -->`;
  each fragment (`queryKeys`, nav entry, `Permissions`, `roles.xml` changeset, master include) by
  `<!-- fragment: <name> -->`.
- [ ] **Step 2:** `check-recipe.sh` copies `templates/app` to a temp dir, writes every file block,
  applies each fragment with a fixed insertion per name, runs `PermissionsListTest` twice and then
  `./mvnw -B verify -DskipITs` (Docker). Run it → it fails on whatever the recipe gets wrong
  (expected: missing package lines, the module's `removeRank` uncovered by Vitest).
- [ ] **Step 3:** Fix the recipe until the script passes: the recipe's own tests meet both 100%
  gates. Budget holds; any cut is to prose, not to the tests.
- [ ] **Step 4:** CI's plugin job runs `check-recipe.sh` (it has Docker). Commit
  `test(plugin): the recipe's code builds into a fresh app and passes its gates`.

### Task 6: Re-measure, rules first

- [ ] **Step 1:** Append to `PROTOCOL.md` before any run: Haiku, `app-locations`, fixture 143165c,
  30 runs of the round-2 skill (`--ablation none`, batches of 5), compared with the two recorded
  arms. Supported if successes beat the rewrite's 20 of 30 at one-sided Fisher p < 0.05 (that is,
  27 or more) at a mean cost ≤ $0.12; refuted if fewer than 20; otherwise not shown. Commit.
- [ ] **Step 2:** Run (≈ $2.50, ≈ 90 min), score with the same script, classify failures.
- [ ] **Step 3:** Record the result and failure table in `PROTOCOL.md`; commit. Report to the user;
  push only on their word after `./mvnw verify` and `./mvnw -Ppit verify`.
