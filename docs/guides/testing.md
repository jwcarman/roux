# Testing

A roux app is tested at three levels, each against the real thing as far as it can be:

- **Java:** the whole app, with who and PostgreSQL, through MockMvc (`@AppTest`). Controller tests
  sign in as a role and assert the Problem Details the browser will read.
- **Vitest with MSW:** components, forms and routes in jsdom, against a fake network that answers
  with the shapes roux's server sends, refusals included.
- **Playwright:** the built app in a browser, signing in by email link, including a
  Content-Security-Policy test.

The helpers below are the app's own files (the template has them, and a new app copies them).
roux-web's own test helpers are internal and not exported; do not import from roux's source.

## Dependencies

Test dependencies in `pom.xml`, without versions (Spring Boot's parent manages Spring's and
Testcontainers'; `roux-bom` manages `who-test`, which brings `spring-security-test`):

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webmvc-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.jwcarman.who</groupId>
    <artifactId>who-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-testcontainers</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers-postgresql</artifactId>
    <scope>test</scope>
</dependency>
```

and in the frontend's `package.json`, as dev dependencies: `vitest`, `jsdom`, `msw`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; Playwright
(`@playwright/test`) lives in its own `e2e/` package.

## Java: the whole app on PostgreSQL

Tests run the real app: who's security chain, roux's problem answers, the app's Liquibase changelog
(after who's and roux's tables, which migratory creates), on a PostgreSQL that Testcontainers starts (Docker must be running). Nothing
is mocked; the app's `application.yml` applies, so its required settings
([Getting started](getting-started.md#required-settings)) are already there, and no mail is sent
because tests sign in through who-test, not by email.

### The database

```java
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** PostgreSQL for the tests, the database who and the app keep their tables in. */
@TestConfiguration(proxyBeanMethods = false)
public class TestDatabase {

  @Bean
  @ServiceConnection
  PostgreSQLContainer postgres() {
    return new PostgreSQLContainer("postgres:16");
  }
}
```

`@ServiceConnection` points `spring.datasource.*` at the container; no URL is configured. One
container serves each application context, and Spring caches contexts, so test classes with the same
configuration share one database. (The template's `TestDatabase` goes further: one PostgreSQL per
run with a fresh database per context, and a database named by the environment where there is no
Docker. Use it when the suite grows.)

### @AppTest

One annotation for every test that needs the app:

```java
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

/**
 * The whole app on PostgreSQL, with MockMvc and {@link TestMembers}. Test classes with the same
 * configuration share one running app and one database, so each test starts with {@link
 * TestMembers#reset(String...)}.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestDatabase.class, TestMembers.class})
public @interface AppTest {}
```

### Signed-in people: TestMembers

who signs people in; a test makes a person, gives them a role, and gets a browser signed in as them.
who-test's `WhoMockMvcBrowser` is that browser:

```java
import java.util.ArrayList;
import java.util.List;

import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** People for an {@link AppTest}: a clean slate, and browsers signed in with a role. */
public class TestMembers {

  /** who's people and their email sign-ins; truncating them cascades to sessions and roles held. */
  private static final List<String> WHO_TABLES = List.of("who_identity", "who_email_credential");

  private final JdbcTemplate jdbc;
  private final MockMvc mvc;
  private final WhoService who;
  private final EmailCredentialService emailCredentials;
  private final RbacService rbac;

  public TestMembers(
      JdbcTemplate jdbc,
      MockMvc mvc,
      WhoService who,
      EmailCredentialService emailCredentials,
      RbacService rbac) {
    this.jdbc = jdbc;
    this.mvc = mvc;
    this.who = who;
    this.emailCredentials = emailCredentials;
    this.rbac = rbac;
  }

  /** Removes every person and empties the app's {@code tables}; the roles stay. */
  public void reset(String... tables) {
    List<String> truncated = new ArrayList<>(WHO_TABLES);
    truncated.addAll(List.of(tables));
    jdbc.execute("truncate " + String.join(", ", truncated) + " cascade");
  }

  /** A new person with {@code role} (one the app made at startup), and a browser signed in as them. */
  public <R extends Enum<R>> WhoMockMvcBrowser signedIn(String email, R role) {
    Identity identity = who.createIdentity();
    EmailCredential credential = emailCredentials.register(identity, email);
    rbac.assignRoleToIdentity(identity, rbac.findRequiredRole(role));
    return new WhoMockMvcBrowser(mvc).signedInAs(identity.id(), credential.id());
  }

  /** A browser with no one signed in. */
  public WhoMockMvcBrowser anonymous() {
    return new WhoMockMvcBrowser(mvc);
  }
}
```

- `new WhoMockMvcBrowser(mvc)` keeps the session and cookies between requests, and on `POST`, `PUT`,
  `PATCH` and `DELETE` sends `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie, as roux's browser client
  does. It gets that cookie from `GET /who/me` first when it has none.
- `signedInAs(identityId, credentialId)` records a real sign-in in who's tables (who checks the
  session against them on every request), so the person and the credential must exist:
  `WhoService.createIdentity()` and `EmailCredentialService.register(identity, email)` make them.
  With Spring Session (the template's JDBC sessions) it saves the session there.
- `browser.perform(request)` sends a request as that person; `performWithoutCsrf(request)` sends one
  without the CSRF header, to prove a write is refused (`403`).
- Roles are the app's (`RbacService.findRequiredRole(AppRole.INSTRUCTOR)`), made at startup by the
  app; `reset` leaves them. An app that keeps a profile per member saves it in `signedIn` too.

### A controller test

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

@AppTest
@DisplayNameGeneration(DisplayNameGenerator.ReplaceUnderscores.class)
class StudentsControllerTest {

  private static final String STUDENTS = "/api/students";

  @Autowired TestMembers members;

  private WhoMockMvcBrowser instructor;

  @BeforeEach
  void clean_slate() {
    members.reset("promotion", "student");
    instructor = members.signedIn("ivy@example.org", AppRole.INSTRUCTOR);
  }

  @Test
  void a_signed_out_caller_is_refused_with_401() throws Exception {
    members.anonymous().perform(get(STUDENTS)).andExpect(status().isUnauthorized());
  }

  @Test
  void a_blank_name_is_a_400_on_the_name_field() throws Exception {
    instructor
        .perform(json(post(STUDENTS), "{\"name\":\" \",\"joinedOn\":\"2026-11-01\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[?(@.field == 'name')].message").value("Must not be blank"));
  }

  @Test
  void a_missing_student_is_a_404_naming_it() throws Exception {
    UUID missing = UUID.randomUUID();

    instructor
        .perform(get(STUDENTS + "/" + missing))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
  }

  @Test
  void an_unknown_sort_is_a_400_on_sortBy() throws Exception {
    instructor
        .perform(get(STUDENTS).param("sortBy", "AGE"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("sortBy"));
  }

  @Test
  void a_stale_version_is_a_409() throws Exception {
    String id = create("Ada Lovelace");

    instructor
        .perform(
            json(
                put(STUDENTS + "/" + id),
                "{\"name\":\"Ada King\",\"joinedOn\":\"2026-11-01\",\"version\":7}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("This record changed since you loaded it"));
  }

  private String create(String name) throws Exception {
    String response =
        instructor
            .perform(json(post(STUDENTS), "{\"name\":\"%s\",\"joinedOn\":\"2026-11-01\"}".formatted(name)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return JsonPath.read(response, "$.id");
  }

  private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(body);
  }
}
```

What a controller test asserts:

- **The status and the user's words.** `$.detail` and `$.errors[?(@.field == 'name')].message` are
  what the browser shows, word for word, so assert them exactly ([Errors](errors.md)). The content
  type is `application/problem+json`.
- **One test per refusal the endpoint can give:** signed out (`401`), a missing permission (`403`,
  sign in with a role that lacks it), an invalid field (`400` with `errors`), a missing record
  (`404`), a stale `version` (`409`), an unknown `sortBy` on a list (`400` on `sortBy`).
- **The happy path through the API**, as the browser calls it: create, read back, update at the
  version read, list with search, filters and sort.

Sign in through `TestMembers`, not with Spring Security Test's `user(...)`: that principal is not a
who identity, so it has none of the app's roles or permissions, and code that reads the caller's
identity finds none. Do not send `csrf().asHeader()` either: its token is masked, and who's CSRF
setup (`csrf.spa()`) refuses it; `WhoMockMvcBrowser` sends the cookie's value, as the browser does.

## Vitest with MSW

Component, form and route tests run in Vitest. They render the real component with roux's query
client and answer its requests with MSW (Mock Service Worker); nothing in the app is mocked. The test
section of `vite.config.ts`:

```ts
// Tests run in Node; a component or route test opts into jsdom with a `@vitest-environment jsdom` docblock.
test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["src/testing/setup.ts"] },
```

### The fake network

`src/testing/server.ts` starts MSW with no handlers. A request no handler answers fails the test that
sent it, so a test cannot pass on a screen that silently failed to load:

```ts
import { setupServer } from "msw/node";

/**
 * The fake network every test runs against. It starts with no handlers: a test answers what it
 * expects with `server.use(http.get(...))`, and the handlers go after each test.
 */
export const server = setupServer();

const unanswered: string[] = [];

/** Starts the fake network; a request no handler answers is remembered, and fails its test. */
export function listen(): void {
  server.events.on("request:unhandled", ({ request }) => {
    unanswered.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  server.listen({ onUnhandledFrame: "error" });
}

/** Throws if the test sent a request no handler answered (TanStack Query would hide it). */
export function checkAllAnswered(): void {
  const requests = unanswered.splice(0);
  if (requests.length > 0) {
    throw new Error(`No handler answered: ${requests.join(", ")}`);
  }
}
```

`src/testing/setup.ts` starts it, resets it after each test, and gives jsdom what Chakra needs:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { checkAllAnswered, listen, server } from "./server";

beforeAll(listen);

afterEach(() => {
  cleanup();
  server.resetHandlers();
  checkAllAnswered();
});

afterAll(() => server.close());

// What Chakra's components reach for that jsdom does not provide (tests run in Node unless they ask
// for jsdom).
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  Element.prototype.scrollTo ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}
```

### Rendering

`src/testing/render.tsx` renders inside the app's providers, with roux's query client (never
`new QueryClient()`: `meta.refreshes` needs roux's) and no retries, so a failure shows at once:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";

/** roux's query client (so `meta.refreshes` works), without retries: a failure shows at once. */
export function testQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return client;
}

/** Renders `ui` inside the app's providers, with the toaster, and a fresh query client unless one is given. */
export function renderWithProviders(ui: ReactElement, client = testQueryClient()) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ChakraProvider value={defaultSystem}>
          <ConfirmProvider>{children}</ConfirmProvider>
          <Toaster />
        </ChakraProvider>
      </QueryClientProvider>
    );
  }
  return { client, ...render(ui, { wrapper: Providers }) };
}
```

### Answering with problems

The server's refusals have fixed shapes (`contracts/problem-*.json` in roux's repository, described in
[Errors](errors.md#the-problem-shape)). `src/testing/problems.ts` builds them, so a test answers a
refusal exactly as the server would, with the `application/problem+json` content type that
`problemOf` requires:

```ts
const PROBLEM_JSON = { "Content-Type": "application/problem+json" };

function problem(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: PROBLEM_JSON });
}

/** A 400 naming invalid fields, as roux answers a Bean Validation failure or an InvalidFieldException. */
export function invalidFields(fields: Record<string, string>): Response {
  const errors = Object.entries(fields).map(([field, message]) => ({ field, message }));
  return problem({ title: "Bad Request", status: 400, detail: "The request has invalid fields", errors }, 400);
}

/** A 400 for a broken rule (an InvariantViolationException): a `detail` and no fields. */
export function invariantViolation(detail: string): Response {
  return problem({ title: "Bad Request", status: 400, detail }, 400);
}

/** A 404 (a NotFoundException). */
export function notFound(detail: string): Response {
  return problem({ title: "Not Found", status: 404, detail }, 404);
}

/** A 409 for a stale version, as roux answers an optimistic-locking failure. */
export function stale(): Response {
  return problem({ title: "Conflict", status: 409, detail: "This record changed since you loaded it" }, 409);
}

/** A 500, with the reference the server logged. */
export function serverError(errorId = "7d1c2e0a-5b4f-4c1e-9a8b-0f6e2d3c4b5a"): Response {
  return problem({ title: "Internal Server Error", status: 500, detail: "Something went wrong", errorId }, 500);
}
```

Write field messages in the server's words (`Must not be blank`, `Another rank has this name`).

### A form test

```tsx
// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { queryKeys } from "../queryKeys";
import { invalidFields, stale } from "../testing/problems";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import type { Rank } from "./ranks";
import { RankFormDialog } from "./RankFormDialog";

const YELLOW: Rank = { id: "r2", name: "Yellow belt", colour: "YELLOW", version: 3 };

async function open(rank?: Rank) {
  const { client } = renderWithProviders(<RankFormDialog rank={rank} trigger={<Button>Open</Button>} />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog, invalidate };
}

describe("RankFormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token"; // the client sends it as X-XSRF-TOKEN, with no bootstrap call
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("checks the fields in the server's words and sends nothing while they are wrong", async () => {
    const sent = vi.fn();
    server.use(http.post("/api/ranks", sent));
    const { user } = await open();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(sent).not.toHaveBeenCalled();
  });

  it("adds a rank, toasts, refreshes the list and closes", async () => {
    let body: unknown;
    server.use(
      http.post("/api/ranks", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "r1", name: "White belt", colour: "WHITE", version: 0 }, { status: 201 });
      }),
    );
    const { user, dialog, invalidate } = await open();

    await user.type(screen.getByLabelText(/^Name/), " White belt ");
    await user.selectOptions(screen.getByLabelText(/^Colour/), "WHITE");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("White belt was saved");
    expect(body).toEqual({ name: "White belt", colour: "WHITE" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ranks.lists() });
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("puts the server's field error under the field", async () => {
    server.use(http.put("/api/ranks/r2", () => invalidFields({ name: "Another rank has this name" })));
    const { user, dialog } = await open(YELLOW);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Another rank has this name")).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("says so when someone else saved the rank first", async () => {
    server.use(http.put("/api/ranks/r2", () => stale()));
    const { user } = await open(YELLOW);

    await user.click(screen.getByRole("button", { name: "Save" }));

    // The toaster keeps an empty live region with role="alert" too: find the toast by its text.
    const title = await screen.findByText("Could not save");
    expect(title.closest("[role=alert]")).toHaveTextContent("This record changed since you loaded it");
  });
});
```

- Find fields by label (`getByLabelText(/^Name/)`; the required indicator follows the label) and
  buttons by role and name, as a user would.
- Set the `XSRF-TOKEN` cookie before a write, or the client first asks `/who/me` for one, and that
  request needs a handler too.
- Assert the request body the server would receive (trimmed, `""` as `null`, `version` on an update),
  the toast (`role="status"` for success; for a failure, find the title text, then its
  `[role=alert]`), and `invalidateQueries` called with the keys in `meta.refreshes`.
- Clear toasts after each test with `toaster.remove()` inside `act`, or one test's toast is still
  on screen in the next.

### A route test

A page that keeps its state in the URL (a `QueryTable` with `params`) is tested through the router.
`src/testing/route.tsx` opens a path in the app's generated route tree, signed in through a mocked
`/who/me`:

```tsx
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { routeTree } from "../routeTree.gen";
import { SessionProvider } from "../session";
import { renderWithProviders, testQueryClient } from "./render";
import { server } from "./server";

