---
name: roux
description: Builds features the roux way in a Spring Boot 4 + React 19 app built on roux (org.jwcarman.roux, roux-bom, roux-spring-boot-starter, @jwcarman/roux-web) - Problem Details errors and roux's exceptions, the API client, TanStack Query modules with meta.refreshes, Zod forms through useSchemaForm and the rule helpers, server-paged QueryTable lists, toasts and confirmations, and tests with MSW and @AppTest. Use this skill whenever the project depends on org.jwcarman.roux or @jwcarman/roux-web, or the user asks to add or change a list, table, form, dialog, page, endpoint, error, query or mutation in such an app - even when they don't say "roux" but the code clearly uses it (imports from @jwcarman/roux-web/..., NotFoundException from org.jwcarman.roux.problems, PageDto, useSchemaForm, QueryTable).
---

# roux

roux is the base a Spring Boot + React app is built on: an opinionated accelerator for apps that are
safe, secure and easy for agents to maintain. It ships **components for what an app never changes**
(errors as Problem Details, the API client, paging, tables, forms, feedback) and leaves **plain app
code for what it will** (entities, endpoints, pages, forms). There is one way to do each thing, so
the right way is also the short way: an app imports the plumbing and writes only its features.

The stack is fixed: Java 25, Spring Boot 4.1, Maven, PostgreSQL with Liquibase, jpa-utils for paging,
who for identity, React 19, Chakra UI v3, TanStack Router, Query, Form and Table, Zod 4, Vitest with
MSW, Playwright. Every roux app uses who: `roux-spring-boot-starter` brings `who-spring-boot-starter`,
`who-email-link` and `who-passkey`, and sign-in is passwordless (emailed links with codes, and
passkeys). Never describe or build a roux app without who. The SPA and the API share one origin
(one jar by default, or edge routing); separate origins are not supported.

The `references/` folder holds roux's guides, copied from the repository for this version of the
skill. They are the source of truth. **Read the guide for the task before writing code, and quote
APIs from it, not from memory**: roux is young, its names are its own (`sendJson`, `meta.refreshes`,
`useSchemaForm`, `QueryTable`), and guesses from general React or Spring knowledge are wrong in the
details.

## Start by looking at the project

Before changing anything, find out what is there:

- **The roux version.** `roux.version` (the `roux-bom` import) in `pom.xml`, and `@jwcarman/roux-web`
  in `package.json`. The two must be the same version; if they differ, tell the user before anything
  else. The guides give the version they describe in `references/getting-started.md` (the
  `roux.version` property and the `npm install` line). If the project's roux is older than that, say
  so and name what the guides describe that it may not have, rather than mixing two versions' APIs.
  For a new app, take the versions from the guides.
- **The feature you are touching.** Java is packaged by feature, and the frontend is foldered by
  feature: `src/<feature>/` holds its resource module (`src/ranks/ranks.ts`), its pages, dialogs and
  tests. Route files under `src/routes/` stay thin (search validation, loader, `component`). Find the
  nearest existing feature and follow its shape; the guides' examples (students, ranks) are that shape.
- **What is already shared:** `src/queryKeys.ts` (every query key), the session provider, `main.tsx`
  (providers mounted once), and the test helpers under `src/testing/`.
- One Maven module per app. Don't split a feature into its own module or add configurability roux
  does not have.

## The conventions (and why)

- **Records over the wire.** Controllers take and return Java records, never entities. A record is
  named by what it is (`Student`, `StudentDetail`), a request `<Thing>Request` (`StudentRequest`),
  and a list `PageDto<Student>`. An edit's request carries the `version` it was read at, so a stale
  save is refused with a 409 instead of overwriting someone else's change.
- **Refusals are exceptions.** Throw `NotFoundException` (a subclass per resource),
  `InvariantViolationException`, `InvalidFieldException` (one field; also a uniqueness clash on
  something the user typed) or `ConflictException` from `org.jwcarman.roux.problems`, and
  `Versions.require(entity, request.version())` for a stale version (never hand-written). roux answers every one as a Problem
  Detail the browser already knows how to show. Write no `@ExceptionHandler` or
  `@RestControllerAdvice`, and return no error `ResponseEntity`: those answers would not be problems.
  Messages are shown to users verbatim, so write them for people.
- **One module per resource** in the frontend (`src/<feature>/<feature>.ts`): the request's Zod
  schema, an API object with one function per endpoint (`getJson`, `sendJson`, `path`), the queries
  (`queryOptions`) and the mutations (`mutationOptions`). Pages and forms import from it; they never
  call the API functions or `fetch` directly, because the client is what sends CSRF, turns refusals
  into `ApiError` and notices a lost session.
- **Mutations name what they refresh** in `meta.refreshes` (keys from `queryKeys`), never with
  `invalidateQueries` by hand. Use `createQueryClient()`, never `new QueryClient()`, in the app and in
  tests: `meta.refreshes` only works on roux's client.
