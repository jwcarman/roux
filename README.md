# roux

roux is said "roo". It is the base a Spring Boot application is built on: curated libraries, and
the plumbing every such application needs, written once with contracts that keep it honest.

## Modules

Java, published to Maven Central under `org.jwcarman.roux`:

- `runtime/roux-problems`: answers every error a Spring MVC API raises as an
  [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Detail. Settings live under
  `roux.problems` (`enabled`, `api-path-prefix`).
- `runtime/roux-autoconfigure`: the Spring Boot auto-configuration for roux.
- `runtime/roux-spring-boot-starter`: the one dependency an application adds (no code of its own).
- `runtime/roux-bom`: aligns the versions of the modules above.
- `runtime/roux-contract-tests`: tests that hold the Java and web sides to the same contracts. Never published.

Web, published to npm as `@jwcarman/roux-web` (`web/roux-web`), with one subpath per concern:
`problem`, `api`, `paging`, `table`, `feedback` and `form`.

## Using roux

In Maven, import the BOM and depend on the starter:

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.jwcarman.roux</groupId>
      <artifactId>roux-bom</artifactId>
      <version>${roux.version}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<dependency>
  <groupId>org.jwcarman.roux</groupId>
  <artifactId>roux-spring-boot-starter</artifactId>
</dependency>
```

In the web app:

```
npm install @jwcarman/roux-web
```

```ts
import { ... } from "@jwcarman/roux-web/problem";
```

The React, Chakra UI and TanStack libraries are peer dependencies; the app supplies them.

## Building

```
./mvnw verify          # tests, with 100% line and branch coverage
./mvnw -Ppit verify    # mutation testing; any surviving mutant fails the build
```

For the web package, run in `web/` with `-w @jwcarman/roux-web` (after `npm ci` there and in `web/lint-tools`): `npm run format:check`,
`lint`, `typecheck`, `coverage`, `build`, and `npm run mutate` for mutation testing.

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
