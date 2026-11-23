---
name: roux
description: Builds features the roux way in a Spring Boot 4 + React 19 app built on roux (org.jwcarman.roux, roux-bom, roux-spring-boot-starter, @jwcarman/roux-web) - Problem Details errors and roux's exceptions, the API client, TanStack Query modules with meta.refreshes, Zod forms through useSchemaForm and the rule helpers, server-paged QueryTable lists, toasts and confirmations, and tests with MSW and @AppTest. Use this skill whenever the project depends on org.jwcarman.roux or @jwcarman/roux-web, or the user asks to add or change a list, table, form, dialog, page, endpoint, error, query or mutation in such an app - even when they don't say "roux" but the code clearly uses it (imports from @jwcarman/roux-web/..., NotFoundException from org.jwcarman.roux.problems, PageDto, useSchemaForm, QueryTable).
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
  must match each other and the version `references/app-setup.md` names. If not, tell the user
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
  edit's request carries `version`.
- Refusals are exceptions (`NotFoundException` subclass, `InvariantViolationException`,
  `InvalidFieldException`, `ConflictException`) and `Versions.require`. No `@ExceptionHandler`, no
  error `ResponseEntity`. Messages are for people.
- Every endpoint has `@RequiresPermission` with a permission, never a role.
- One frontend module per resource: schema, API object (`getJson`, `sendJson`, `path`), queries,
  mutations. Pages never call the API or `fetch`.
- Mutations name what they refresh in `meta.refreshes`; never `invalidateQueries`. Use
  `createQueryClient()` (`testQueryClient()` in tests), never `new QueryClient()`.
- Forms go through `useSchemaForm` with roux's rule helpers (`text()`, `oneOf()`...); never retype a
  server message.
- Buttons that change data use `useServerAction`; consequences ask first with `useConfirm`; outcomes
  are told with `notify`.
- Long lists are paged by the server and shown with `QueryTable`, state in the URL.
- Import roux-web only from its subpaths (`@jwcarman/roux-web/api`, `/form`, `/table`...).
- Time from the injected `Clock`; today from `OrganizationCalendar` / `today()`.
- Never suppress a warning; no star imports.

## Which reference

| The task | Read |
| --- | --- |
| **A new resource, list, form, page or endpoint; adding a field to one** | `references/feature.md` (start here) |
| A refusal: 404, a rule, a field, a 409, a stale save, another feature holds it, "already done"; what the browser shows | `references/errors.md` |
| Rule helpers, a two-field rule (`@After`/`after()`), every field type, a form on a page, 409s on a form, a custom field, a form that doesn't save | `references/forms.md` |
| A list paged by the server, search and filter chips, URL state, a growing list, a picker, row selection, ordered rows, a column only some see, a view-backed list | `references/lists.md` |
| Permissions, roles, `permissions.gen.ts`, `UserJoined`, invitable roles, the last owner | `references/permissions.md` |
| Users, invitations, the signed-in user, an entity per user, who's invitation rules | `references/users.md` |
| Toasts, confirmations, a button that runs a mutation, a control that saves on change, error pages | `references/feedback.md` |
| `@AppTest`, `TestUsers`, `TestClock`, mail in tests, MSW answers, route tests, Playwright | `references/tests.md` |
| A new app, required settings, `main.tsx`, the session and guards, navigation, theme, sign-in, CSP | `references/app-setup.md` |
| Money | `references/money.md` |
| Today, the organization's zone, formatting dates, times and numbers | `references/dates.md` |
| A record's history | `references/activity-log.md` |
| who's emails: wording, subjects, brand | `references/email.md` |

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
