# Entities and tables

A feature's data is a JPA entity over a table that the feature's own Liquibase changelog creates.
jpa-utils' `AuditableEntity` gives every entity its id, its version and four audit columns; the
entity declares only its own fields. Hibernate does not create or change tables
(`spring.jpa.hibernate.ddl-auto: validate`): at startup it checks the entity against the table, so
the changelog and the entity must agree column for column, and a mismatch fails every test that
starts the app.

This guide is the server side of a feature, from the table to the endpoint. The browser side is
[API client](api-client.md), [Queries and mutations](queries-and-mutations.md), [Forms](forms.md)
and [Tables and paging](tables-and-paging.md).

## The files

For a feature `ranks` in the app's package `app.ranks` (the template's packages are `app.<feature>`):

| File | What it is |
| --- | --- |
| `src/main/resources/db/changelog/ranks.xml` | The table, in the feature's own changelog |
| `src/main/resources/db/changelog/db.changelog-master.xml` | One more `<include>`, for `ranks.xml` |
| `RankEntity.java` | The entity (`extends AuditableEntity`) |
| `RankRepository.java` | `JpaRepository<RankEntity, UUID>` |
| `Rank.java` | The record the API answers (`Rank.of(entity)`) |
| `RankRequest.java` | The record a create or an edit sends, with Bean Validation and `version` |
| `RankNotFoundException.java` | The 404 (`extends NotFoundException`) |
| `RankService.java` | `@Service @Transactional`: the rules, the refusals |
| `RanksController.java` | `/api/ranks`, every method behind `@RequiresPermission` |
| `app.identity.Permissions`, `db/changelog/roles.xml` | The feature's permissions and their grants ([Roles](roles.md)) |
| `src/test/java/app/ranks/RanksControllerTest.java` | `@AppTest`, one test per refusal ([Testing](testing.md)) |

## The table

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        https://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

  <!-- The school's ranks. Names are unique ignoring case. -->
  <changeSet id="rank" author="app">
    <createTable tableName="rank">
      <column name="id" type="uuid"><constraints primaryKey="true" nullable="false"/></column>
      <column name="version" type="bigint"><constraints nullable="false"/></column>
      <column name="name" type="varchar(40)"><constraints nullable="false"/></column>
      <column name="colour" type="varchar(16)"><constraints nullable="false"/></column>
      <column name="created_date" type="timestamptz"/>
      <column name="modified_date" type="timestamptz"/>
      <column name="created_by" type="varchar(64)"/>
      <column name="modified_by" type="varchar(64)"/>
    </createTable>
    <sql>create unique index rank_name_key on rank (lower(name))</sql>
  </changeSet>
