# Add a feature: the recipe

A new resource end to end: table, entity, API, permission, resource module, page, form, tests,
checks. The example is `ranks` (a name and a belt colour) in an app whose package is `app`; replace
`rank`/`Rank`/`ranks` with the feature's names throughout.

## First: find the nearest feature

In a grown app, open the existing feature most like the new one (same list type, same kind of form)
and copy its files' shape: its package, folder, file names, imports and tests. Use this recipe for
the order, the exact roux names and the checks. In a new app there is none: follow the recipe as
written (`frontend/src/users/` shows the frontend shape).

## Rules

- Records over the wire, never entities. `Rank` answers, `RankRequest` is sent, and both carry
  `version`.
- Refusals are exceptions from `org.jwcarman.roux.problems`; no `@ExceptionHandler`, no error
  `ResponseEntity`. Messages are shown verbatim: write them for people.
- Every endpoint has `@RequiresPermission(Permissions.X)`: a permission, never a role.
- The browser's rules come from roux's helpers (`text()`, `oneOf()`...), never `z.string().min(1, "...")`.
- Pages never call the API or `fetch`; they use the module's queries and mutations.
- A mutation names what it changes in `meta.refreshes`; never `invalidateQueries`.
- Query keys only from `src/queryKeys.ts`.
- Import roux-web only from its subpaths (`@jwcarman/roux-web/api`, `/form`, `/table`, ...).
- Never edit a Liquibase changeset that has run; add one. Never hand-edit `permissions.gen.ts` or
  `routeTree.gen.ts`.
- Time comes from the injected `Clock`; today from `OrganizationCalendar` (see `dates.md`).

## Steps

### 1. The table: `src/main/resources/db/changelog/ranks.xml`

```xml
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
```

Wrap it in `<databaseChangeLog>` (copy the header of an existing changelog) and add
`<include file="classpath:db/changelog/ranks.xml"/>` at the end of `db.changelog-master.xml`.

- The six `AuditableEntity` columns above, always, with those names and types.
- Columns are the fields in snake case (`startsOn` → `starts_on`). Types: `String` → `varchar(n)`;
  enum → `varchar(n)`; `int` → `int`; `long` → `bigint`; `boolean` → `boolean`; `UUID` → `uuid`;
  `LocalDate` → `date`; `LocalTime` → `time`; `Instant` → `timestamptz`; `Money` → see `money.md`.
- Required → `nullable="false"`. Another row → `uuid` with
  `foreignKeyName="student_rank_fk" references="rank(id)"`.
- A table name that is a SQL word (`event`, `order`, `user`) is fine quoted by Liquibase, but
  prefer the feature's name as is; the entity's `@Table(name = ...)` must match it exactly.

### 2. The entity: `app/ranks/RankEntity.java`, and its enum

```java
package app.ranks;

/** A rank's belt colour; the constants are the browser's BELT_COLOURS. */
public enum BeltColour {
  WHITE, YELLOW, ORANGE, GREEN, BLUE, BROWN, BLACK
}
```

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

@Entity
@Table(name = "rank")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RankEntity extends AuditableEntity {

  public static final int MAX_NAME = 40;

  private String name;

  @Enumerated(EnumType.STRING)
  private BeltColour colour;

  public RankEntity(String name, BeltColour colour) {
    this.name = name.strip();
    this.colour = colour;
  }

  public void change(String name, BeltColour colour) {
    this.name = name.strip();
    this.colour = colour;
  }
}
```

- `AuditableEntity` is `org.jwcarman.jpa.spring.audit.AuditableEntity`: it has `id` (UUID, set on
  construction), `version`, and the audit fields. Declare none of them.
- `@Enumerated(EnumType.STRING)` on every enum. No setters; methods named for what they do.
- Limits are constants (`MAX_NAME`) used by the request's `@Size`.
- Hibernate validates the entity against the table at startup (`ddl-auto: validate`); a mismatch
  fails every `@AppTest` with `Schema-validation: missing column [...]`.

### 3. Repository, records, not-found

One file each. Imports: `java.util.List`, `java.util.Optional`, `java.util.UUID`,
`org.springframework.data.jpa.repository.JpaRepository`, `jakarta.validation.constraints.NotBlank`,
`NotNull`, `Size`, `org.jwcarman.roux.problems.NotFoundException`. No star imports.

```java
public interface RankRepository extends JpaRepository<RankEntity, UUID> {
  List<RankEntity> findAllByOrderByNameAsc();
  Optional<RankEntity> findByNameIgnoreCase(String name);
}

