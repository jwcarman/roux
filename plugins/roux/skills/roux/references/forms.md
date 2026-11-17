# Forms

`@jwcarman/roux-web/form` is TanStack Form with Chakra fields, validated by Zod. A create or edit form
is four pieces, each written once:

1. A Zod schema built from roux's rule helpers, in the resource module. Its messages are the server's,
   word for word.
2. The mutation that saves it (`mutationOptions` with `meta.refreshes`), in the same module; see
   [Queries and mutations](queries-and-mutations.md).
3. `useSchemaForm({ schema, defaultValues, mutation })`, which validates, submits the schema's parsed
   output through the mutation, puts a 400's field errors under their fields, toasts any other refusal
   and handles a 409 on a stale record.
4. The fields, in a `FormDialog` or in a form on a page.

The form never calls the API, catches an error, or keeps its own submitting state.

## Write the schema

The schema mirrors the request record's Bean Validation annotations. For a rank, the server's request
is (the template's `CustomerRequest` shape):

```java
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A new rank, or new values for one. {@code version} is the version being edited, and is ignored when creating. */
public record RankRequest(@NotBlank @Size(max = 40) String name, @NotNull BeltColour colour, Long version) {}
```

`version` is a nullable `Long` with no annotation: a create sends none and the service ignores it. The
update checks it before changing anything (`InvalidFieldException` from `org.jwcarman.roux.problems`,
`ObjectOptimisticLockingFailureException` from `org.springframework.orm`):

```java
public Rank update(UUID id, RankRequest request) {
  if (request.version() == null) {
    throw new InvalidFieldException("version", "Must not be empty");
  }
  RankEntity rank = find(id);
  if (!rank.getVersion().equals(request.version())) {
    throw new ObjectOptimisticLockingFailureException(RankEntity.class, id);
  }
  rank.change(request.name(), request.colour());
  return Rank.of(ranks.saveAndFlush(rank));
}
```

Without `version` in the record, Jackson drops the one the client sends and a stale save is never
refused. See [Errors](errors.md#refuse-a-stale-save-optimistic-locking).

The browser's schema, in `src/ranks/ranks.ts`, leaves `version` out: it is not a field the user edits.
`updateRank(id, version)` adds it to the request (`{ ...request, version }`), and `createRank` sends
none:

```ts
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";

/** The belt colours a rank can have: the server's BeltColour enum. */
export const BELT_COLOURS = ["WHITE", "YELLOW", "ORANGE", "GREEN", "BLUE", "BROWN", "BLACK"] as const;

/** RankRequest's rules (without the version), in the server's words. */
export const rankRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(BELT_COLOURS),
});

/** What a rank form sends: the name trimmed, the colour chosen. */
export type RankRequest = z.output<typeof rankRequestSchema>;
```

The whole resource module (API functions, queries, `createRank`, `updateRank`) is in
[Queries and mutations](queries-and-mutations.md#write-a-resource-module).

### The rule helpers

Every helper is required until `.optional()`. Each message is the one in roux's
`ContributorValidationMessages.properties`, so a field reads the same whether the browser or the
server caught the mistake ([Errors](errors.md#what-else-is-answered-for-you)).

| Helper | The field's value | Output | Messages | Server annotation it mirrors |
| --- | --- | --- | --- | --- |
| `text()` | an input's string, trimmed | `string` | `Must not be blank` | `@NotBlank` |
| `email()` | an input's string, trimmed | `string` | `Must not be blank`, `Must be a valid email address` | `@NotBlank @Email` |
| `url()` | an input's string, trimmed; `http` or `https` only | `string` | `Must not be blank`, `Must be a valid web address` | `@NotBlank @URL` |
| `phone()` | an input's string, trimmed: digits, spaces and `+ - ( ) .`, at least 7 digits | `string` | `Must not be blank`, `Is not in the expected format` | `@NotBlank @Phone` (roux-problems; the same pattern) |
| `date()` | a `type="date"` input's `YYYY-MM-DD` | `string` (unchanged) | `Must not be empty`, `Is not in the expected format` | `@NotNull LocalDate` |
| `number()` | a `NumberField`'s `number \| undefined` | `number` | `Must not be empty` | `@NotNull` |
| `integer()` | a `NumberField`'s `number \| undefined` | `number` | `Must not be empty`, `Must be a whole number` (browser only) | `@NotNull` on an `int`/`Integer`/`long` |
| `oneOf(values)` | a `SelectField`'s value, `""` for its placeholder | one of `values` | `Must not be empty` | `@NotNull` on an enum |
| `id()` | a select's value over ids loaded at run time, `""` for its placeholder | `string` | `Must not be empty` | `@NotNull UUID` |

Their methods:

| Method | On | Effect | Message | Server |
| --- | --- | --- | --- | --- |
| `.max(n)` | `text`, `email`, `url`, `phone` | at most `n` characters once trimmed; the input gets `maxLength={n}` | `Must be between 0 and {n} characters` | `@Size(max = n)` |
| `.min(n)` | `number`, `integer` | at least `n` | `Must be at least {n}` | `@Min(n)` |
| `.max(n)` | `number`, `integer` | at most `n` | `Must be at most {n}` | `@Max(n)` |
| `.notInFuture()` | `date` | not after the browser's today | `Must not be in the future` | `@NotInFuture` (roux-problems) |
| `.optional()` | all but `oneOf`, `id` | may be left empty; empty gives `null` | none | no `@NotBlank`/`@NotNull` |

- **A date that may not be in the future** is `date().notInFuture()` in the browser and `@NotInFuture`
  on the server's `LocalDate`, with the one message `Must not be in the future`. Use them, never
  `@PastOrPresent`: that compares with the server's exact today in the server's zone, and a browser in
  another zone (up to UTC+14, ahead of the server) is refused for choosing its own today.
  `@NotInFuture` reads the application's `Clock` bean (the system clock when there is none) and
  allows one day past the server's today, so what `notInFuture()` accepts is never refused. Neither
  needs wiring: annotate the request's field (`@NotNull @NotInFuture LocalDate birthDate`; `null` is
  left to `@NotNull`). A test that sets the `Clock` bean sets the rule's today. (`NotInFutureValidator` and `PhoneValidator`
  are the constraints' validators; you never reference them.)
- **A phone number** is `phone()` and `@Phone` (`@NotBlank @Phone String phone`): one pattern,
  `Phone.PATTERN`, with `contracts/phone.json` and a contract test on each side keeping them
  identical. A blank value is left to `@NotBlank`, as on the browser.
- Text is trimmed before it is checked and sent. An optional text left blank (or only spaces) is sent
  as `null`; so is an optional date left empty, and an optional number left empty.
- A blank required value reports only `Must not be blank`; the format check and any `.refine` do not
  run on it.
- `oneOf` takes a `const` tuple (`["WHITE", "YELLOW"] as const`). Its input also accepts `""`, so a
  create's `defaultValues` can start a select at its placeholder.
- The types, for annotating your own helpers: `TextRule<Out>` (`text`, `email`, `url`, `phone`),
  `DateRule<Out>`, `NumberRule<Out>`; `Out` is the output, `string | null` or `number | null` once
  optional.

Check a rule across fields with `.refine` on the object; `path` puts the message under that field:

```ts
import { date } from "@jwcarman/roux-web/form";
import { z } from "zod";

export const termSchema = z
  .object({ startsOn: date(), endsOn: date() })
  .refine((term) => term.endsOn >= term.startsOn, { path: ["endsOn"], error: "Must not be before the start" });
```

### Write a rule the helpers lack

A choice among ids loaded at run time (a select of ranks from a query) is `id()`: `rankId: id()`. There
is no helper for a boolean, a date-time or a text with a format of your own. Write the Zod schema
yourself, in the server's words, and register it in `fieldRules` so its field shows the required
indicator:

```ts
import { fieldRules } from "@jwcarman/roux-web/form";
import { z } from "zod";

/** A required code of three capitals: `@NotBlank @Pattern("[A-Z]{3}") code`. */
export const code = z
  .string()
  .trim()
  .min(1, { error: "Must not be blank", abort: true })
  .regex(/^[A-Z]{3}$/, { error: "Is not in the expected format" })
  .register(fieldRules, { required: true });

/** A checkbox: no rule to register, an unchecked box is `false`. */
export const open = z.boolean();
```

`fieldRules` is a Zod registry of `FieldRule` (`{ required: boolean; maxLength?: number }`), looked up
by the schema object a field's name leads to in the form's schema. Fields read it; an app only adds to
it as above.

## A form in a dialog

The rank form, for both a new rank and an edit, in `src/ranks/RankFormDialog.tsx`:

```tsx
import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { BELT_COLOURS, createRank, rankRequestSchema, updateRank, type Rank } from "./ranks";

/** "New rank", or "Edit" for the rank given (at the version shown), in a dialog. */
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

Used as `<RankFormDialog trigger={<Button>New rank</Button>} />` above the list, and
`<RankFormDialog rank={rank} trigger={<Button variant="outline">Edit</Button>} />` on each row.

What the user gets with no more code:

- The name field is marked required and takes at most 40 characters (`required` and `maxLength` come
  from the schema); the colours read `White`, `Yellow`, ... (bare values are humanized).
- `Must not be blank` under the name when it is left empty, once the field is left or Save is pressed.
- A save trims the name, sends `{ name, colour }` through `createRank` or `updateRank`, waits for the
  rank list to refetch, toasts `Rank was saved`, and closes the dialog.
- The server's `InvalidFieldException("name", "Another rank has this name")` shows under the name
  field, and the dialog stays open.
- A rank someone else saved meanwhile is refused (409); the form starts over from their rank
  ([below](#versions-and-409-conflicts)).

## useSchemaForm

```ts
function useSchemaForm<S extends FormSchema, TData>(options: SchemaFormOptions<S, TData>): SchemaForm<S>;

interface SchemaFormOptions<S extends FormSchema, TData> {
  schema: S;
  defaultValues: z.input<S>;
  mutation: UseMutationOptions<TData, Error, z.output<S>>;
  onSuccess?: (data: TData, values: z.output<S>) => void | Promise<void>;
  failure?: string;
}
```

`FormSchema` is a Zod object from the form's values to the request (a `z.object(...)`, refined or
not). The options (`SchemaFormOptions`):

| Option | Meaning |
| --- | --- |
| `schema` | Validates the whole form when a field is left and on submit; a `.refine`'s message lands on its `path`. On submit, the schema's parsed output (trimmed, `""` as `null`) is what is sent. |
| `defaultValues` | The values the form starts with: the record being edited, or a create's blanks. Typed as the schema's input, so every field is present and holds what its input holds (strings, `number \| undefined`, booleans). Build it from the record on every render; an untouched form follows it when it changes. |
| `mutation` | The `mutationOptions` that saves `z.output<S>`. Build it on every render (`updateRank(rank.id, rank.version)`). |
| `onSuccess` | Runs after a save succeeds and after the mutation's `meta.refreshes` have refetched, with the server's answer and the values sent. A success toast goes here. |
| `failure` | The toast title for a refusal. Defaults to `Could not save`. A plain string. |

On submit:

- Nothing is sent while any field fails the schema; every field's error shows at once.
- A second submit while a save is out (Enter pressed twice) sends nothing; it waits for the first.
- The form is submitting (`SubmitButton` busy) until the answer and the `meta.refreshes` refetches are
  in.
- After a save, the saved values become the form's defaults: the form is clean and `ResetButton` goes
  back to them. Then `onSaved` listeners run (`FormDialog` closes).

On a refusal:

| Answer | What the form does |
| --- | --- |
| 400 with `errors` | Each field's first message goes under the field (and clears when the field is edited). Messages for fields the form does not show are toasted together under `failure`. |
| 400 without `errors`, 403, 404, 500 | Toast: `failure`, then the server's `detail` (and `Reference: <errorId>` for a 500). |
| 409 | Toast: `failure`, then `detail`; the form starts over from the refreshed record if it changed. See [Versions and 409 conflicts](#versions-and-409-conflicts). |
| 401 | Nothing: the session provider sends the user to sign in. What was typed is kept. |
| No answer (network) | Toast: `failure` alone. |

In every case but the 409 that starts over, what was typed is kept. A server field error's `field` is
matched to the form's field name as the client sent it (`name`, `address.street`, `items[0].name`).

The form `useSchemaForm` returns is a `useAppForm` form (below), so `form.AppField`, `form.AppForm`,
`form.Form`, `form.SubmitButton`, `form.store` and the rest of TanStack Form's API are all there. It
adds:

- `restart()`: back to the latest `defaultValues` the hook was given (a dialog's fresh start).
- `onSaved(listener)`: calls `listener` after each successful save (after `onSuccess`); returns the
  unsubscribe. `FormDialog` uses it to close.

It throws `meta.refreshes needs roux's query client: use createQueryClient() from @jwcarman/roux-web/api`
on submit when the mutation names `meta.refreshes` and the app's client is not `createQueryClient()`'s.

## Start the form from a record

`defaultValues` holds what the inputs hold, not what the record holds. A record's `null` must become
the input's empty value; the schema's parse turns it back into `null` on the way out. Use `inputOf`
for text, `numberInputOf` for a `NumberField`, and `dateTimeInputOf` for an ISO instant shown in a
`type="datetime-local"` input:

```ts
function inputOf(value: string | null): string; // null as ""
function numberInputOf(value: number | null): number | undefined; // null as undefined
function dateTimeInputOf(iso: string | null): string; // an ISO instant as a datetime-local value, in the browser's time zone; null as ""
```

For a student whose `email` and `phone` may be `null`:

```ts
defaultValues: {
  name: student.name,
  email: inputOf(student.email),
  phone: inputOf(student.phone),
  joinedOn: student.joinedOn,
},
```

A create's blanks: `""` for text, dates and selects (`oneOf`'s placeholder), `undefined` for a
`NumberField`, `false` for a checkbox.

## FormDialog

Its props (`FormDialogProps`):

```ts
interface FormDialogProps {
  form: DialogForm; // usually useSchemaForm's
  title: string; // also the dialog's accessible name
  trigger: ReactElement; // the button that opens it; focus returns to it on close
  submitLabel?: string; // default "Save"
  open?: boolean; // pass with onOpenChange to control it
  onOpenChange?: (open: boolean) => void;
  children: ReactNode; // the fields
}
```

`DialogForm` is what the dialog needs of a form: `AppForm`, `Form`, `SubmitButton`, `reset`, and
optionally `restart` and `onSaved`. A `useSchemaForm` form has all of them; a `useAppForm` form lacks
`restart` and `onSaved`, so the dialog cannot close itself after its save.

**Self-managed** (the default; leave out `open` and `onOpenChange`): the trigger opens it; a save
closes it (after `onSuccess`); Escape, Cancel and the close button close it; a refusal keeps it open.
Once closed, the form goes back to its defaults (`restart`): a create opens empty next time, an edit
opens at the latest record. The footer holds Cancel and the submit button; the fields go in a
`Stack` with `gap="4"`.

**Controlled**: pass `open` and `onOpenChange` to open it from code as well as from its trigger:

```tsx
import { Button } from "@chakra-ui/react";
import { useState } from "react";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { BELT_COLOURS, createRank, rankRequestSchema } from "./ranks";

/** Opens the new-rank dialog when the page has no ranks yet, as well as from its button. */
export function FirstRankDialog({ empty }: { empty: boolean }) {
  const [open, setOpen] = useState(empty);
  const form = useSchemaForm({ schema: rankRequestSchema, defaultValues: { name: "", colour: "" }, mutation: createRank });
  return (
    <FormDialog form={form} title="New rank" trigger={<Button>New rank</Button>} open={open} onOpenChange={setOpen}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={BELT_COLOURS} placeholder="Choose a colour" />}
      </form.AppField>
    </FormDialog>
  );
}
```

Render a field for every key of the schema. The schema validates the whole form, so a required key
with no field refuses every submit, and its message has nowhere to show.

`onOpenChange` is told every change: `true` when the trigger is pressed, `false` on Escape, Cancel,
close, and after a save, so the page closes it by passing that on. It is called in self-managed mode
too.

## A form on a page

A form that stays on the page (a settings section, a record's details) renders the form's own
components inside `form.AppForm`:

```tsx
import { HStack, Stack } from "@chakra-ui/react";
import { notify } from "@jwcarman/roux-web/feedback";
import { inputOf, useSchemaForm } from "@jwcarman/roux-web/form";
import { studentRequestSchema, updateStudent, type StudentDetail } from "./students";

/** A student's details, edited in place at the version shown. */
export function StudentDetailsForm({ student }: { student: StudentDetail }) {
  const form = useSchemaForm({
    schema: studentRequestSchema,
    defaultValues: {
      name: student.name,
      email: inputOf(student.email),
      phone: inputOf(student.phone),
      joinedOn: student.joinedOn,
    },
    mutation: updateStudent(student.id, student.version),
    onSuccess: () => notify.success("Student saved"),
    failure: "Could not save the student",
  });

  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="4" maxW="md">
          <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
          <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" />}</form.AppField>
          <form.AppField name="phone">{(f) => <f.InputField label="Phone" type="tel" />}</form.AppField>
          <form.AppField name="joinedOn">{(f) => <f.InputField label="Joined" type="date" />}</form.AppField>
          <HStack gap="3">
            <form.SubmitButton>Save</form.SubmitButton>
            <form.ResetButton />
            <form.SubmittingIndicator />
          </HStack>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}
```

with, in `src/students/students.ts` beside `studentsApi` ([API client](api-client.md)):

```ts
import { mutationOptions } from "@tanstack/react-query";
import { date, email, phone, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** A student as `/api/students/{id}` answers it. */
export interface StudentDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedOn: string;
  rankId: string;
  version: number;
}

/** StudentRequest's rules (without the version), in the server's words. */
export const studentRequestSchema = z.object({
  name: text().max(80),
  email: email().max(320).optional(),
  phone: phone().max(30).optional(),
  joinedOn: date(),
});

/** What a student form sends: trimmed, a blank email or phone as null. */
export type StudentRequest = z.output<typeof studentRequestSchema>;

/** Saves a student at the `version` it was read at; a change made since answers 409. */
export const updateStudent = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: StudentRequest) => studentsApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.students.detail(id), queryKeys.students.lists()] },
  });
```

The form's components, all read through the form context `form.AppForm` provides:

- `form.Form`: the `<form>` element (`noValidate`: the schema speaks, not the browser). A submit
  button inside it, or Enter in a field, validates every field and then submits. Takes `children`
  only.
- `form.SubmitButton`: a `type="submit"` Chakra `Button`, busy (`loading`, label kept) and disabled
  while the form submits. Takes any `ButtonProps` but `type` and `onClick`.
- `form.ResetButton`: puts every field back to the form's defaults (the saved values after a save);
  disabled while the form is clean. Label defaults to `Reset`; any `ButtonProps` but `type` and
  `onClick`. Pass `Cancel` as its children for a page where that reads better.
- `form.SubmittingIndicator`: a spinner and `Saving…` (or its `children`), announced
  (`role="status"`), only while the form submits.

The same components are importable as `Form`, `SubmitButton`, `ResetButton` and `SubmittingIndicator`;
rendered inside `form.AppForm` they behave the same. Use the `form.` ones.

## The fields

Each field is rendered through `form.AppField`, whose child function gets the field (`f` above) with
the components as properties: `f.InputField`, `f.TextAreaField`, `f.NumberField`, `f.SelectField`,
`f.RadioGroupField`, `f.CheckboxField`. Every one takes the `FormFieldProps` it frames:

| Prop | Meaning |
| --- | --- |
| `label` | The label, which also names the control for assistive technology. Required. |
| `helperText` | A hint under the field, replaced by its errors while it has any. |
| `required` | Shows the required indicator. Defaults to what the schema says (`fieldRules`); pass it only for a field whose schema roux cannot read. |

Errors show once the field has been left or the form submitted, never while a first entry is being
typed; a server error shows at once and clears when the field is edited. The message line is always
reserved, so an error appearing does not move the buttons.

| Component | Field value | Props besides the above (type) |
| --- | --- | --- |
| `InputField` | `string` | any Chakra `Input` prop but `value`, `onChange`, `onBlur`, `name`, `required`: `type` (`email`, `tel`, `date`, `datetime-local`, `password`, ...), `placeholder`, `autoComplete`, ... `maxLength` comes from the schema's `.max(n)`. (`InputFieldProps`) |
| `TextAreaField` | `string` | any Chakra `Textarea` prop but the same five; `maxLength` from the schema. (`TextAreaFieldProps`) |
| `NumberField` | `number \| undefined` (empty or unreadable is `undefined`, never `NaN`) | `min`, `max`, `step`; these limit the stepper only and are not read from the schema. (`NumberFieldProps`) |
| `SelectField` | the chosen option's value, or `""` for the placeholder | `options`, `labels`, `placeholder` (`SelectFieldProps<V>`) |
| `RadioGroupField` | `string` | `options: readonly Option[]` (`{ value, label }` with string values only), `orientation` (`"vertical"` default, or `"horizontal"`) (`RadioGroupFieldProps`) |
| `CheckboxField` | `boolean` | none; its `label` sits beside the box. (`CheckboxFieldProps`) |

`SelectField` (the browser's native select):

- `options` is either bare values (`readonly V[]`, such as an enum's `as const` tuple), labelled by
  `labels` (`Partial<Record<string, string>>`, keyed by `String(value)`) or else humanized
  (`ON_HOLD` reads `On hold`), or `{ value, label }` objects (`readonly Option<V>[]`).
- `V` is a `SelectValue`: `string | number | boolean`. The field gets the option's own value, a
  number or a boolean as much as a string.
- `placeholder` is shown while nothing is chosen, and the value is then `""`. Use it with `oneOf` (its
  input takes `""`).

Every field type in one form, a grading for a rank. The schema, in `src/gradings/gradings.ts` (with
`gradingsApi` and `createGrading` beside it, as in the ranks module):

```ts
import { date, id, integer, number, oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";

export const SESSIONS = ["MORNING", "EVENING"] as const;

/** GradingRequest's rules, in the server's words. */
export const gradingRequestSchema = z.object({
  rankId: id(),
  heldOn: date(),
  session: oneOf(SESSIONS),
  places: integer().min(1).max(40),
  fee: number().min(0).optional(),
  open: z.boolean(),
  notes: text().max(500).optional(),
});

export type GradingRequest = z.output<typeof gradingRequestSchema>;
```

```tsx
import { Button } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { ranksQuery } from "../ranks/ranks";
import { createGrading, gradingRequestSchema } from "./gradings";

/** Schedules a grading: when, for which rank, how many places. */
export function NewGradingDialog() {
  const ranks = useQuery(ranksQuery);
  const form = useSchemaForm({
    schema: gradingRequestSchema,
    defaultValues: {
      rankId: "",
      heldOn: "",
      session: "MORNING",
      places: undefined,
      fee: undefined,
      open: false,
      notes: "",
    },
    mutation: createGrading,
    onSuccess: () => notify.success("Grading scheduled"),
    failure: "Could not schedule the grading",
  });
  const rankOptions = (ranks.data ?? []).map((rank) => ({ value: rank.id, label: rank.name }));

  return (
    <FormDialog
      form={form}
      title="Schedule a grading"
      trigger={<Button>Schedule a grading</Button>}
      submitLabel="Schedule"
    >
      <form.AppField name="rankId">
        {(f) => <f.SelectField label="Rank" options={rankOptions} placeholder="Choose a rank" />}
      </form.AppField>
      <form.AppField name="heldOn">{(f) => <f.InputField label="Date" type="date" />}</form.AppField>
      <form.AppField name="session">
        {(f) => (
          <f.RadioGroupField
            label="Session"
            orientation="horizontal"
            options={[
              { value: "MORNING", label: "Morning" },
              { value: "EVENING", label: "Evening" },
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="places">{(f) => <f.NumberField label="Places" min={1} max={40} />}</form.AppField>
      <form.AppField name="fee">
        {(f) => <f.NumberField label="Fee" min={0} step={0.5} helperText="Leave empty when it is free" />}
      </form.AppField>
      <form.AppField name="open">{(f) => <f.CheckboxField label="Open to other schools" />}</form.AppField>
      <form.AppField name="notes">{(f) => <f.TextAreaField label="Notes" />}</form.AppField>
    </FormDialog>
  );
}
```

The field components are also exported by name (`InputField`, `SelectField`, ...) for typing and
tests; in a form, use them through `f.`.

## Versions and 409 conflicts

An edit form must not quietly undo someone else's save. roux handles this with the record's
`version`, end to end:

1. **The server** keeps a `version` on the entity and takes the one the client read in the request.
   When they differ it throws `ObjectOptimisticLockingFailureException`, answered `409` with `This
   record changed since you loaded it` ([Errors](errors.md#refuse-a-stale-save-optimistic-locking)).
2. **The mutation** carries the version it was built with, and refreshes the queries the record comes
   from:

   ```ts
   export const updateRank = (id: string, version: number) =>
     mutationOptions({
       mutationFn: (request: RankRequest) => ranksApi.update(id, { ...request, version }),
       meta: { refreshes: [queryKeys.ranks.detail(id), queryKeys.ranks.lists()] },
     });
   ```

3. **The form** is given the record's values and `updateRank(rank.id, rank.version)` on every render.

What `useSchemaForm` then does:

- While the form is untouched it follows the record: a refetch that brings a newer rank shows it, and
  a save would go at its version.
- Once the user edits, the draft is pinned to the mutation (so the version) it started from. A refetch
  that brings someone else's save meanwhile does not move it: the save goes at the old version and the
  server answers 409. This is deliberate: sending the draft at the new version would overwrite their
  change without anyone seeing it.
- On the 409, the refusal is toasted (`failure`, then `This record changed since you loaded it`), and
  `meta.refreshes` refetches the record. When the record the form is now given differs from the one
  the draft started from (compared field by field over `defaultValues`), the form starts over from
  it: the user sees the other save and makes their change again.
- When the refetched record shows no difference in the form's fields (someone changed a field this
  form does not show, or a create was refused as a duplicate), what was typed is kept, and the next
  save goes with the latest mutation, at the new version.
- After a successful save, the next draft starts from the saved record.

What the app must get right, or a 409 repeats forever:

- `meta.refreshes` names the query the form's record comes from. A dialog opened from a list row gets
  its record from the list, so `lists()` must be there, not only `detail(id)`.
- `defaultValues` and `mutation` are built from the current record on each render. Do not hold them
  in `useState`, `useMemo` or a ref.
- A record that is not in a query (the template's session profile) is reloaded by the mutation's own
  `onSettled`, returning the promise:
  `mutation: { ...renameMe(profile.version), onSettled: () => refreshProfile() }`.

A create has no version; its 409 (`ConflictException`, `DataIntegrityViolationException`) is toasted,
and what was typed is kept. A clash on one field the user typed should be an `InvalidFieldException`
on that field instead, so it lands under the field ([Errors](errors.md#reject-one-field-the-client-sent)).

## Split a long form

Pass a `useSchemaForm` form to a section component typed with `SchemaForm<typeof schema>`:

```tsx
import type { SchemaForm } from "@jwcarman/roux-web/form";
import type { studentRequestSchema } from "./students";

/** The student form's contact section. */
export function ContactFields({ form }: { form: SchemaForm<typeof studentRequestSchema> }) {
  return (
    <>
      <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" />}</form.AppField>
      <form.AppField name="phone">{(f) => <f.InputField label="Phone" type="tel" />}</form.AppField>
    </>
  );
}
```

`withForm` (TanStack's, bound to roux's fields) does the same for a `useAppForm` form, given the same
`defaultValues` and `validators` as the form; it does not accept a `useSchemaForm` form.

## A form that does not save through a mutation

`useSchemaForm` covers create and edit. A form whose submit is something else (who's sign-in link, a
client-side filter) uses `useAppForm`, the hook `useSchemaForm` is built on: TanStack Form's
`useForm` with roux's fields and form components. Validate with a Zod schema at the form level, as
`useSchemaForm` does, and the fields still read `required` and `maxLength` from it:

```tsx
import { Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { send } from "@jwcarman/roux-web/api";
import { notify } from "@jwcarman/roux-web/feedback";
import { email, useAppForm } from "@jwcarman/roux-web/form";
import { z } from "zod";

/** The address to email a sign-in link to. */
const linkRequestSchema = z.object({ email: email() });

/** Emails a sign-in link: a call to who, not a save. */
export function EmailLinkForm() {
  const [sent, setSent] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onBlur: linkRequestSchema, onSubmit: linkRequestSchema },
    onSubmit: async ({ value }) => {
      const response = await send("POST", "/who/email/send", value);
      if (response.ok) {
        setSent(true);
      } else {
        notify.error("Could not send the link. Try again.");
      }
    },
  });

  return (
    <Stack gap="4">
      <form.AppForm>
        <form.Form>
          <Stack gap="4">
            <form.AppField name="email">
              {(f) => <f.InputField label="Email" type="email" autoComplete="username webauthn" />}
            </form.AppField>
            <form.SubmitButton>Email me a link</form.SubmitButton>
          </Stack>
        </form.Form>
      </form.AppForm>
      {sent && <Text role="status">Check your email</Text>}
    </Stack>
  );
}
```

`onSubmit` here gets the form's values, not the schema's parsed output; call
`linkRequestSchema.parse(value)` for the trimmed request. A field can also take its own validator:
`<form.AppField name="label" validators={{ onBlur: labelError, onSubmit: labelError }}>`, where the
validator returns a message or `undefined`.

To show a 400's field errors in such a form, there is no exported helper (`useSchemaForm`'s is
internal). This function does what it does, with `fieldErrorsOf`:

```ts
import type { AnyFormApi } from "@tanstack/react-form";
import { fieldErrorsOf } from "@jwcarman/roux-web/form";
import type { Problem } from "@jwcarman/roux-web/problem";

/** Puts a 400's field errors under the fields `form` shows; returns the messages for the rest. */
export function placeFieldErrors(form: AnyFormApi, problem: Problem): string[] {
  const unplaced: string[] = [];
  for (const [name, message] of Object.entries(fieldErrorsOf(problem))) {
    if (name in form.fieldInfo) {
      form.setFieldMeta(name, (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: message } }));
    } else {
      unplaced.push(message);
    }
  }
  return unplaced;
}
```

`fieldErrorsOf(problem: Problem): Record<string, string>` gives the first message for each field in
the problem's `errors` (`{}` when there are none). A field shows an `onServer` error at once, and
TanStack Form clears it when the field changes.

## A custom field

For a control roux has no field for, frame it with `FormField` inside `form.AppField`, or make it a
component that reads the field with `useFieldContext`:

```tsx
import { Switch } from "@chakra-ui/react";
import { FormField, useFieldContext } from "@jwcarman/roux-web/form";

/** A switch for a boolean field, framed like roux's fields. */
export function SwitchField({ label, helperText }: { label: string; helperText?: string }) {
  const field = useFieldContext<boolean>();
  return (
    <FormField label={label} helperText={helperText} controlLabelled>
      <Switch.Root checked={field.state.value} onCheckedChange={({ checked }) => field.handleChange(checked)}>
        <Switch.HiddenInput name={field.name} onBlur={field.handleBlur} />
        <Switch.Control />
        <Switch.Label>{label}</Switch.Label>
      </Switch.Root>
    </FormField>
  );
}
```

Use it as `<form.AppField name="open">{() => <SwitchField label="Open to other schools" />}</form.AppField>`.
The field components on `f.` are fixed; a custom one is rendered by name inside `form.AppField`.

`FormField` (`FormFieldProps`: `label`, `helperText`, `required`, `controlLabelled`, `children`)
draws the label, the required indicator (from the schema unless `required` is passed), the control
(`children`, wired by Chakra's `Field` to the label and messages) and the errors, with the timing
described under [The fields](#the-fields). `controlLabelled` drops the frame's own `<label>` for a
control that names itself (a checkbox, a switch, a radio group). It must be rendered inside
`form.AppField`.

The other building blocks:

- `useFieldContext<T>()`: the current field (`state.value`, `handleChange`, `handleBlur`, `name`,
  `state.meta`) inside `form.AppField`.
- `useFormContext()`: the form inside `form.AppForm`, for a component that reads the form's state:
  `useStore(form.store, (state) => state.isDirty)` (`useStore` from `@tanstack/react-form`).
- `errorMessages(errors: readonly unknown[]): string[]`: the messages to show for a field's
  `state.meta.errors` (strings, or objects with a `message`, or lists of either; blanks and repeats
  dropped, an object without a message as `Invalid value`). `FormField` uses it; call it only when
  drawing errors without `FormField`.
- `fieldContext` and `formContext`: the contexts `useAppForm` was built with. An app does not need
  them; never build a second form hook with `createFormHook`.

## Things to know

Gaps in 0.2.0 that a builder hits:

- **A nullable record field needs `inputOf` in `defaultValues`.** An optional text's input is
  `string`, so `email: student.email` (`string | null`) does not compile (`Type 'string | null' is
  not assignable to type 'string'`). Use `inputOf`, `numberInputOf` or `dateTimeInputOf`.
- **`url()` rejects a host without a dot**, such as `http://localhost:8080`, and **`email()` rejects a
  domain without a dot**, such as `ann@localhost`, though the server's `@URL` and `@Email` accept both.
  Where such values are valid, write that field's schema with Zod and register it in `fieldRules`
  ([Write a rule the helpers lack](#write-a-rule-the-helpers-lack)).
- **Call `.max()` and `.optional()` before `.refine()`.** A `.refine` returns Zod's copy of the rule,
  without roux's methods: `text().refine(check).optional()` still refuses a blank value, while
  `text().optional().refine(check)` accepts it as `null`. The field's `required` and `maxLength` do
  survive a `.refine`.
- **A `.transform` or `.pipe` hides the rules.** On a field or on the whole object schema, it leaves
  the fields with no required indicator and no `maxLength`. Keep transforms out of form schemas, or
  `.register(fieldRules, { required: true })` the result, or pass `required` to the field.
- **`useServerAction`'s `failure` cannot tell a 409 apart.** It is a string or a function of the
  variables, not of the error, so every refusal of a button gets the same title; the server's
  `detail` under it says what happened.
- **A `useAppForm` form has no public helper to place a refusal's field errors.** Use
  `placeFieldErrors` above.
- **`withForm` does not accept a `useSchemaForm` form** (a type error); type a section's prop as
  `SchemaForm<typeof schema>` instead.
- **`FormDialog` needs a `trigger` even when controlled.**
- **`oneOf` has no optional form.** Zod's own `.optional()` on it accepts `undefined`, not the
  select's `""`, so the placeholder is still refused. For an optional choice, write
  `z.union([z.literal(""), z.enum(values)]).transform((value) => (value === "" ? null : value))`.
- **`integer()`'s `Must be a whole number` is the browser's own**; roux's server messages have no
  counterpart.

## Don't

- Don't call the API, `fetch`, or `mutateAsync` from a form's submit; give `useSchemaForm` the
  mutation.
- Don't write `z.string().min(1, ...)` or your own messages where a helper exists; the helpers' words
  are the server's.
- Don't catch a save's error to toast it or set field errors; `useSchemaForm` does both.
- Don't keep `open` state for a `FormDialog` unless the page opens it from code.
- Don't `reset` the form after a save or when a dialog opens; the form and the dialog do it.
- Don't hold `defaultValues` or the mutation in state; build them from the record on each render.