</databaseChangeLog>
```

and in `db.changelog-master.xml`, after the includes already there:

```xml
<include file="classpath:db/changelog/ranks.xml"/>
```

- **Every table of an `AuditableEntity` has these six columns**, with these names and types: `id
  uuid` (the primary key), `version bigint not null`, `created_date timestamptz`, `modified_date
  timestamptz`, `created_by varchar(64)`, `modified_by varchar(64)`. Then the entity's own fields.
- **Column names are the fields' names in snake case** (`startsOn` is `starts_on`, `rankId` is
  `rank_id`): Spring Boot's naming strategy, no `@Column` needed.
- **Column types are the ones Hibernate's validation expects** for each Java type:

  | Field | Column |
  | --- | --- |
  | `String` | `varchar(n)`, `n` the field's maximum (`MAX_NAME`) |
  | an enum, `@Enumerated(EnumType.STRING)` | `varchar(n)`, `n` at least its longest constant |
  | `int`, `Integer` | `int` |
  | `long`, `Long` | `bigint` |
  | `boolean`, `Boolean` | `boolean` |
  | `UUID` (another row's id) | `uuid` |
  | `LocalDate` | `date` |
  | `LocalTime` | `time` |
  | `Instant` | `timestamptz` |
  | `Money` | two columns; see [Money](money.md) |

  A required field is `nullable="false"`; an optional one leaves the constraint out.
- **Unique ignoring case** is a unique index on `lower(...)`, named (`rank_name_key`): the service
  checks first (below), and the index guards the race the check cannot see.
- **A reference to another row** is a `uuid` column with a foreign key:
  `<column name="rank_id" type="uuid"><constraints nullable="false" foreignKeyName="student_rank_fk"
  references="rank(id)"/></column>`. A feature that must refuse a removal another feature's rows
  prevent says why before the foreign key does ([Errors](errors.md#refuse-because-of-what-another-feature-holds)).
- **One changelog per feature**, included from the master. **Never edit a changeset that has run**
  (its checksum is recorded, and every existing database refuses to start): a later change is a
  new changeset in the same file, such as `<addColumn tableName="rank">` for a new field.
- The feature's permissions are granted in a new changeset in `roles.xml`, not here
  ([Roles](roles.md#the-apps-roles)).

## The entity

```java
package app.ranks;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A rank a student can hold. */
@Entity
@Table(name = "rank")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RankEntity extends AuditableEntity {

  /** The longest name, in characters. */
  public static final int MAX_NAME = 40;

  private String name;

  @Enumerated(EnumType.STRING)
  private BeltColour colour;

  public RankEntity(String name, BeltColour colour) {
    this.name = name.strip();
    this.colour = colour;
  }

  /** Renames and recolours the rank. */
  public void change(String name, BeltColour colour) {
    this.name = name.strip();
    this.colour = colour;
  }
}
```

- **Extend `AuditableEntity`** (`org.jwcarman.jpa.spring.audit`, jpa-utils, in roux's starter).
  It declares `id` (a `UUID`, a time-ordered UUIDv7 assigned when the entity is constructed, so
  it is known before the save), `version` (`Long`, JPA's `@Version`, which `Versions.require`
  checks) and `createdDate`, `modifiedDate` (`Instant`), `createdBy`, `modifiedBy` (`String`), each
  with its getter; `equals` and `hashCode` go by `id`. Declare none of them again. The audit
  columns are filled in by roux once the app has `@EnableJpaAuditing`, which the template's
  `app.persistence.PersistenceConfig` already carries
  ([Getting started](getting-started.md#things-to-know)). A table with no audit columns extends
  `org.jwcarman.jpa.entity.BaseEntity` (only `id` and `version`) instead.
- **`@Table(name = "rank")`**: without it the table's name comes from the class, `rank_entity`.
- **`@Enumerated(EnumType.STRING)` on every enum.** The default stores its ordinal, which breaks
  when a constant is added in the middle.
- **A protected no-argument constructor for JPA** (`@NoArgsConstructor(access = AccessLevel.PROTECTED)`),
  a public one that takes the fields, and methods that change it by what they mean (`change`,
  `deactivate`); no setters. Getters with Lombok's `@Getter` (the template has Lombok).
- **The limits are constants on the entity** (`MAX_NAME`), used by the request's `@Size`, so the
  column, the server's rule and the browser's `text().max(40)` say one number.
- A text field a list's search looks in carries `@Searchable` and the repository is a
  `SearchableRepository` ([Tables and paging](tables-and-paging.md#write-a-paged-endpoint)).

## The repository

```java
package app.ranks;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** The school's ranks. */
public interface RankRepository extends JpaRepository<RankEntity, UUID> {

  /** Every rank, by name. */
  List<RankEntity> findAllByOrderByNameAsc();

  /** The rank named {@code name}, ignoring case. */
  Optional<RankEntity> findByNameIgnoreCase(String name);
}
```

A list that is paged by the server extends `SearchableRepository<RankEntity, UUID>`
(`org.jwcarman.jpa.spring.search`) instead, for `searchFor(term)` and `findAll(specification,
pageable)`.

## The records

The API takes and answers records, never the entity:

```java
/** A rank as the API answers it. */
public record Rank(UUID id, String name, BeltColour colour, long version) {
  /** The rank {@code entity} holds. */
  public static Rank of(RankEntity entity) {
    return new Rank(entity.getId(), entity.getName(), entity.getColour(), entity.getVersion());
  }
}

/** A new rank, or new values for one. {@code version} is the version being edited; a create sends none. */
public record RankRequest(
    @NotBlank @Size(max = RankEntity.MAX_NAME) String name, @NotNull BeltColour colour, Long version) {}
```

- The answer carries `version`, so the browser can send it back with an edit.
- The request's annotations are the rules, and roux's messages are their words (`Must not be
  blank`, `Must be between 0 and 40 characters`): write no `message =`. The browser's schema
  mirrors them ([Forms](forms.md#write-the-schema)). A rule between two fields is `@After` on the
  record ([Forms](forms.md#one-field-after-another)).
- `version` is a nullable `Long` with no annotation, the same record serving create and edit.

## The service

```java
package app.ranks;

