# roux

roux is said "roo". It is the base a Spring Boot application is built on: curated libraries, and
the plumbing every such application needs, written once with contracts that keep it honest.

## Modules

- `runtime/roux-problems`: answers every error a Spring MVC API raises as an
  [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Detail. Settings live under
  `roux.problems` (`enabled`, `api-path-prefix`).

## Building

```
./mvnw verify          # tests, with 100% line and branch coverage
./mvnw -Ppit verify    # mutation testing; any surviving mutant fails the build
```

Java 25 and Spring Boot 4.1. Licensed under the [Apache License 2.0](LICENSE).
