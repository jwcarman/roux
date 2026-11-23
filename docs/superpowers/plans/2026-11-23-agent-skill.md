# roux's skill, written for agents: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the skill's copied guides with an agent-first recipe plus cards, and prove on
`dojo-events` that it is at least as successful and cheaper than the current skill.

**Architecture:** `plugins/roux/skills/roux/SKILL.md` routes; `references/feature.md` is the
end-to-end recipe; the other references are short cards. `check-guides.mjs` stops requiring copies
and instead requires every public roux name to be in some guide and some reference, and every roux
import a reference shows to exist. The current skill is measured first, then the new one, on the
same fixture.

**Tech Stack:** Markdown, Node (check script), bash eval scripts (`run-evals.sh`, `eval-fixture.sh`),
`claude plugin eval`.

**Spec:** `docs/superpowers/specs/2026-11-22-agent-skill-design.md`

## Global Constraints

- Written for an agent: rule-first, exact names, no persuasion or history. Never invent an API; take
  every name from `docs/guides/` and roux's source.
- Card sections, in this order, omitting any a card doesn't need: one-line purpose, **Rules**,
  **Names**, **Steps**, **Example**, **Check**, **Pitfalls**.
- Word budgets (`wc -w`): `SKILL.md` ≤ 1,200; `references/feature.md` ≤ 4,000; every other
  reference ≤ 1,000.
- Examples are drawn from the guides' students/ranks examples.
- `docs/guides/` is not changed.
- Final reference set, exactly: `feature.md`, `errors.md`, `forms.md`, `lists.md`,
  `permissions.md`, `users.md`, `feedback.md`, `tests.md`, `app-setup.md`, `money.md`, `dates.md`,
  `activity-log.md`, `email.md`.
- Every eval run is reported; none is rerun or dropped. Protocol text is committed before its runs.
- Push to main only after James has seen the measured result (Task 8). Before pushing, run
  `./mvnw verify` and `./mvnw -Ppit verify` locally; push only when both pass.
- No star imports, no warning suppression (repo rules) in the check script.

## Review Focus

1. **An agent without Docker** (the eval sandbox) cannot run Java tests: the recipe's Check must give
   the Docker-free sequence (`./mvnw spotless:apply test-compile`, `./mvnw test -Dskip.npm
   -Dtest=PermissionsListTest`, `npm test`, `npm run build` in `frontend/`) and say the full
   `./mvnw verify` needs Docker. Task 3 checks this.
2. **A name that doesn't exist** (written from memory): caught by check (c)/(d) in Task 2 for
   imports; Task 3–6 verification steps run it.
3. **A grown app with a pattern to copy** (the dojo): the recipe opens by saying to find the nearest
   feature and copy its shape, using the recipe for names and order, so it doesn't add turns where
   the app already shows the way. Task 3 checks this.
4. **The router sends a feature task to one file:** `SKILL.md`'s table sends "add a resource / list
   / form / page" to `feature.md` first. Task 7 checks this.
5. **Version mismatch:** `SKILL.md` still says to compare the project's `roux.version` and
   `@jwcarman/roux-web` with the version `app-setup.md` names. Task 6 puts the version there; Task 7
   points to it.

---

### Task 1: Protocol and the current skill's baseline

**Files:**
- Modify: `plugins/roux/evals/PROTOCOL.md` (append a section)
- Modify: `plugins/roux/evals/fixture.local` (local, not committed if ignored)