public record Rank(UUID id, String name, BeltColour colour, long version) {
  public static Rank of(RankEntity entity) {
    return new Rank(entity.getId(), entity.getName(), entity.getColour(), entity.getVersion());
  }
}

public record RankRequest(
    @NotBlank @Size(max = RankEntity.MAX_NAME) String name, @NotNull BeltColour colour, Long version) {}

public class RankNotFoundException extends NotFoundException {
  public RankNotFoundException(UUID id) {
    super("No rank %s", id);
  }
}
```

- Write no `message =` on the annotations: roux's messages (`Must not be blank`,
  `Must be between 0 and 40 characters`) are the ones the browser's helpers show.
- `version` is a nullable `Long` with no annotation: one record for create and edit.
- A rule between two fields is `@After(field = "endsOn", other = "startsOn")` on the record
  (`org.jwcarman.roux.validation.After`), never a service check: see `forms.md`. Equal is not after:
  an event that ends the day it starts is refused.
- A long list's repository extends `SearchableRepository<RankEntity, UUID>` instead: see "A long
  list" below.

### 4. The service: `app/ranks/RankService.java`

```java
import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RankService {

  private final RankRepository ranks;

  public RankService(RankRepository ranks) {
    this.ranks = ranks;
  }

  @Transactional(readOnly = true)
  public List<Rank> list() {
    return ranks.findAllByOrderByNameAsc().stream().map(Rank::of).toList();
  }

  public Rank create(RankRequest request) {
    requireUniqueName(request.name(), null);
    return Rank.of(ranks.saveAndFlush(new RankEntity(request.name(), request.colour())));
  }

  public Rank update(UUID id, RankRequest request) {
    RankEntity rank = find(id);
    Versions.require(rank, request.version()); // first: a stale version is a 409
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
    ranks.findByNameIgnoreCase(name.strip())
        .filter(other -> !other.getId().equals(self))
        .ifPresent(other -> {
          throw new InvalidFieldException("name", "Another rank has this name");
        });
  }
}
```

- `Versions` is `org.jwcarman.roux.jpa.Versions`; `InvalidFieldException` is
  `org.jwcarman.roux.problems.InvalidFieldException`. Other refusals: `errors.md`.
- `saveAndFlush`, so the answer carries the new `version`.
- Don't catch `DataIntegrityViolationException`: roux answers the race 409.

### 5. The controller and its permission

```java
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

`RequiresPermission` is `org.jwcarman.who.spring.security.RequiresPermission`. Without the
permission a caller gets 403, signed out 401.

The permission, in three places:

1. `app/identity/Permissions.java`: `public static final String RANKS_READ = "ranks.read";` and
   `RANKS_MANAGE = "ranks.manage"`. A new app has no `Permissions` class yet: create it
   (`public final class`, private constructor) and add `Permissions.class` to
   `PermissionClasses.ALL` in `src/test/java/app/identity/PermissionClasses.java`.
2. A **new** changeset in `db/changelog/roles.xml` granting it ("only the owner" = granted to
   `OWNER` alone):

   ```xml
   <changeSet id="ranks-permissions" author="app">
     <sql>
       INSERT INTO who_role_permission (role_id, permission)
         SELECT r.id, p.permission FROM who_role r
         CROSS JOIN (VALUES ('ranks.read'), ('ranks.manage')) AS p(permission)
         WHERE r.name = 'OWNER'
         ON CONFLICT DO NOTHING;
     </sql>
   </changeSet>
   ```
3. `frontend/src/permissions.gen.ts`, written by a test, never by hand:
   `./mvnw test -Dskip.npm -Dtest=PermissionsListTest`. The first run rewrites the file and fails;
   run it again until it passes. No Docker needed.

`PermissionsTest` (which checks the grants against the constants) needs Docker, so without it
check by hand: every constant is granted to `OWNER` in `roles.xml`, and every grant names a constant.

### 6. Query keys: `frontend/src/queryKeys.ts`

```ts
ranks: {
  all: ["ranks"] as const,
  lists: () => [...queryKeys.ranks.all, "list"] as const,
  detail: (id: string) => [...queryKeys.ranks.all, "detail", id] as const,
},
```

### 7. The resource module: `frontend/src/ranks/ranks.ts`