import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RankService {

  private static final String NAME_TAKEN = "Another rank has this name";

  private final RankRepository ranks;

  public RankService(RankRepository ranks) {
    this.ranks = ranks;
  }

  @Transactional(readOnly = true)
  public List<Rank> list() {
    return ranks.findAllByOrderByNameAsc().stream().map(Rank::of).toList();
  }

  @Transactional(readOnly = true)
  public Rank get(UUID id) {
    return Rank.of(find(id));
  }

  public Rank create(RankRequest request) {
    requireUniqueName(request.name(), null);
    return Rank.of(ranks.saveAndFlush(new RankEntity(request.name(), request.colour())));
  }

  public Rank update(UUID id, RankRequest request) {
    RankEntity rank = find(id);
    // First, before anything changes: a stale version is a 409.
    Versions.require(rank, request.version());
    requireUniqueName(request.name(), id);
    rank.change(request.name(), request.colour());
    return Rank.of(ranks.saveAndFlush(rank));
  }

  public void remove(UUID id) {
    ranks.delete(find(id));
  }

  private RankEntity find(UUID id) {
    return ranks.findById(id).orElseThrow(() -> new RankNotFoundException(id));
  }

  private void requireUniqueName(String name, UUID self) {
    ranks
        .findByNameIgnoreCase(name.strip())
        .filter(other -> !other.getId().equals(self))
        .ifPresent(
            other -> {
              throw new InvalidFieldException("name", NAME_TAKEN);
            });
  }
}
```

- `@Transactional` on the class; `readOnly = true` on the reads.
- **A uniqueness clash on what the user typed is an `InvalidFieldException` on that field**, so
  the form shows it under the field, checked before the save. The unique index stays as the
  database's guard: two saves at once that both pass the check break it, and roux answers that
  `409` (`This conflicts with existing data`). Don't catch `DataIntegrityViolationException` to
  turn that race into the field error: no test can make two saves race, so the catch is code the
  app's 100% coverage rule refuses.
- `saveAndFlush`, so the answer carries the version the save gave the row.
- **An edit calls `Versions.require(entity, request.version())` first.** Never compare versions
  by hand ([Errors](errors.md#refuse-a-stale-save-optimistic-locking)).
- A missing row is the feature's `NotFoundException` subclass, `super("No rank %s", id)`; every
  other refusal is one of roux's exceptions ([Errors](errors.md)). No `@ExceptionHandler`.
- Time comes from the injected `Clock`, today from `OrganizationCalendar` ([Dates and time](dates-and-time.md)).
- A change worth a history is recorded with `ActivityLog` in the same transaction ([The activity log](activity-log.md)).

## The controller

```java
package app.ranks;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import app.identity.Permissions;

@RestController
@RequestMapping("/api/ranks")
public class RanksController {

  private final RankService ranks;

  public RanksController(RankService ranks) {
    this.ranks = ranks;
  }

  @GetMapping
  @RequiresPermission(Permissions.RANKS_READ)
  public List<Rank> list() {
    return ranks.list();
  }

  @GetMapping("/{id}")
  @RequiresPermission(Permissions.RANKS_READ)
  public Rank get(@PathVariable UUID id) {
    return ranks.get(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public Rank create(@Valid @RequestBody RankRequest request) {
    return ranks.create(request);
  }

  @PutMapping("/{id}")
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public Rank update(@PathVariable UUID id, @Valid @RequestBody RankRequest request) {
    return ranks.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public void remove(@PathVariable UUID id) {
    ranks.remove(id);
  }
}
```

- **Every method carries `@RequiresPermission`** (`org.jwcarman.who.spring.security`) with a
  permission, never a role: a caller without it gets `403`, a signed-out one `401`. Reading and
  changing are usually two permissions (`ranks.read`, `ranks.manage`); "only the owner" is a
  permission granted to `OWNER` alone ([Roles](roles.md#the-apps-permissions)).
- Under `/api/`; a create answers `201` with the record, a removal `204`, an edit `200`.
- `@Valid @RequestBody` on every body. A long list answers a page instead of a `List`
  ([Tables and paging](tables-and-paging.md#write-a-paged-endpoint)).

## Check it

- `./mvnw test-compile` compiles it. The Java tests need Docker (PostgreSQL in Testcontainers).
- Every `@AppTest` starts the app, which runs the changelog and then Hibernate's validation. A
  table that does not match its entity fails them all at startup with `Schema-validation: missing
  column [starts_on] in table [event]` or `wrong column type encountered in column [name]`: fix the
  changelog (a new changeset if the old one has run anywhere) or the entity, not the setting.
- The controller test asserts each refusal's status and words ([Testing](testing.md#a-controller-test)).

## Don't

- Don't declare `id`, `version` or the audit fields; `AuditableEntity` has them.
- Don't change `ddl-auto` or let Hibernate create tables; write the changeset.
- Don't edit a changeset that has run; add one.
- Don't return or accept an entity in a controller; map it to a record.
- Don't add setters; give the entity methods named for what they do.
- Don't catch `DataIntegrityViolationException`: roux answers it `409`.