/**
 * Opens `path` in the whole app: the generated route tree in a memory router, signed in with
 * `permissions` (or signed out with `null`). Returns the router, to check where it ended up.
 */
export function renderRoute(path: string, { permissions }: { permissions: string[] | null }) {
  server.use(
    http.get("/who/me", () =>
      permissions === null
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({ identityId: "id-1", permissions }),
    ),
  );
  const client = testQueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: client },
  });
  renderWithProviders(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
    client,
  );
  return { router, client };
}
```

Its context and providers must match the app's own `main.tsx` (here a `queryClient` in the router
context, and the getting-started guide's `SessionProvider`). A paged endpoint answers with a
`PageDto`; `src/testing/pages.ts` builds one:

```ts
import type { PageDto, PageParams } from "@jwcarman/roux-web/paging";

/** One page of `rows`, as a jpa-utils endpoint answers `params`. */
export function pageOf<T>(rows: readonly T[], params: PageParams): PageDto<T> {
  const pageIndex = params.pageIndex ?? 0;
  const pageSize = params.pageSize ?? 20;
  const totalPageCount = Math.ceil(rows.length / pageSize);
  return {
    data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    pagination: {
      pageIndex,
      pageSize,
      totalElementCount: rows.length,
      totalPageCount,
      hasNext: pageIndex < totalPageCount - 1,
      hasPrevious: pageIndex > 0,
    },
  };
}
```

```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { pageOf } from "../testing/pages";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import type { Student } from "./students";

