# roux

roux is said "roo". It is the base a Spring Boot application is built on: curated libraries, and
the plumbing every such application needs, written once with contracts that keep it honest.

## Modules

Java, published to Maven Central under `org.jwcarman.roux`:

- `runtime/roux-problems`: answers every error a Spring MVC API raises as an
  [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Detail. Settings live under
  `roux.problems` (`enabled`, `api-path-prefix`).
- `runtime/roux-validation`: `@Phone`, `@NotInFuture` and roux's readable validation messages
  (every bundle of that name on the class path is merged by Hibernate Validator).
- `runtime/roux-spa`: serves a single-page app's shell for any page URL (`roux.spa.excluded-paths`).
- `runtime/roux-jpa`: `Versions.require`, the stale-version check for JPA entities.
- `runtime/roux-autoconfigure`: the Spring Boot auto-configuration for every module above. Each
  feature switches on when its jar is on the class path.
- `runtime/roux-spring-boot-starter`: the one dependency an application adds (no code of its own).
- `runtime/roux-bom`: aligns the versions of the modules above.
- `runtime/roux-contract-tests`: tests that hold the Java and web sides to the same contracts. Never published.

Web, published to npm as `@jwcarman/roux-web` (`web/roux-web`), with one subpath per concern:
`problem`, `api`, `paging`, `table`, `feedback` and `form`.

## Using roux

Every roux app is a Spring Boot app with a React SPA on one origin, who for sign-in, and PostgreSQL.
The guides in [`docs/guides/`](docs/guides/README.md) say how to build one, one concern each:

- [Getting started](docs/guides/getting-started.md): the Maven and npm dependencies, who's required
  settings, the app root, one origin.
- [Errors](docs/guides/errors.md): throwing errors on the server as Problem Details, and showing them
  in the browser.
- [API client](docs/guides/api-client.md): one typed API module per resource.
- [Queries and mutations](docs/guides/queries-and-mutations.md): `createQueryClient`, query keys,
  `meta.refreshes`, `useServerAction`.
- [Forms](docs/guides/forms.md): Zod schemas in the server's words, `useSchemaForm`, fields,
  `FormDialog`, versions and 409.
- [Tables and paging](docs/guides/tables-and-paging.md): paged endpoints with jpa-utils, `QueryTable`,
  search and filters in the URL, infinite lists and selects.
- [Feedback](docs/guides/feedback.md): toasts, confirmations, error and not-found pages.
- [Testing](docs/guides/testing.md): Java tests on real who and PostgreSQL, Vitest with MSW,
  Playwright.

The guides are also the references of roux's Claude Code plugin (`plugins/roux`), so an agent
building a roux app reads the same pages.

## Building

```
./mvnw verify          # tests, with 100% line and branch coverage
./mvnw -Ppit verify    # mutation testing; any surviving mutant fails the build
```

Mutation testing is incremental: PIT and Stryker keep each mutant's result in `.mutation-history/`
(git-ignored) and re-test only what changed. Delete that folder for a full run. In CI the
`Mutation` workflow caches it between runs, and runs in full twice a month.

For the web package, run in `web/` with `-w @jwcarman/roux-web` (after `npm ci` there and in `web/lint-tools`): `npm run format:check`,
`lint`, `typecheck`, `coverage`, `build`, and `npm run mutate` for mutation testing.

Native (GraalVM) builds and tests never run on GitHub. They run on a Linux build host over ssh:
`NATIVE_HOST=<ssh host> NATIVE_JAVA_HOME=<GraalVM home on the host> scripts/native-remote.sh` sends the
committed HEAD as a git bundle and runs the template's `-PnativeTest` and `-Pnative-e2e` there.

Java 25 and Spring Boot 4.1. Licensed under the [Apache License 2.0](LICENSE).

## Releasing

Creating a GitHub Release triggers `.github/workflows/release.yml`; the release tag is the version. It publishes
`@jwcarman/roux-web` to npm first, then the Java modules to Maven Central only if npm succeeded. If the Central job
fails, use "Re-run failed jobs" rather than re-running everything: npm will not accept the same version twice.

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so there is no npm token
secret. On npmjs.com, `@jwcarman/roux-web` → Settings → Trusted publishing names GitHub user `jwcarman`, repository
`roux` and workflow `release.yml`; renaming the workflow file breaks publishing until that entry is updated. Provenance
is generated automatically.

A maintainer needs these repository secrets:

- `CENTRAL_TOKEN_USERNAME` and `CENTRAL_TOKEN_PASSWORD`: the Sonatype Central Portal user token.
- `GPG_SIGNING_KEY` and `GPG_SIGNING_KEY_PASSWORD`: the armored private key that signs the Java artifacts, and its passphrase.