- [ ] **Step 1: Commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-11-22-agent-skill-design.md docs/superpowers/plans/2026-11-23-agent-skill.md
git commit -m "docs: the agent-first skill's design and plan"
```

- [ ] **Step 2: Append "## The skill rewritten for agents (written before it runs)" to `PROTOCOL.md`**

Content, from the spec's "Measuring it": question (does the rewrite succeed at least as often as
the current skill, at lower mean cost?); case `dojo-events`; fixture = the dojo at the commit from
Step 1 (name the hash); arms Sonnet + current skill (`--ablation none`, run on the current skill
before any reference changes) and Sonnet + new skill (`--ablation none`, run after Task 7), 3 runs
each; scoring unchanged (11 hidden tests + `./mvnw verify -DskipITs`, nothing applied after);
kept if: new ≥ current successes and lower mean cost; the 6fa8fdf Events numbers shown for
reference only. Commit it:

```bash
git add plugins/roux/evals/PROTOCOL.md
git commit -m "test(plugin): the rewritten skill's eval, rules written first"
```

- [ ] **Step 3: Build the fixture**

Run: `plugins/roux/scripts/eval-fixture.sh <step-1 hash> <scratchpad>/eval-fixture-dojo-agent-skill`
Expected: prints the dir; the preflight inside it passes. Write that dir as the first line of
`plugins/roux/evals/fixture.local`.

- [ ] **Step 4: Run the current skill's arm**

Run: `plugins/roux/scripts/run-evals.sh --runs 3 --model sonnet --ablation none <scratchpad>/agent-skill-current dojo-events`
Expected: 3 runs, each with `.accept.txt` and `.check.txt`. Tell James the cost before starting
(~$2.20).

- [ ] **Step 5: Record the arm's result in `PROTOCOL.md`** (successes, hidden tests, build, mean
turns/time/cost, why any build failed) under "## Result: the current skill", then commit:

```bash
git add plugins/roux/evals/PROTOCOL.md
git commit -m "test(plugin): the current skill's result on the dojo, before the rewrite"
```

### Task 2: The check script checks coverage, not copies

**Files:**
- Modify: `plugins/roux/scripts/check-guides.mjs`
- Delete: `plugins/roux/scripts/sync-references.sh`
- Modify: `.github/workflows/ci.yml:65-66` (the comment)

**Interfaces:**
- Produces: `node plugins/roux/scripts/check-guides.mjs` exits 0 when (a) every public name is in
  backticks in some guide, (b) every public name is in backticks in some reference, (c) every name
  in an `import { … } from "@jwcarman/roux-web/<sub>"` inside a reference is an export of
  `web/roux-web/src/<sub>/index.ts`, (d) every `import org.jwcarman.roux.….<Type>;` inside a
  reference names a public type found under `runtime/*/src/main/java`. Problems print one per line
  as `missing from references: <name> (<file>)`, `unknown import in <reference>: <name> from <sub>`,
  `unknown import in <reference>: <fqcn>`. Success line: `ok: <n> public names documented in guides and references`.

- [ ] **Step 1: Prove each new check fails** — on a scratch copy of a reference, add
  `import { notARouxName } from "@jwcarman/roux-web/api";` and `import org.jwcarman.roux.problems.NoSuchType;`;
  and remove one reference file holding a unique name. Run the script after implementing (Step 2)
  and confirm each produces its problem line; then restore.

- [ ] **Step 2: Implement (b)–(d), removing the byte-for-byte check**

(b) reuses the guides' backtick scan over `references/*.md`. (c) and (d) scan the whole reference
text (code blocks included); `webExports(file)` already yields a subpath's names; type-only imports
(`type Money`) count by their name. Keep `excludedJava`.

- [ ] **Step 3: Run it on the unchanged references**

Run: `node plugins/roux/scripts/check-guides.mjs`
Expected: `ok: …` (the current references are the guides, so (b) holds), exit 0. Fix any (c)/(d)
hits in the current copies by checking whether the guide is wrong; if a guide is wrong, note it for
James, don't change the guide.

- [ ] **Step 4: Delete `sync-references.sh`, update the CI comment** to "every public roux name is
in a guide and in the skill's references, and every roux import a reference shows exists".

- [ ] **Step 5: Commit**

```bash
git add -A plugins/roux/scripts .github/workflows/ci.yml
git commit -m "build(plugin): references are checked for coverage and real imports, not as copies of the guides"
```

### Task 3: The recipe, `feature.md`

**Files:**
- Create: `plugins/roux/skills/roux/references/feature.md`
- Delete: `references/entities.md`, `references/api-client.md`, `references/queries-and-mutations.md`

**Interfaces:**
- Consumes: Task 2's check.
- Produces: `references/feature.md` with sections "Find the nearest feature", "Steps" (numbered, one
  per file, server then client then tests), "Add a field to an existing feature", "Check", "Pitfalls".

- [ ] **Step 1: Write the recipe.** Sources: `docs/guides/entities.md`, `api-client.md`,
  `queries-and-mutations.md`, the recipe-relevant parts of `errors.md`, `forms.md`,
  `tables-and-paging.md`, `roles.md`, `shell.md`, `testing.md`, and the dojo's `plans` feature
  (`examples/dojo/frontend/src/plans/`, its Java package) as the shape to check against. Order:
  changeset → entity (`AuditableEntity`) → repository → records (`<Thing>`, `<Thing>Request` with
  `version`, `PageDto<Thing>`) → service (refusals, `Versions.require`) → controller + permission →
  `PermissionsListTest` → `queryKeys.ts` → resource module (schema via rule helpers, API object with
  `getJson`/`sendJson`/`path`, `queryOptions`, `pageQuery`, `mutationOptions` with
  `meta.refreshes`) → list page (`QueryTable`, `tableSearchOf`) → form dialog (`useSchemaForm`,
  `FormDialog`) → route file + nav entry (`defineNav`) → Java test (`@AppTest`, `TestUsers`,
  `reset()`) → Vitest (MSW, `server`, `invalidFields`). API-client details an agent needs only
  sometimes (query params, raw `Response`, `configureApi`) go in a short "Names" block at the end.
  Example: one resource (ranks) carried through every step.
- [ ] **Step 2: Delete the three replaced references.**
- [ ] **Step 3: Verify**

Run: `node plugins/roux/scripts/check-guides.mjs && wc -w plugins/roux/skills/roux/references/feature.md`
Expected: `ok: …`; ≤ 4,000 words. Also confirm by reading: the Check section has the Docker-free
sequence and says `./mvnw verify` needs Docker (Review Focus 1); the first section says to copy the
nearest feature (Review Focus 3).

- [ ] **Step 4: Commit** — `docs(plugin): the skill's recipe for a feature, written for agents`

### Task 4: Server and list cards — `errors.md`, `forms.md`, `lists.md`

**Files:**
- Overwrite: `references/errors.md`, `references/forms.md`
- Create: `references/lists.md`; Delete: `references/tables-and-paging.md`

- [ ] **Step 1: Write the three cards** in the card format, covering only what the recipe doesn't
  (spec table rows for each), linking back to `feature.md` for the common path.
- [ ] **Step 2: Verify** — `node plugins/roux/scripts/check-guides.mjs` prints `ok`; `wc -w` on each
  ≤ 1,000.
- [ ] **Step 3: Commit** — `docs(plugin): errors, forms and lists cards for agents`

### Task 5: People and feedback cards — `permissions.md`, `users.md`, `feedback.md`, `tests.md`

**Files:**
- Create: `references/permissions.md`, `references/tests.md`; Overwrite: `references/users.md`,
  `references/feedback.md`; Delete: `references/roles.md`, `references/testing.md`

- [ ] **Step 1: Write the four cards** (spec table rows). `permissions.md` says `permissions.gen.ts`
  is written by `PermissionsListTest` and never edited by hand.
- [ ] **Step 2: Verify** — check script `ok`; each ≤ 1,000 words.
- [ ] **Step 3: Commit** — `docs(plugin): permissions, users, feedback and tests cards for agents`

### Task 6: Setup and the less common cards — `app-setup.md`, `money.md`, `dates.md`, `activity-log.md`, `email.md`

**Files:**
- Create: `references/app-setup.md`, `references/dates.md`; Overwrite: `references/money.md`,
  `references/activity-log.md`, `references/email.md`; Delete: `references/getting-started.md`,
  `references/shell.md`, `references/dates-and-time.md`

- [ ] **Step 1: Write the five cards.** `app-setup.md` names the roux version exactly as
  `getting-started.md` does (`roux.version` and the `npm install @jwcarman/roux-web@…` line).
- [ ] **Step 2: Verify**

Run: `node plugins/roux/scripts/check-guides.mjs; ls plugins/roux/skills/roux/references; wc -w plugins/roux/skills/roux/references/*.md`
Expected: `ok`; exactly the 13 files in Global Constraints; budgets met.

- [ ] **Step 3: Commit** — `docs(plugin): setup, money, dates, activity log and email cards for agents`

### Task 7: The router, `SKILL.md`

**Files:**
- Modify: `plugins/roux/skills/roux/SKILL.md` (keep the frontmatter `name` and `description` unchanged)

- [ ] **Step 1: Rewrite the body**: what roux is (≤ 3 lines, keep "never without who" and "one
  origin"); look at the project first (versions match, against `app-setup.md`; nearest feature);
  conventions as one-line rules (each current bullet kept, compressed; who's invitation rules
  move to `users.md` if not already there); a task → file table whose first row sends a new
  resource, list, form or page to `feature.md`; before you finish (the Docker-free checks, then
  "check the change against the Pitfalls of each file you used"; "if no reference covers it, say so
  rather than invent an API").
- [ ] **Step 2: Verify** — `wc -w` on SKILL.md minus frontmatter ≤ 1,200; every file in the table
  exists; check script `ok`.
- [ ] **Step 3: Commit** — `docs(plugin): the skill routes to a recipe and cards`

### Task 8: Measure the new skill and report

**Files:**
- Modify: `plugins/roux/evals/PROTOCOL.md`

- [ ] **Step 1: Run the new skill's arm** on the same fixture (`fixture.local` unchanged):
  `plugins/roux/scripts/run-evals.sh --runs 3 --model sonnet --ablation none <scratchpad>/agent-skill-new dojo-events`.
  Tell James the cost before starting (~$2.20).
- [ ] **Step 2: Record "## Result: the rewritten skill"**: a table of both arms (and the 6fa8fdf
  rows marked "for reference"), the verdict against the rule written in Task 1, and why any build
  failed. Commit: `test(plugin): the rewritten skill's result on the dojo`.
- [ ] **Step 3: Report to James and stop.** If supported, and he agrees: run `./mvnw verify` and
  `./mvnw -Ppit verify`, then push to main. If not supported, the result goes to James before any
  further change.