```ts
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

export const BELT_COLOURS = ["WHITE", "YELLOW", "ORANGE", "GREEN", "BLUE", "BROWN", "BLACK"] as const;
export type BeltColour = (typeof BELT_COLOURS)[number];

export interface Rank {
  id: string;
  name: string;
  colour: BeltColour;
  version: number;
}

/** RankRequest's rules, without the version. */
export const rankRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(BELT_COLOURS),
});
export type RankRequest = z.output<typeof rankRequestSchema>;

export const ranksApi = {
  list: (signal?: AbortSignal) => getJson<Rank[]>("ranks", { signal }),
  create: (request: RankRequest) => sendJson<Rank>("POST", "ranks", request),
  update: (id: string, request: RankRequest & { version: number }) =>
    sendJson<Rank>("PUT", path`ranks/${id}`, request),
  remove: (id: string) => sendJson<void>("DELETE", path`ranks/${id}`),
};

export const ranksQuery = queryOptions({
  queryKey: queryKeys.ranks.lists(),
  queryFn: ({ signal }) => ranksApi.list(signal),
});

export const createRank = mutationOptions({
  mutationFn: (request: RankRequest) => ranksApi.create(request),
  meta: { refreshes: [queryKeys.ranks.lists()] },
});

export const updateRank = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: RankRequest) => ranksApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.ranks.detail(id), queryKeys.ranks.lists()] },
  });

export const removeRank = mutationOptions({
  mutationFn: (id: string) => ranksApi.remove(id),
  meta: { refreshes: [queryKeys.ranks.lists()] },
});
```

- Paths are relative to `/api/` (`"ranks"`, ``path`ranks/${id}` ``). `path` encodes the values.
- Helpers mirror the annotations: `text()` ↔ `@NotBlank`, `.max(n)` ↔ `@Size(max = n)`,
  `oneOf(values)` ↔ `@NotNull` enum, `date()` ↔ `@NotNull LocalDate`, `id()` ↔ `@NotNull UUID`,
  `.optional()` when the server has no `@NotBlank`/`@NotNull`. Full table: `forms.md`.
- Two fields in order: `after(z.object({...}), { field: "endsOn", other: "startsOn" })`, called
  last, matching `@After`.

### 8. The form dialog: `frontend/src/ranks/RankFormDialog.tsx`

```tsx
import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { BELT_COLOURS, createRank, rankRequestSchema, updateRank, type Rank } from "./ranks";

export function RankFormDialog({ rank, trigger }: { rank?: Rank; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: rankRequestSchema,
    defaultValues: rank ? { name: rank.name, colour: rank.colour } : { name: "", colour: "" },
    mutation: rank ? updateRank(rank.id, rank.version) : createRank,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog form={form} title={rank ? `Edit ${rank.name}` : "New rank"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={BELT_COLOURS} placeholder="Choose a colour" />}
      </form.AppField>
    </FormDialog>
  );
}
```

- Render a field for every key of the schema, or every submit is refused.
- `defaultValues` holds what inputs hold: `""` for blank text, dates and selects; a record's `null`
  through `inputOf(...)`.
- The form catches nothing and keeps no submitting state: `useSchemaForm` puts a 400's field
  errors under their fields, toasts the rest, waits for `meta.refreshes`, and `FormDialog` closes
  on success.
- A date field is `<f.InputField label="Starts on" type="date" />`. Other fields: `forms.md`.

### 9. The page: `frontend/src/ranks/RanksPage.tsx`

A short list (never more than a few hundred rows) is fetched whole with `SimpleQueryTable`:

```tsx
import { Button, Stack, VisuallyHidden } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { RankFormDialog } from "./RankFormDialog";
import { ranksQuery, type Rank } from "./ranks";

const column = createColumnHelper<Rank>();

/** Module scope: columns built per render remount a row's open dialog. */
const COLUMNS: ColumnDef<Rank, unknown>[] = [
  column.accessor("name", { header: "Name" }),
  column.accessor("colour", { header: "Colour" }),
  column.display({
    id: "actions",
    header: () => <VisuallyHidden>Actions</VisuallyHidden>,
    cell: ({ row }) => <RankFormDialog rank={row.original} trigger={<Button variant="outline">Edit</Button>} />,
  }),
];

export function RanksPage() {
  return (
    <Stack gap="6">
      <PageHeader title="Ranks">
        <RankFormDialog trigger={<Button>New rank</Button>} />
      </PageHeader>
      <SimpleQueryTable
        aria-label="Ranks"
        query={ranksQuery}
        columns={COLUMNS}
        initialSort={{ id: "name", desc: false }}
        getRowId={(rank) => rank.id}
        emptyText="No ranks yet."
        errorText="Could not load the ranks."
      />
    </Stack>
  );
}
```

