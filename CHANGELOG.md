# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-14

First release: the contracts every roux application shares, on both the Java and web sides.

### Added

- `roux-problems`: every error a Spring MVC API raises is answered as an RFC 9457 Problem Detail.
  Includes `NotFoundException`, `InvariantViolationException`, `InvalidFieldException` and
  `ConflictException` (409), field-level problems from Bean Validation, and handlers for Spring
  Security, who and paging errors. Validation messages ship as `ContributorValidationMessages`, so an
  application's own `ValidationMessages` does not hide them. Native-image runtime hints included.
- `roux-autoconfigure` and `roux-spring-boot-starter`: Spring Boot auto-configuration, with settings
  `roux.problems.enabled` and `roux.problems.api-path-prefix` (default `/api/`).
- `roux-bom`: aligns the roux modules and curates who 0.15.0 and jpa-utils 0.2.0. It does not import
  Spring Boot's BOM.
- `@jwcarman/roux-web` on npm, with subpaths `problem`, `api`, `paging`, `table`, `feedback` and
  `form` (Zod validation).
- Frozen JSON contract fixtures in `contracts/`, tested by both the Java and web sides.

### Requirements

- Java 25 and Spring Boot 4.1.
- React, Chakra UI and the TanStack libraries are peer dependencies of `@jwcarman/roux-web`.

[Unreleased]: https://github.com/jwcarman/roux/compare/0.1.0...HEAD
[0.1.0]: https://github.com/jwcarman/roux/releases/tag/0.1.0
