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

The React, Chakra UI, TanStack and Zod libraries are peer dependencies; the app supplies them.

### A resource, end to end

A Zod schema built from roux's rules (their messages are the server's, word for word):

```ts
import { z } from "zod";
import { email, oneOf, text } from "@jwcarman/roux-web/form";

export const CUSTOMER_STATUSES = ["LEAD", "ACTIVE", "CHURNED"] as const;

export const customerRequestSchema = z.object({
  name: text().max(100),
  email: email(),
  company: text().optional(),
  status: oneOf(CUSTOMER_STATUSES),
});
```

An API module, one typed function per endpoint. A path without a leading slash goes under `baseUrl`
(`/api` by default); one with it (`/who/me`) is used as it is:

```ts
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";

export const customersApi = {
  get: (id: string, signal?: AbortSignal) => getJson<CustomerDetail>(path`customers/${id}`, { signal }),
  list: (params: CustomerListParams, signal?: AbortSignal) =>
    getJson<PageDto<Customer>>("customers", { params, signal }),
  create: (request: CustomerRequest) => sendJson<CustomerDetail>("POST", "customers", request),
  update: (id: string, request: CustomerRequest & { version: number }) =>
    sendJson<CustomerDetail>("PUT", path`customers/${id}`, request),
};
```

A mutation, declared once. Build the app's query client with `createQueryClient()`, and the queries named
in `meta.refreshes` are refetched after every answer, a refusal included:

```ts
import { mutationOptions } from "@tanstack/react-query";

export const updateCustomer = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: CustomerRequest) => customersApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.customers.detail(id), queryKeys.customers.lists()] },
  });
```

And the form. `useSchemaForm` validates with the schema, submits its parsed output through the mutation,
puts a 400's field errors under their fields and toasts any other refusal; the dialog opens, closes and
resets itself:

```tsx
export function CustomerFormDialog({ customer, trigger }: { customer?: CustomerDetail; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: customerRequestSchema,
    // The record's nullable company becomes the input's "" (the schema's parse turns "" back into null).
    defaultValues: customer
      ? { name: customer.name, email: customer.email, company: inputOf(customer.company), status: customer.status }
      : { name: "", email: "", company: "", status: "LEAD" },
    mutation: customer ? updateCustomer(customer.id, customer.version) : createCustomer,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog form={form} title={customer ? `Edit ${customer.name}` : "New customer"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" />}</form.AppField>
      <form.AppField name="company">{(f) => <f.InputField label="Company" />}</form.AppField>
      <form.AppField name="status">{(f) => <f.SelectField label="Status" options={CUSTOMER_STATUSES} />}</form.AppField>
    </FormDialog>
  );
}
```

`required` and `maxLength` come from the schema. A button that calls the server uses
`useServerAction(archiveCustomer(id))`.

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
