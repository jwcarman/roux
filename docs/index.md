---
hide:
  - navigation
  - toc
---

<div class="jw-hero" markdown>

# ![](assets/favicon.svg){ .roux-hero__mark } roux

<p class="jw-hero__tagline">The base a Go + React application is built on.</p>

Go 1.27 · PostgreSQL 17 · React 19 · Chakra UI v3 · TanStack

<p class="jw-hero__actions">
  <a class="md-button md-button--primary" href="guides/getting-started/">Get started</a>
  <a class="md-button" href="https://github.com/jwcarman/roux">View on GitHub</a>
</p>

</div>

**roux is written for agents.** It is designed for a coding agent to get right the first time: one
way to do each thing, exact names that match across Go, TypeScript and these docs, mistakes that
fail loudly instead of silently, and an [Agent Skill](agent-skill.md) that carries all of it into
the agent's context. Every example here is code CI builds.

roux is what every business app needs before its first feature: people who sign in, roles and
permissions, a team to invite, errors a person can read, paged lists, forms, money and dates. A new
app starts from roux's template with all of it working; each feature the app adds is a Go package
and a folder of pages, and uses roux by importing from it.

```go
func Register(k *app.Kit, svc Service) {
	k.Handle("GET /api/labels", LabelsRead, func(w http.ResponseWriter, r *http.Request) error {
		out, err := svc.List(r.Context())
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, out)
	})
}
```

The route is behind the CSRF check, a sign-in and the `labels.read` permission before the handler
runs; anything the handler refuses is answered as a Problem Detail the browser's forms show under
the right field.

## What you get

<div class="grid cards" markdown>

-   **Sign-in, done**

    ---

    Emailed links and codes, passkeys, Google, GitHub or any OpenID Connect provider, API keys and
    JWTs, all resolving to one person, with sessions, CSRF and a first owner.

-   **Permissions, not roles**

    ---

    Routes check permissions; roles are data, granted by migrations. The browser's list of
    permissions is generated from the server's, and a test checks every grant.

-   **The team**

    ---

    Invite people, give them a role, rename, deactivate, sign them out everywhere, with a history
    of every change.

-   **Lists and forms**

    ---

    A paginator over a view on the server; tables, growing lists and pickers in the browser. Forms
    validated in the server's own words, with versions that refuse a stale save.

-   **Money and dates**

    ---

    Amounts in minor units, never floats. The organization's zone and today, the same on the
    server and in the browser.

-   **One binary**

    ---

    The front end built into the server; one distroless container image; health probes,
    OpenTelemetry and a graceful shutdown.

</div>

## How an app is put together

- **`cmd/server/main.go`** is one call, `app.Main`, naming the app, its built front end and its
  modules.
- **`cmd/server/modules.go`** lists the modules: roux's (sign-in, users, passkeys...) and the
  app's own. Turning a feature on is a line.
- **`internal/<feature>/`** is one feature's server side: its SQL migrations, a domain service over
  pgx, and its typed queries and commands, each behind a permission ([A feature](guides/features.md)).
- **`frontend/src/<feature>/`** is its screens: surfaces drawn from roux's catalog and bound to those
  queries and commands ([Surfaces](guides/surfaces.md)).

Start with [Getting started](guides/getting-started.md).