- **Forms go through `useSchemaForm`** with a Zod schema built from roux's rule helpers (`text()`,
  `oneOf(...)` and the rest in `references/forms.md`). The helpers' messages are the server's word for
  word, so never retype a server message or write `z.string().min(1, "...")` where a helper exists.
  `useSchemaForm` validates, submits through the mutation, puts a 400's field errors under their
  fields and toasts the rest; the form catches nothing and keeps no submitting state.
- **Buttons that change data use `useServerAction`**; actions with consequences ask first with
  `useConfirm`. Outcomes are told with `notify`, never Chakra's toaster or `window.confirm`.
- **Long lists are paged by the server** (`Paginator`, `PageParams`, a sort enum whose constants match
  the column ids) and shown with `QueryTable`, its state kept in the URL with `tableSearchOf`. Never
  page, sort or filter a long list in the browser, or hand-write a pager.
  A list's key and fetch live in its resource module as `pageQuery(queryKeys..., (params, signal) => ...)`
  and the page passes it as `query={...}`: never build a list's key or call its API in the page.
- **Import roux-web only from its six subpaths**: `@jwcarman/roux-web/problem`, `/api`, `/paging`,
  `/table`, `/feedback`, `/form`. There is no root import, and anything else (roux's source, its
  internal test helpers) is not API and breaks on upgrade.
- **Sign-in, identities and permissions are who's.** Use who's own guides (its Claude Code skill, if
  installed) for them; roux only wires the session into the client (`onSessionLost`,
  `useClearQueriesOnIdentityChange`). The browser calls who (sign-in, sign-out, the person's own
  passkeys and sessions) go through `@jwcarman/who-client`, not hand-written fetches. To invite
  someone, call who's `InvitationService.invite` outside a transaction and create the app's own
  rows in a plain `@EventListener` for `IdentityInvited`; a public path is a `WhoPublicPathContributor`
  bean, never a replaced `WhoPublicPaths`; an email sender is a `WhoEmailSender` with an exhaustive
  `switch` and no `default`.

## Which guide for the task

Each guide ends with a "Don't" list; read it too. Long guides start with a short overview; read the
sections you need.

| The task | Read |
| --- | --- |
| Add roux to an app, required settings, the app root (`main.tsx`), session provider, one origin, CSP | `references/getting-started.md` |
| Refuse a request on the server: 404, a broken rule, a bad field, a 409, a stale save | `references/errors.md` (Return 404 ... Refuse a stale save) |
| What the browser shows for each refusal; `ApiError`, `problemOf` | `references/errors.md` (In the browser) |
| A resource's API functions, query params, path values, raw `Response`, CSRF, `configureApi` | `references/api-client.md` |
| A resource module, query keys, reading data in a page or a route loader, `meta.refreshes` | `references/queries-and-mutations.md` |
| A button that runs a mutation (`useServerAction`) | `references/queries-and-mutations.md` (Run a mutation from a button) |
| A create or edit form: schema and rule helpers, `FormDialog`, a form on a page, field types | `references/forms.md` |
| Add a field to an existing form (a request record field plus its schema rule and input) | `references/forms.md` (Write the schema, The fields) |
| Versions and 409 conflicts on a form, splitting a long form, a custom field | `references/forms.md` |
| A paged endpoint (sort enum, `Paginator`, `PageParams`) and its `PageDto` | `references/tables-and-paging.md` (The wire, Write a paged endpoint) |
| A list page: `QueryTable`, search and filter chips, URL state, row selection | `references/tables-and-paging.md` |
| A short list, a list that grows (`InfiniteList`), a picker over a long list (`InfiniteSelect`), an export link | `references/tables-and-paging.md` |
| A dialog in a table cell closes by itself, or a test passes alone and fails after another | `references/tables-and-paging.md` (Things to know: define columns once) |
| A valid date is refused as in the future | `references/forms.md` (`@NotInFuture`, `date().notInFuture()`) |
| A view-backed list or detail misses a row just saved | `references/tables-and-paging.md` (a read-model view: flush first) |
| Reorder rows (move up/down) | `references/tables-and-paging.md` (An ordered list) |
| One feature must refuse another's removal | `references/errors.md` (Refuse because of what another feature holds) |
| Toasts, confirmations, an inline error, not-found and error pages | `references/feedback.md` |
| Java tests (`@AppTest`, signed-in members, PostgreSQL), Vitest with MSW, form and route tests, Playwright | `references/testing.md` |

A feature usually touches several: a new resource with a list and a form reads errors, queries and
mutations, forms, tables and paging, and testing. Read each one's relevant sections before writing
that part.

## Before you finish

- Build and run the tests on both sides (`mvn verify`, and the frontend's test and type-check
  scripts in `package.json`). Add tests in the shape `references/testing.md` gives: the Java test
  asserts the Problem Details a refusal answers, and the Vitest test answers with MSW, never by
  mocking roux, who, the API module or the query client.
- Check the change against each guide's "Don't" list.
- If a guide does not cover what the task needs, say so to the user rather than inventing an API;
  roux's gaps are written in the guides, and an unlisted one is worth reporting.