const STUDENTS: Student[] = [
  { id: "s1", name: "Ada Lovelace", email: "ada@example.org", joinedOn: "2026-09-01", status: "ACTIVE" },
  { id: "s2", name: "Grace Hopper", email: null, joinedOn: "2026-10-01", status: "INACTIVE" },
];

/** `/api/students`, filtering by status, and recording each request's query string. */
function studentsEndpoint() {
  const queries: string[] = [];
  server.use(
    http.get("/api/students", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const status = url.searchParams.get("status");
      const rows = status ? STUDENTS.filter((student) => student.status === status) : STUDENTS;
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
  );
  return queries;
}

describe("/students", () => {
  it("lists the students, with a dash for no email", async () => {
    studentsEndpoint();
    renderRoute("/students", { permissions: [] });

    const table = await screen.findByRole("table", { name: "Students" });
    expect(await within(table).findByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/students/s1");
    expect(within(table).getByRole("row", { name: /Grace Hopper/ })).toHaveTextContent("—");
  });

  it("filters by status from the chips, and keeps the filter in the URL", async () => {
    const queries = studentsEndpoint();
    const { router } = renderRoute("/students", { permissions: [] });
    const table = await screen.findByRole("table", { name: "Students" });
    await within(table).findByText("Ada Lovelace");

    await userEvent.setup().click(screen.getByRole("button", { name: "Inactive", pressed: false }));

    expect(await within(table).findByText("Grace Hopper")).toBeInTheDocument();
    expect(within(table).queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ status: "INACTIVE" });
    expect(queries.at(-1)).toContain("status=INACTIVE");
  });
});
```

Assert what is on screen, where the router ended up (`router.state.location.search`), and the query
string the endpoint received.

## Playwright

The end-to-end suite (`e2e/`) drives the built app in Chromium against a real database and a real
mail catcher. In the template a Maven integration test (`E2eIT`, run by Failsafe in `verify`)
starts PostgreSQL (`TestDatabase`), Mailpit and the app on a free port, passes their URLs to the
suite in the environment (`E2E_BASE_URL`, `E2E_MAILPIT_URL`), and runs `npx playwright test`. The
app's arguments set the URL-dependent settings: `who.passkey.rp-id=localhost`,
`who.passkey.allowed-origins` and the link base URL at the chosen port, and `spring.mail.host` and
`spring.mail.port` at Mailpit (`who.email.from` set, and `who-email-smtp` on the classpath).

The suite signs in as a user does: it asks for a link on the sign-in page, reads the link from
Mailpit's API, and opens it. Passkeys use Chrome's virtual authenticator (the DevTools `WebAuthn`
domain). Requests a test intercepts are who's, under `/who` (`/who/me/passkeys/options`).

### The Content-Security-Policy test

roux's browser code runs under a strict policy (`script-src 'self' 'nonce-...'`, no `unsafe-eval`;
see [Getting started](getting-started.md#the-shell)). The suite proves it: it records
every violation from before the page's own code runs, uses the app, and expects none. The policy
header is roux's (it writes one with a fresh nonce on every response of the shell):

```ts
import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    cspViolations: string[];
    injectedScriptRan?: boolean;
  }
}