`SimpleQueryTable` sorts in the browser; its column ids are the accessor keys. "Soonest first" is
`initialSort={{ id: "startsOn", desc: false }}` (or the server's order). A remove button:
`useServerAction` with `useConfirm` (`feedback.md`).

### 10. The route and the nav entry

`frontend/src/routes/_signedIn/ranks.tsx` (thin: guard and component):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import { RANKS_READ } from "../../permissions.gen";
import { RanksPage } from "../../ranks/RanksPage";

export const Route = createFileRoute("/_signedIn/ranks")({
  beforeLoad: ({ context }) => requirePermission(context.me, RANKS_READ),
  component: RanksPage,
});
```

If the nearest feature's route uses a different guard import (an app's own `shell/guards`), copy it.
The router plugin writes `routeTree.gen.ts` on build and test.

`frontend/src/shell/nav.ts`, one more entry (`icon` from `react-icons/lu` only; `permission` the
one the route checks):

```ts
import { LuMedal } from "react-icons/lu"; // beside nav.ts's other icon imports

{ label: "Ranks", to: "/ranks", icon: LuMedal, permission: "ranks.read", description: "The belts a student can hold." },
```

### 11. The Java test: `src/test/java/app/ranks/RanksControllerTest.java`

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import app.identity.Roles;

@AppTest
@DisplayNameGeneration(DisplayNameGenerator.ReplaceUnderscores.class)
class RanksControllerTest {

  @Autowired TestUsers users;

  private TestUser owner;

  @BeforeEach
  void clean_slate() {
    users.reset(); // every user gone, the app's tables emptied; names no tables
    owner = users.owner();
  }

  @Test
  void a_user_is_refused_with_403() throws Exception {
    users.signedIn("Uma User", "uma@example.org", Roles.USER) // a role without ranks.manage
        .perform(delete("/api/ranks/" + UUID.randomUUID()))
        .andExpect(status().isForbidden());
  }

  @Test
  void a_blank_name_is_a_400_on_the_name_field() throws Exception {
    owner.perform(post("/api/ranks").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\" \",\"colour\":\"WHITE\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')].message").value("Must not be blank"));
  }
}
```

`AppTest`, `TestUser`, `TestUsers` are in `org.jwcarman.roux.test`; role names are the app's `Roles` constants (a new app has `USER`). One test per refusal (401
signed out, 403 without the permission, 400 per field rule, 404, 409 stale `version`) and the happy
path (create, list, update at the version read, remove). Assert `$.detail` and field messages word
for word. Sign in only through `TestUsers`; no `csrf()`, no `user(...)`. The app's coverage gate is
100%: every branch of the service needs a test. More: `tests.md`.

### 12. The Vitest tests: beside the code

```tsx
// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { invalidFields, renderWithProviders, server } from "@jwcarman/roux-web/testing";
import { RankFormDialog } from "./RankFormDialog";

describe("RankFormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });
  afterEach(() => {
    act(() => toaster.remove());
  });

  it("puts the server's field error under the field", async () => {
    server.use(http.post("/api/ranks", () => invalidFields({ name: "Another rank has this name" })));
    renderWithProviders(<RankFormDialog trigger={<Button>Open</Button>} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.type(screen.getByLabelText(/^Name/), "White");
    await user.selectOptions(screen.getByLabelText(/^Colour/), "WHITE");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Another rank has this name")).toBeInTheDocument();
  });
});
```

The page and its guard, through the router (`routes/_signedIn/-ranks.test.tsx`; the `-` keeps it
out of the route tree):

```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { RANKS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

describe("/ranks", () => {
  it("lists the ranks", async () => {
    server.use(http.get("/api/ranks", () => HttpResponse.json([{ id: "r1", name: "White", colour: "WHITE", version: 0 }])));
    renderRoute("/ranks", { permissions: [RANKS_READ] });
    const table = await screen.findByRole("table", { name: "Ranks" });
    expect(await within(table).findByText("White")).toBeInTheDocument();
  });

  it("sends someone without the permission home", async () => {
    const { router } = renderRoute("/ranks", { permissions: [] });
    await screen.findByRole("heading", { name: /^Welcome/ });
    expect(router.state.location.pathname).toBe("/");
  });
});
```

