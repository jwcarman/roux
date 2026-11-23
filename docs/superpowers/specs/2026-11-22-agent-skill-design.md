# roux's skill, written for agents

James, 2026-11-22: "The skills would be written for an AGENT to consume, not a human." / "I want the
skills to work well for agents." Until now `plugins/roux/skills/roux/references/` held byte-for-byte
copies of `docs/guides/` (enforced by `check-guides.mjs`): about 37k words of prose that explains and
persuades, laid out by topic. An agent pays for every sentence in context and needs the rule, the
exact name, the file, and the check.

The evals show the cost. On the dojo (`dojo-events`, fixture 6fa8fdf), Sonnet with the current skill
succeeded 3 of 3 but took 31 turns and $0.73 a run against 25 turns and $0.58 without it: on a grown
app with a close pattern to copy, the guides were reading it didn't need. On Locations (a new app,
little to copy) the skill decided success, and what it decided was the build: every run passed the
hidden tests, and the failures were Spotless, coverage, a run's own failing test, and a stale
`permissions.gen.ts`.

## Goals

- A skill an agent can act on first time: the common job (add a feature) as one recipe in file
  order, every name exact, ending in the checks that make the build green.
- Cheaper to use: on a grown app the skill should cost little more than no skill, not 26% more.
- Proven, not asserted (see Measuring it).
- `docs/guides/` stays the human documentation (and the source for a docs site later).

## Non-goals

- Changing roux's API. A gap found while writing is noted (in the commit or `examples/dojo/FINDINGS.md`)
  for later, not fixed here.
- Porting dojo (James: "not really worried about dojo").
- Changing the guides, beyond what `check-guides.mjs` needs.

## Anti-goals

- A skill that is shorter but loses the checks: the build is what decides success, so the Check and
  Pitfalls content must survive the cut.
- Rules that police hand-written code. roux is an accelerator; the skill says the short right way,
  not a list of prohibitions for their own sake.

## Approaches

1. **Split by layer** (the first draft): server feature, client module, forms, list page, page,
   tests, plus topic cards. Clean files, but every feature touches all six, so an agent reads six
   files and assembles the order itself.
2. **Recipe plus cards** (chosen, James 2026-11-23): one end-to-end recipe for adding a feature, in
   the order the files are written, with the checks at the end; short cards for everything else.
   The common job costs one read.
3. **Trimmed copies of the guides**: keep the topic layout and cut the prose. Least work, but keeps
   the shape that makes an agent read several guides and stitch them together.

## Shape

`SKILL.md` stays the router, made shorter: what roux is in a few lines, "look at the project first"
(roux versions match, nearest feature to copy), the conventions as one-line rules, a table from task
to file, and "before you finish" (the checks).

`references/`:

| File | What it covers |
| --- | --- |
| `feature.md` | **The recipe.** A new resource end to end, in order: changeset, entity, repository, records, service with its refusals, controller with its permission, `PermissionsListTest` to write `permissions.gen.ts`, query keys, the resource module (schema from rule helpers, API object, queries, `pageQuery`, mutations with `meta.refreshes`), the list page (`QueryTable`, URL state), the form dialog (`useSchemaForm`, `FormDialog`), the route and nav entry, the Java test (`@AppTest`, `TestUsers`), the Vitest test (MSW), then the checks. Adding a field to an existing feature as a short second recipe. |
| `errors.md` | Every refusal and its exception, stale versions (`Versions.require`), what the browser shows, refusing because another feature holds a row |
| `forms.md` | Beyond the recipe: field types, `inputOf`, 409 on a form, a form on a page, a long form, a custom field, a rule across two fields |
| `lists.md` | Beyond the recipe: search and filter chips, short lists, `InfiniteList`, `InfiniteSelect`, export, ordered lists, a column only some callers see, view-backed lists |
| `permissions.md` | Permissions and roles, `permissions.gen.ts`, invitable roles, last owner |
| `users.md` | Users, invitations, the signed-in user, an app entity per user |
| `feedback.md` | `notify`, `useConfirm`, `useServerAction`, inline errors, not-found and error pages |
| `tests.md` | Beyond the recipe: `TestClock`, captured mail, route tests, Playwright |
| `app-setup.md` | A new app, required settings, the app root, shell, theme, sign-in, CSP |
| `money.md`, `dates.md`, `activity-log.md`, `email.md` | The less common concerns |

Each card, in this order, leaving out a section it doesn't need: a one-line purpose; **Rules** (do /
never, one line each); **Names** (imports and signatures, exact); **Steps** (files to touch, in
order); **Example** (minimal, copyable); **Check** (commands and what passing looks like);
**Pitfalls** (the guides' "Things to know" and "Don't" items that bite).

The recipe's example is one feature drawn from the guides' students/ranks examples, carried through
every step, so the pieces fit together as written.

`check-guides.mjs` changes from "references are copies of the guides" to "every public roux name is
in backticks in some guide and in some reference". `sync-references.sh` is deleted; mentions of it in
`examples/dojo/FINDINGS.md` are updated (old plans are left as history).

## Measuring it

Written into `plugins/roux/evals/PROTOCOL.md` as its own section before any run, like the earlier ones.

- **Case:** `dojo-events` (scored by its hidden tests and the build, no LLM judge).
- **Fixture:** the commit the rewrite starts from, not 6fa8fdf. Since 6fa8fdf, roux changed
  (`17dcb3e`: `TestUsers.reset()` takes no tables), and a skill written for today's roux would not
  compile against the old fixture.
- **Arms:** Sonnet + current skill and Sonnet + new skill, 3 runs each (about $4.50). The 6fa8fdf
  results are reported beside them for reference, not compared.
- **Kept if:** the new skill succeeds at least as often as the current one, at a lower mean cost.
  Anything else is reported as not supported, and the result goes to James before anything else
  happens.

## Calls made while writing this (James to check)

- New fixture and a fresh current-skill arm, rather than reusing the 6fa8fdf numbers, for the reason
  above.
- A size budget, so the cut is real: `SKILL.md` under about 1,200 words, `feature.md` under about
  4,000, each card under about 1,000.
- `errors.md`, `forms.md` and the other cards keep their topic names, so the router table stays
  readable.

## Left to the writer

Wording, which details from each guide an agent needs, and the examples.