/** Collects every Content-Security-Policy violation on the page, from before the page's own code. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
  });
}

test("the sign-in page runs under its Content-Security-Policy without a violation", async ({ page }) => {
  await recordViolations(page);
  const response = await page.goto("/signin");
  expect(response?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();

  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
});

test("a script injected into the page does not run", async ({ page }) => {
  await recordViolations(page);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.injectedScriptRan = true;";
    document.body.append(script);
  });

  expect(await page.evaluate(() => window.injectedScriptRan)).toBeUndefined();
  expect(await page.evaluate(() => window.cspViolations)).toEqual([expect.stringMatching(/^script-src-elem inline/)]);
});
```

The template's version also signs in and opens a table, sorts it, opens a dialog, saves a form so a
toast shows, and switches the colour mode, because each adds styles of its own. Add each new kind of
screen to that walk.

## Don't

- Don't mock roux, who, the API module or the query client; answer requests with MSW, and run the
  Java tests against the real app.
- Don't build Problem Detail bodies inline in each test; use `problems.ts`, which matches roux's
  contracts.
- Don't create a `QueryClient` in a test; use `testQueryClient()` (roux's client).
- Don't use H2 or an in-memory database for the Java tests; roux apps run on PostgreSQL.
- Don't import roux-web's internal test helpers; the app has its own.
