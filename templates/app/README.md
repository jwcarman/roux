# Roux App

A [roux](https://github.com/jwcarman/roux) app: Spring Boot 4 with roux's starter (who for sign-in,
by emailed link or passkey; no passwords), PostgreSQL through Liquibase (locked with a database
session lock, so a start that dies mid-migration leaves no stale lock), and a React SPA in `frontend/` on
`@jwcarman/roux-web` (Chakra UI v3, TanStack Router, Query, Form and Table).

It starts with no features of its own: sign-in, the first owner, the sidebar frame, Users (invite,
rename, change roles, deactivate), Settings (profile, emails, passkeys), Appearance (the owner's
theme) and a Home placeholder the first feature replaces.

## Starting a new app from this template

On GitHub, [jwcarman/roux-app-template](https://github.com/jwcarman/roux-app-template) holds this
app at each roux release: press **Use this template**, then clone your new repository. Or, without
GitHub's button:

```bash
git clone --depth 1 https://github.com/jwcarman/roux-app-template.git acme-gym
cd acme-gym && rm -rf .git && git init && git add . && git commit -m "Start from roux-app-template"
```

Then give the app its name. It is in seven places, and nothing else needs it:

| File | What to change |
|---|---|
| `pom.xml` | `<artifactId>roux-app</artifactId>` and `<name>roux-app</name>` |
| `src/main/resources/application.yml` | `spring.application.name: roux-app`, `roux.theme.app-name: "Roux App"`, `who.email.from` |
| `frontend/package.json`, `frontend/package-lock.json` | `"name": "roux-app-web"` |
| `e2e/package.json`, `e2e/package-lock.json` | `"name": "roux-app-e2e"` |
| `README.md` | the `# Roux App` title |

`git grep -n -e 'Roux App' -e 'roux-app'` finds them. `roux.theme.app-name` is what people see until
the owner renames the app on the Appearance page. The Java package is `app` in every app.

The app is just the app: its code, its tests and their configuration, with a Maven wrapper
(`./mvnw`). It carries no CI workflows; the CI is whatever your environment uses.

## Prerequisites

- **Docker**, for PostgreSQL and Mailpit (`compose.yaml` in development, Testcontainers in tests).
- **JDK 25** (GraalVM 25 for a native image).

Node and npm are downloaded by the build (`frontend-maven-plugin`); you do not need them installed.

## Running in development

```bash
./mvnw spring-boot:run -Dspring-boot.run.arguments="--roux.owner.email=you@example.com --roux.owner.name=You"
```

`spring-boot:run` turns on the `dev` profile (`application-dev.yml`), which lets the session cookie
travel over plain HTTP, and Spring Boot starts PostgreSQL and Mailpit from `compose.yaml` by itself.
The app is at <http://localhost:8080>. On first start roux makes `roux.owner.email` the `OWNER`.
Ask for a sign-in link on the sign-in page and read the email in Mailpit at <http://localhost:8025>.

If a port is taken, set `POSTGRES_PORT`, `MAILPIT_SMTP_PORT` or `MAILPIT_WEB_PORT` before starting;
`compose.yaml` and the app both read them.

For frontend work with hot reload, run `npm run dev` in `frontend/` as well: Vite serves the UI on
<http://localhost:5173> and passes `/api` and `/who` through to Spring Boot on `:8080`.

## Adding a feature

Use roux's Claude Code plugin (its `roux` skill) and read the guide for the task first:
[roux's guides](https://github.com/jwcarman/roux/tree/main/docs/guides) cover errors, the API client,
queries and mutations, forms, tables and paging, feedback, roles and testing. `CLAUDE.md` says where
each piece goes.

## Tests

```bash
./mvnw verify          # Java tests, Vitest, and the Playwright suite (E2eIT); -DskipITs skips E2eIT
```

### Native

The app builds into a native image with GraalVM 25 as `JAVA_HOME`:

```bash
./mvnw -Pnative package          # the binary, target/roux-app
./mvnw -PnativeTest test         # the Java tests, compiled and run native
./mvnw -Pnative-e2e verify       # the binary built, then the Playwright suite run against it
```

A test that cannot run native (one that mocks a static method, or starts apps of its own) carries
`@DisabledInNativeImage` and says why. When the binary is missing something it needs at runtime
(reflection, a resource, a proxy), `scripts/trace.sh` runs the suite on the JVM under GraalVM's
tracing agent (`-Pnative-trace`), which records what it used in `target/native-trace`, then runs
the native suite with that metadata (`-Pnative-e2e,traced`): if that passes, the missing hint is
in the recording.

## Production

Run the jar with `SPRING_PROFILES_ACTIVE=prod` (`application-prod.yml`) and set these variables. None
has a default, and a missing one fails startup, except `PASSKEY_RP_ID` (an unset one leaves passkeys
silently broken), so set it.

| Variable | Sets | Example |
|---|---|---|
| `APP_BASE_URL` | `app.base-url`; links and `who.passkey.allowed-origins` follow it | `https://app.example.com` |
| `APP_OWNER_EMAIL` | `roux.owner.email`, the first `OWNER` | `owner@example.com` |
| `APP_OWNER_NAME` | `roux.owner.name`, the first `OWNER`'s display name | `Olive Owner` |
| `PASSKEY_RP_ID` | `who.passkey.rp-id`: the app's own host, not derived from the base URL | `app.example.com` |
| `MAIL_FROM` | `who.email.from`, the one sending address | `mail@example.com` |
| `WHO_CODE_SECRET` | `who.email-link.code-secret`, the key for typed sign-in codes; at least 32 characters, from `openssl rand -base64 32` | |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` | `spring.mail.*` (SMTP with STARTTLS required) | `smtp.example.com`, `587` |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | the PostgreSQL database | |

The session cookie is `Secure`, `HttpOnly` and `SameSite=Lax` in every profile but `dev`, so serve
the app over HTTPS. Rate-limit the sign-in endpoints and cap request sizes at the ingress.

Sessions live in PostgreSQL (Spring Session JDBC, tables from `db/changelog/spring-session.xml`), so
a signed-in browser stays signed in across restarts and any instance can serve it. A session ends
after 30 minutes without a request (`server.servlet.session.timeout`).