- Answer with MSW (`server.use`), never by mocking roux, who, the module or the query client.
  `invalidFields`, `notFound`, `stale`, `serverError` build the server's problems.
- The fake server is strict: a request no handler answers fails the test. A page that starts
  calling a new endpoint breaks every test that renders it:
  `grep -rlE "RanksPage|/ranks|/api/ranks" frontend/src --include=*.test.tsx` and add handlers.
- A route test starts its file name with `-` (`routes/_signedIn/-ranks.test.tsx`) and uses
  `renderRoute` from `src/testing/route.tsx`.
- Frontend coverage is 100% (`npm run coverage` enforces it): every line of the module, page, dialog
  and route must run in some test. Test create and edit in the dialog, the page's rows and empty
  text, the guard, and every button (remove: confirm, then the request).

## A long list (paged by the server)

Instead of steps 3, 7 and 9's list: a sort enum `RankSort implements SortPropertyProvider`
(constants = column ids), a `SearchableRepository`, `Paginator.of(RankEntity.class, RankSort.class,
cfg -> cfg.defaultSort(RankSort.NAME).defaultPageSize(25))` in the service, `@ModelAttribute
PageParams params` in the controller answering `PageDto<Rank>`, `pageQuery(...)` in the module, and
`QueryTable` with its state in the URL (`tableSearchOf`). All of it: `lists.md`.

## Add a field to an existing feature

1. A **new** changeset in the feature's changelog: `<addColumn tableName="rank">` (a required
   column on a table with rows needs a `defaultValue`, or add it nullable).
2. The entity's field, its constructor and change method; the request's annotated component; the
   answer record and its `of`.
3. The module: the interface, the schema rule, and both `defaultValues` in the dialog.
4. The dialog's `form.AppField`.
5. Tests: the server refusal for the new rule; the request body in the dialog test; every MSW
   answer that builds the record gets the field.

## Check

Without Docker (an agent's sandbox), in this order, from the app's root:

1. **If a permission changed:** `./mvnw test -Dskip.npm -Dtest=PermissionsListTest`, repeated until
   it passes (it rewrites `frontend/src/permissions.gen.ts`). First, because everything after it
   builds the frontend, which fails against a stale file.
2. `cd frontend && npm run coverage` (Vitest with the 100% coverage gate) and `npm run build`
   (bundle and `tsc -b` type check). Read every failure; `npm test` is the quicker loop.
3. `./mvnw spotless:apply test-compile`, after the last Java change: formats the Java (the build
   fails on unformatted files) and compiles main and test code. It also runs the frontend's
   `npm ci`, coverage and build again (add `-Dskip.npm` to leave them out while iterating).

With Docker, `./mvnw verify` runs all of it plus the Java tests, the Java coverage gate (100%),
`PermissionsTest` and Playwright (`-DskipITs` leaves out Playwright). Without Docker the Java tests
cannot run: read each test against this recipe (role names exist in `Roles`, the JSON matches the
request, `users.reset()` takes no tables) and every service branch has a test.

## Pitfalls

- Test data that breaks your own rules (an end equal to its start, a name over the limit, a role
  without the permission): without Docker the Java tests cannot run, so read every request body in
  your tests against the request record's annotations before you finish.
- A changeset edited after it ran: every existing database refuses to start. Add a new one.
- `@Table` name and changelog `tableName` differ, or a column type is off: every `@AppTest` fails
  at startup.
- `permissions.gen.ts` stale: the frontend build fails. Run `PermissionsListTest`, don't edit it.
- A permission constant not granted in `roles.xml`, or a grant with no constant: `PermissionsTest`
  fails. A new app's first permission also needs `Permissions.class` in `PermissionClasses.ALL`.
- Columns defined inside the component: a dialog in a row closes by itself.
- A new endpoint called by an existing page: that page's tests fail on the unanswered request.
- Retyping a server message in the browser, or a `.refine` for a two-field order rule: use the
  helper or `after()`.
- `new QueryClient()` anywhere (tests included): `meta.refreshes` stops working; use
  `createQueryClient()` / `testQueryClient()`.
- Skipping `spotless:apply` after the last Java edit: the build fails on format alone.
