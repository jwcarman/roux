---
name: roux
description: Builds and changes features in a Spring Boot + React app built on roux (org.jwcarman.roux, roux-bom, @jwcarman/roux-web) - entities and endpoints, errors, permissions, lists and tables, forms and dialogs, pages, and their tests. Use it whenever the project depends on roux or its code uses @jwcarman/roux-web, useSchemaForm, QueryTable, PageDto or org.jwcarman.roux.problems, even when the user does not say "roux".
---

# roux

roux is the base of a Spring Boot 4 + React 19 app: components for what an app never changes
(Problem Details errors, the API client, paging, tables, forms, feedback) and plain app code for
what it does (entities, endpoints, pages). There is one way to do each thing. Every roux app uses
who for identity (passwordless sign-in), and the SPA and API share one origin.

roux's names are its own (`sendJson`, `meta.refreshes`, `useSchemaForm`, `QueryTable`): guesses
from general Spring or React knowledge are wrong in the details. **Read the reference for the task
before writing code, and take names from it.** Each reference is rules, exact names, steps, an
example, the check and the pitfalls.

## First, look at the project

- **Versions:** `roux.version` in `pom.xml` and `@jwcarman/roux-web` in `frontend/package.json`
  must match each other and the version `references/app-setup.md` (~1,800 tokens) names. If not, tell the user
  before anything else.
- **The nearest feature:** in a grown app, find the existing feature most like the task and copy its
  shape (package, folder, files, imports, tests). Java is packaged by feature (`app.<feature>`), the
  frontend foldered by feature (`frontend/src/<feature>/`); route files under `src/routes/` stay
  thin. A file holding one component is PascalCase (`RanksPage.tsx`); a module of several things is
  camelCase (`ranks.ts`); a test is named after its file.
- **What is shared:** `src/queryKeys.ts`, `main.tsx`, `src/shell/nav.ts`, `src/testing/`, the
  app's `CLAUDE.md`. One Maven module per app.

## The conventions

- Controllers take and return records (`Rank`, `RankRequest`, `PageDto<Rank>`), never entities; an
  edit's request carries `version`, which is how a stale save becomes a 409.
- Refusals are exceptions (`NotFoundException` subclass, `InvariantViolationException`,
  `InvalidFieldException`, `ConflictException`) and `Versions.require`. No `@ExceptionHandler`, no
  error `ResponseEntity`: roux makes the Problem Details the browser reads. Messages are for people.
- Every endpoint has `@RequiresPermission` with a permission, never a role: roles are data the
  owner edits.
- One frontend module per resource: schema, API object (`getJson`, `sendJson`, `path`), queries,
  mutations. Pages never call the API or `fetch` (the module adds CSRF and reads problems).
- Mutations name what they refresh in `meta.refreshes`, never `invalidateQueries`; use
  `createQueryClient()` (`testQueryClient()` in tests), never `new QueryClient()`: only roux's client
  runs the refreshes, and forms wait for them.
- Forms go through `useSchemaForm` with roux's rule helpers (`text()`, `oneOf()`...); never retype a
  server message: the helpers carry the server's words, so the two never disagree.
- Buttons that change data use `useServerAction`; consequences ask first with `useConfirm`; outcomes
  are told with `notify`.
- Long lists are paged by the server and shown with `QueryTable`, state in the URL (so a link or
  reload keeps the page).
- Import roux-web only from its subpaths (`@jwcarman/roux-web/api`, `/form`, `/table`...): it has
  no root export.
- Time from the injected `Clock`; today from `OrganizationCalendar` / `today()`, so tests set the
  time and "today" is the organization's, not the server's.
- Never suppress a warning; no star imports.

## Which reference

| The task | Read |
| --- | --- |
| **A new resource, list, form, page or endpoint; adding a field to one** | `references/feature.md` (~8,100 tokens) — start here |
| A refusal: 404, a rule, a field, a 409, a stale save, another feature holds it, "already done"; what the browser shows | `references/errors.md` (~1,400 tokens) |
| Rule helpers, a two-field rule (`@After`/`after()`), every field type, a form on a page, 409s on a form, a custom field, a form that doesn't save | `references/forms.md` (~1,600 tokens) |
| A list paged by the server, search and filter chips, URL state, a growing list, a picker, row selection, ordered rows, a column only some see, a view-backed list | `references/lists.md` (~1,900 tokens) |
| Permissions, roles, `permissions.gen.ts`, `UserJoined`, invitable roles, the last owner | `references/permissions.md` (~1,200 tokens) |
| Users, invitations, the signed-in user, an entity per user, who's invitation rules | `references/users.md` (~1,400 tokens) |
| Toasts, confirmations, a button that runs a mutation, a control that saves on change, error pages | `references/feedback.md` (~1,300 tokens) |
| `@AppTest`, `TestUsers`, `TestClock`, mail in tests, MSW answers, route tests, Playwright | `references/tests.md` (~1,400 tokens) |
| A new app, required settings, `main.tsx`, the session and guards, navigation, theme, sign-in, CSP | `references/app-setup.md` |
| Money | `references/money.md` (~800 tokens) |
| Today, the organization's zone, formatting dates, times and numbers | `references/dates.md` (~1,000 tokens) |
| A record's history | `references/activity-log.md` (~900 tokens) |
| who's emails: wording, subjects, brand | `references/email.md` (~600 tokens) |

## Before you finish

From the app's root, **run** `bash <this skill's base directory>/scripts/check.sh`. It does the checks
that need no Docker in the order the build needs (changelogs well-formed, Java formatted, the
permissions list rewritten, then compile plus the frontend's tests, 100% coverage and build), and
stops at the first failure with what to fix. Fix it and run it again until it ends `check: ok`.

The Java tests and their 100% coverage gate need Docker (`./mvnw verify`). Without Docker, read your
Java tests against `feature.md` step 11: every service branch has a test, and every request body
satisfies the rules it isn't testing.

Then check the change against the **Pitfalls** of each reference you used. A test that fails is a
finding to fix, not to delete. If no reference covers what the task needs, say so to the user
rather than inventing an API.
