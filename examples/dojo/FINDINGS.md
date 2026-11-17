# Findings

What building the dojo showed about roux: one entry per finding, in the order found.

## The README taught a superseded form API
- Where: `examples/dojo/README.md` (Forms and Feedback) and `CLAUDE.md`, copied from the template
- What was clunky: the README described forms built with `useAppForm`, validators written by hand
  and `showProblem`, and `FormDialog` holding a `useAppForm` form. roux-web has no `showProblem`,
  and the dojo's forms (`InviteForm`, `ProfileForm`) use `useSchemaForm` with roux's rule helpers.
  An agent reading the README would have learned the old way.
- roux could: describe its forms in the app's docs by pointing at roux's guides (Forms, Feedback)
  rather than re-explaining them, so an app's docs cannot drift from the API.
- Outcome: fixed in bae446d

## NotFoundException took no format pattern
- Where: `ranks/RankNotFoundException`
- What was clunky: its three siblings take `(pattern, args...)`; `NotFoundException` took only a
  finished message, so the first rank code guessed the pattern form and did not compile.
- roux could: give it the same constructor.
- Outcome: fixed in 54ca14b.

## SimpleQueryTable takes a key and a function, not the module's query
- Where: `ranks/RanksPage.tsx`
- What was clunky: the resource module already has `ranksQuery` (`queryOptions`), but
  `SimpleQueryTable` wants `queryKey` and `query: () => Promise<T[]>`, so the page calls
  `ranksApi.list()` itself, which the skill and queries guide say a component never does, and the
  fetch loses its abort signal. The tables guide's own example does the same. `QueryTable`, `InfiniteList` and `InfiniteSelect` had the same
  shape, each slightly different.
- roux could: accept the query's options (`query={ranksQuery}`), as `useQuery` does.
- Outcome: fixed in 37cfe22.

## A client route is written in three places
- Where: `routes/_signedIn/ranks.tsx`, `SpaController.ROUTES`, `who.security.public-paths`
- What was clunky: a new page needs its route file, the server's SPA route list and who's public
  paths, or a signed-out reload of `/ranks` gets a 401. SpaRoutingTest catches a missing public
  path, but only after the fact.
- roux could: serve the shell for any GET that accepts HTML and is not under `/api` or `/who`
  (a `roux-spa` module), so the route file is the only place.
- Outcome: deferred (the roux-spa proposal at the end of round 1).

## The guides have no ordered list
- Where: `ranks/` (move up, move down, positions)
- What was clunky: the guides' rank example has no order; reordering (an endpoint per move that
  answers the new list, disabling the buttons at the ends, closing the gap on removal) was worked
  out from scratch.
- roux could: a short "An ordered list" section in tables-and-paging.md, with the ranks as the
  example.
- Outcome: deferred (guide work at the end of round 1, from the code as built).

## The app's test helpers are the app's to keep
- Where: `src/testing/route.tsx` (no `Toaster`, unlike `main.tsx`), `src/testing/problems.ts`
- What was clunky: the route harness left out the toaster the app mounts, so a toast from a page
  could not be asserted; and every app hand-writes Problem Detail fixtures that mirror roux's
  answers.
- roux could: ship the problem fixtures (and a route harness) for tests, e.g. a test entry point.
- Outcome: route harness fixed in the app (this commit); fixtures deferred (a roux-test proposal).
