# Forms

!!! note "Forms on surfaces"
    An app's forms are drawn on its surfaces: `Form`, `InputField` and `SelectField` bound to a draft,
    a button whose event runs a command, and the command's `Validate` as the gate
    ([Surfaces](surfaces.md)). This guide is the React form layer those catalog components and roux's
    built-in pages (sign-in, users, appearance) are built on; it matters when
    [adding a primitive](adding-a-primitive.md). Its rule helpers' words are the same the server's
    `Validate` answers.

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

The schema mirrors the rules of the server's input. For a label, the server's `validate`
([A feature's server side](features.md#the-input)) refuses a blank name, a name over 40
characters and a colour outside its list, and an edit without a `version`:

```go
in.Name = strings.TrimSpace(deref(b.Name))
switch n := utf8.RuneCountInString(in.Name); {
case n == 0:
	bad("name", problem.MustNotBeBlank)
case n > MaxName:
	bad("name", problem.MustBeBetween(1, MaxName))
}
in.Colour = deref(b.Colour)
if !slices.Contains(Colours, in.Colour) {
	bad("colour", problem.MustBeOneOf(Colours...))
}
if edit && b.Version == nil {
	bad("version", problem.MustNotBeEmpty)
}
```

A create sends no `version`; the update checks the one it is sent before changing anything (a
stale one is the `409`). See [Errors](errors.md#refuse-a-stale-save).

The browser's schema, in `src/labels/labels.ts`, leaves `version` out: it is not a field the user edits.
`updateLabel(id, version)` adds it to the request (`{ ...request, version }`), and `createLabel` sends
none:

```ts
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";

/** The colours a label can have: the server's Colours (Chakra UI's palette names). */
export const LABEL_COLOURS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;

/** The label input's rules (without the version), in the server's words. */
export const labelRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(LABEL_COLOURS),
});

/** What a label form sends: the name trimmed, the colour chosen. */
export type LabelRequest = z.output<typeof labelRequestSchema>;
```

The whole resource module (API functions, queries, `createLabel`, `updateLabel`) is in
[Queries and mutations](queries-and-mutations.md#write-a-resource-module).

### The rule helpers

Every helper is required until `.optional()`. Each message is the one in `contracts/messages.json`,
which the server's `problem` package uses too, so a field reads the same whether the browser or the
server caught the mistake ([Errors](errors.md#refuse-one-field-the-client-sent)).

| Helper | The field's value | Output | Messages | The server's check |
| --- | --- | --- | --- | --- |
| `text()` | an input's string, trimmed | `string` | `Must not be blank` | trimmed, then `problem.MustNotBeBlank` when empty |
| `email()` | an input's string, trimmed | `string` | `Must not be blank`, `Must be a valid email address` | `net/mail.ParseAddress`, then `problem.ValidEmail` |
| `url()` | an input's string, trimmed; `http` or `https` only | `string` | `Must not be blank`, `Must be a valid web address` | `net/url.Parse` with an `http` or `https` scheme and a host, then `problem.ValidURL` |
| `phone()` | an input's string, trimmed: digits, spaces and `+ - ( ) .`, at least 7 digits | `string` | `Must not be blank`, `Is not in the expected format` | none yet: write the pattern in `contracts/phone.json` as a Go `regexp` |
| `date()` | a `type="date"` input's `YYYY-MM-DD` | `string` (unchanged) | `Must not be empty`, `Is not in the expected format` | `time.Parse(time.DateOnly, s)`, else `problem.BadFormat` |
| `time()` | a `type="time"` input's `HH:mm` (or `HH:mm:ss`) | `string` (unchanged) | `Must not be empty`, `Is not in the expected format` | `time.Parse("15:04", s)`, else `problem.BadFormat` |
| `number()` | a `NumberField`'s `number \| undefined` | `number` | `Must not be empty` | a `*float64` that is not nil |
| `integer()` | a `NumberField`'s `number \| undefined` | `number` | `Must not be empty`, `Must be a whole number` (browser only) | a `*int64` that is not nil (a fraction fails to decode) |
| `oneOf(values)` | a `SelectField`'s value, `""` for its placeholder | one of `values` | `Must not be empty` | `slices.Contains(values, v)`, else `problem.MustBeOneOf(values...)` |
| `id()` | a select's value over ids loaded at run time, `""` for its placeholder | `string` | `Must not be empty` | `uuid.Parse`, and that the row exists |

Their methods:

| Method | On | Effect | Message | The server's check |
| --- | --- | --- | --- | --- |
| `.max(n)` | `text`, `email`, `url`, `phone` | at most `n` characters once trimmed; the input gets `maxLength={n}` | `Must be between 0 and {n} characters` | `utf8.RuneCountInString(v) > n`, then `problem.MustBeBetween(0, n)` (or `(1, n)` when required) |
| `.min(n)` | `number`, `integer` | at least `n` | `Must be at least {n}` | `problem.MustBeAtLeast(n)` |
| `.max(n)` | `number`, `integer` | at most `n` | `Must be at most {n}` | `problem.MustBeAtMost(n)` |
| `.notInFuture()` | `date` | not after the organization's `today()` | `Must not be in the future` | the day after the organization's today, then `problem.MustNotBeInFuture` |
| `.optional()` | all | may be left empty (a select at its placeholder); empty gives `null` | none | a nil pointer passes |

- **A date that may not be in the future** is `date().notInFuture()` in the browser, and on the
  server a comparison with the organization's today, never the server's own (`time.Now()` is the
  server's zone): both compare with the same day ([Dates and time](dates-and-time.md)), so they never
  disagree. A browser test sets `setOrganization(testOrganization({ today }))`; a server test sets
  the clock.
- **A phone number** is `phone()`. Its pattern is in `contracts/phone.json`; roux's Go side has no
  phone check yet, so a feature that stores one checks it with that pattern and answers
  `problem.BadFormat`.
- Text is trimmed before it is checked and sent. An optional text left blank (or only spaces) is sent
  as `null`; so is an optional date left empty, and an optional number left empty.
- A blank required value reports only `Must not be blank`; the format check and any `.refine` do not
  run on it.
- `oneOf` takes a `const` tuple (`["WHITE", "YELLOW"] as const`). Its input also accepts `""`, so a
  create's `defaultValues` can start a select at its placeholder.
- **An optional choice** is `oneOf(values).optional()` or `id().optional()`: the select sits at its
  placeholder (`""`, so `defaultValues` is `record.labelId ?? ""`, or `inputOf(record.labelId)`),
  and the parsed value, which is what the mutation sends, is `null` (a `*string` left nil on the
  server). Give the select a `placeholder` that says what none means (`No
  label`); write no `.transform` of your own.
- The types, for annotating your own helpers: `TextRule<Out>` (`text`, `email`, `url`, `phone`),
  `DateRule<Out>`, `TimeRule<Out>`, `ChoiceRule<V, Out>` (`oneOf`, `id`), `NumberRule<Out>`; `AfterRule<Shape>` is `after()`'s second argument; `Out` is the output, `string | null` or `number | null` once
  optional.

Check a rule across fields with `.refine` on the object; `path` puts the message under that field:

```ts
import { date } from "@jwcarman/roux-web/form";
import { z } from "zod";

export const termSchema = z
  .object({ startsOn: date(), endsOn: date() })
  .refine((term) => term.endsOn >= term.startsOn, { path: ["endsOn"], error: "Must not be before the start" });
```

#### One field after another

"Ends after it starts" is `after()` in the browser, with one message, `Must be after {other}`,
under the later field, and the same check on the server. Do not write it as a `.refine` with a
message of your own:

```ts
export const slotRequestSchema = after(z.object({ startsAt: time(), endsAt: time() }), {
  field: "endsAt",
  other: "startsAt",
});
```

```go
if in.StartsAt.Valid && in.EndsAt.Valid && in.EndsAt.Microseconds <= in.StartsAt.Microseconds {
	bad("endsAt", problem.MustBeAfter("starts at"))
}
```

- `{other}` is the earlier field's name as words (`startsAt` is `starts at`: `Must be after starts at`).
  To say `Must be after the start time`, give both sides the label: `after(schema, { ...,
  otherLabel: "the start time" })` and `problem.MustBeAfter("the start time")`.
- It works for times, dates and numbers; a date-time input's `YYYY-MM-DDTHH:mm` too in the browser.
  Equal is not after.
- An empty field is left to its own rule (`time()`), so the person sees one mistake at a time: the
  server skips the comparison when either side is missing or already wrong.
- Call `after()` last: like `.refine`, it returns Zod's own schema. `contracts/after.json` keeps
  the browser's messages; roux's Go side has no `after` helper yet.

### Dates and times

roux-web's date library is date-fns (a peer dependency). The wire format stays an ISO string: a
date is `2026-11-17`, a time of day is `18:30` (what a `type="time"` input holds), an instant is an
ISO string (Go's `time.Time` in JSON). Use date-fns directly for
arithmetic and display (`addDays`, `isAfter`, `format`; a week's first day is `firstDayOfWeek`, the organization's); do not write your own date
arithmetic. A business date's "today" is the organization's `today()`, never `new Date()`, and
display goes through `formatDate`, `formatTime` and `formatDateTime` ([Dates and time](dates-and-time.md)).
To go between the strings and Dates, `@jwcarman/roux-web/dates` has four strict helpers
(`undefined` when the text is not a real date or time, never a rolled-over one):

```ts
import { formatIsoDate, formatIsoTime, parseIsoDate, parseIsoTime } from "@jwcarman/roux-web/dates";

function parseIsoDate(iso: string): Date | undefined; // "2026-11-17" as local midnight; "2026-02-30" is undefined
function formatIsoDate(date: Date): string; // the local calendar day, "2026-11-17"
function parseIsoTime(iso: string): Date | undefined; // "18:30" or "18:30:00", on an arbitrary day
function formatIsoTime(date: Date): string; // "18:30"
```

A time of day is `time()` with a `type="time"` input. On the server it is a `time` column, read
into a `pgtype.Time` and answered as `"18:30"` ([Dates and time](dates-and-time.md)). Start the
form with `timeInputOf(record.startsAt)` (`18:30:00` as `18:30`; `null` as `""`) and show it with
`formatTime(iso)`. A time the server cannot read (`6pm`) is a field error, `Is not in the
expected format`, as the browser's rule says (`contracts/time.json` holds the browser's cases):

```tsx
const slotSchema = z.object({ title: text().max(120), startsAt: time(), endsAt: time().optional() });

<form.AppField name="startsAt">{(f) => <f.InputField label="Starts" type="time" />}</form.AppField>;
```

For example, the most recent Tuesday up to today, as a date input holds it:
`formatIsoDate(previousTuesday(parseIsoDate(today())!))` with date-fns's `previousTuesday` (`today()`
itself for today).

### Write a rule the helpers lack

A choice among ids loaded at run time (a select of labels from a query) is `id()`: `labelId: id()`. There
is no helper for a boolean, a date-time or a text with a format of your own. Write the Zod schema
yourself, in the server's words, and register it in `fieldRules` so its field shows the required
indicator:

```ts
import { fieldRules } from "@jwcarman/roux-web/form";
import { z } from "zod";

/** A required code of three capitals, as the server's `regexp.MustCompile(`^[A-Z]{3}$`)` checks it. */
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

The label form, for both a new label and an edit, in `src/labels/LabelFormDialog.tsx`:

```tsx
import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { LABEL_COLOURS, createLabel, labelRequestSchema, updateLabel, type Label } from "./labels";

/** "New label", or "Edit" for the label given (at the version shown), in a dialog. */
export function LabelFormDialog({ label, trigger }: { label?: Label; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: labelRequestSchema,
    defaultValues: label ? { name: label.name, colour: label.colour } : { name: "", colour: "" },
    mutation: label ? updateLabel(label.id, label.version) : createLabel,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog form={form} title={label ? `Edit ${label.name}` : "New label"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={LABEL_COLOURS} placeholder="Choose a colour" />}
      </form.AppField>
    </FormDialog>
  );
}
```

Used as `<LabelFormDialog trigger={<Button>New label</Button>} />` above the list, and
`<LabelFormDialog label={label} trigger={<Button variant="outline">Edit</Button>} />` on each row.

What the user gets with no more code:

- The name field is marked required and takes at most 40 characters (`required` and `maxLength` come
  from the schema); the colours read `White`, `Yellow`, ... (bare values are humanized).
- `Must not be blank` under the name when it is left empty, once the field is left or Save is pressed.
- A save trims the name, sends `{ name, colour }` through `createLabel` or `updateLabel`, waits for the
  label list to refetch, toasts `Label was saved`, and closes the dialog.
- The server's `problem.InvalidField("name", "Another label has this name")` shows under the name
  field, and the dialog stays open.
- A label someone else saved meanwhile is refused (409); the form starts over from their label
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
| `mutation` | The `mutationOptions` that saves `z.output<S>`. Build it on every render (`updateLabel(label.id, label.version)`). |
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
for text, `numberInputOf` for a `NumberField`, `timeInputOf` for a time of day in a `type="time"`
input, and `dateTimeInputOf` for an ISO instant shown in a `type="datetime-local"` input:

```ts
function inputOf(value: string | null): string; // null as ""
function numberInputOf(value: number | null): number | undefined; // null as undefined
function timeInputOf(iso: string | null): string; // a time of day as a time input's value (HH:mm); null as ""
function dateTimeInputOf(iso: string | null): string; // an ISO instant as a datetime-local value, in the browser's time zone; null as ""
```

For a contact (a supplier, a venue) whose `email` and `phone` may be `null`:

```ts
defaultValues: {
  name: contact.name,
  email: inputOf(contact.email),
  phone: inputOf(contact.phone),
  addedOn: contact.addedOn,
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
import { LABEL_COLOURS, createLabel, labelRequestSchema } from "./labels";

/** Opens the new-label dialog when the page has no labels yet, as well as from its button. */
export function FirstLabelDialog({ empty }: { empty: boolean }) {
  const [open, setOpen] = useState(empty);
  const form = useSchemaForm({ schema: labelRequestSchema, defaultValues: { name: "", colour: "" }, mutation: createLabel });
  return (
    <FormDialog form={form} title="New label" trigger={<Button>New label</Button>} open={open} onOpenChange={setOpen}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={LABEL_COLOURS} placeholder="Choose a colour" />}
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
import { contactRequestSchema, updateContact, type ContactDetail } from "./contacts";

/** A contact's details, edited in place at the version shown. */
export function ContactDetailsForm({ contact }: { contact: ContactDetail }) {
  const form = useSchemaForm({
    schema: contactRequestSchema,
    defaultValues: {
      name: contact.name,
      email: inputOf(contact.email),
      phone: inputOf(contact.phone),
      addedOn: contact.addedOn,
    },
    mutation: updateContact(contact.id, contact.version),
    onSuccess: () => notify.success("Contact saved"),
    failure: "Could not save the contact",
  });

  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="4" maxW="md">
          <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
          <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" />}</form.AppField>
          <form.AppField name="phone">{(f) => <f.InputField label="Phone" type="tel" />}</form.AppField>
          <form.AppField name="addedOn">{(f) => <f.InputField label="Added" type="date" />}</form.AppField>
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

with, in `src/contacts/contacts.ts` beside `contactsApi` ([API client](api-client.md)):

```ts
import { mutationOptions } from "@tanstack/react-query";
import { date, email, phone, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** A contact as `/api/contacts/{id}` answers it. */
export interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addedOn: string;
  version: number;
}

/** ContactRequest's rules (without the version), in the server's words. */
export const contactRequestSchema = z.object({
  name: text().max(80),
  email: email().max(320).optional(),
  phone: phone().max(30).optional(),
  addedOn: date(),
});

/** What a contact form sends: trimmed, a blank email or phone as null. */
export type ContactRequest = z.output<typeof contactRequestSchema>;

/** Saves a contact at the `version` it was read at; a change made since answers 409. */
export const updateContact = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: ContactRequest) => contactsApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.contacts.detail(id), queryKeys.contacts.lists()] },
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

Every field type in one form: an event, with a label. The schema, in `src/events/events.ts` (with
`eventsApi` and `createEvent` beside it, as in the labels module):

```ts
import { date, id, integer, number, oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";

export const SESSIONS = ["MORNING", "EVENING"] as const;

/** EventRequest's rules, in the server's words. */
export const eventRequestSchema = z.object({
  labelId: id(),
  day: date(),
  session: oneOf(SESSIONS),
  places: integer().min(1).max(40),
  cost: number().min(0).optional(),
  open: z.boolean(),
  notes: text().max(500).optional(),
});

export type EventRequest = z.output<typeof eventRequestSchema>;
```

```tsx
import { Button } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { labelsQuery } from "../labels/labels";
import { createEvent, eventRequestSchema } from "./events";

/** Schedules an event: when, under which label, how many places. */
export function NewEventDialog() {
  const labels = useQuery(labelsQuery);
  const form = useSchemaForm({
    schema: eventRequestSchema,
    defaultValues: {
      labelId: "",
      day: "",
      session: "MORNING",
      places: undefined,
      cost: undefined,
      open: false,
      notes: "",
    },
    mutation: createEvent,
    onSuccess: () => notify.success("Event scheduled"),
    failure: "Could not schedule the event",
  });
  const labelOptions = (labels.data ?? []).map((label) => ({ value: label.id, label: label.name }));

  return (
    <FormDialog
      form={form}
      title="Schedule an event"
      trigger={<Button>Schedule an event</Button>}
      submitLabel="Schedule"
    >
      <form.AppField name="labelId">
        {(f) => <f.SelectField label="Label" options={labelOptions} placeholder="Choose a label" />}
      </form.AppField>
      <form.AppField name="day">{(f) => <f.InputField label="Date" type="date" />}</form.AppField>
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
      <form.AppField name="cost">
        {(f) => <f.NumberField label="Cost" min={0} step={0.5} helperText="Leave empty when it is free" />}
      </form.AppField>
      <form.AppField name="open">{(f) => <f.CheckboxField label="Open to guests" />}</form.AppField>
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

1. **The server** keeps a `version` on the row and takes the one the client read in the request. It
   refuses a missing version (`400` on `version`) and, when they differ, answers
   `problem.StaleVersion()`: `409` with `This record changed since you loaded it`
   ([Errors](errors.md#refuse-a-stale-save)).
2. **The mutation** carries the version it was built with, and refreshes the queries the record comes
   from:

   ```ts
   export const updateLabel = (id: string, version: number) =>
     mutationOptions({
       mutationFn: (request: LabelRequest) => labelsApi.update(id, { ...request, version }),
       meta: { refreshes: [queryKeys.labels.detail(id), queryKeys.labels.lists()] },
     });
   ```

3. **The form** is given the record's values and `updateLabel(label.id, label.version)` on every render.

What `useSchemaForm` then does:

- While the form is untouched it follows the record: a refetch that brings a newer label shows it, and
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

A create has no version; its 409 (`problem.Conflict`, or a unique violation) is toasted, and what
was typed is kept. A clash on one field the person typed should be `problem.InvalidField` on that
field instead, so it lands under the field ([Errors](errors.md#refuse-one-field-the-client-sent)).

## Split a long form

Pass a `useSchemaForm` form to a section component typed with `SchemaForm<typeof schema>`:

```tsx
import type { SchemaForm } from "@jwcarman/roux-web/form";
import type { contactRequestSchema } from "./contacts";

/** The contact form's contact section. */
export function ContactFields({ form }: { form: SchemaForm<typeof contactRequestSchema> }) {
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

`useSchemaForm` covers create and edit. A form whose submit is something else (a sign-in link, a
client-side filter) uses `useAppForm`, the hook `useSchemaForm` is built on: TanStack Form's
`useForm` with roux's fields and form components. Validate with a Zod schema at the form level, as
`useSchemaForm` does, and the fields still read `required` and `maxLength` from it:

```tsx
import { Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { createAuthClient } from "@jwcarman/roux-web/auth";
import { notify } from "@jwcarman/roux-web/feedback";
import { email, useAppForm } from "@jwcarman/roux-web/form";
import { z } from "zod";

const auth = createAuthClient(); // sign-in's endpoints, typed

/** The address to email a sign-in link to. */
const linkRequestSchema = z.object({ email: email() });

/** Emails a sign-in link: a call to sign-in, not a save. */
export function EmailLinkForm() {
  const [sent, setSent] = useState(false);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onBlur: linkRequestSchema, onSubmit: linkRequestSchema },
    onSubmit: async ({ value }) => {
      const result = await auth.email.send(value.email);
      if (result.ok) {
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

Use it as `<form.AppField name="open">{() => <SwitchField label="Open to guests" />}</form.AppField>`.
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

Gaps that a builder hits:

- **A nullable record field needs `inputOf` in `defaultValues`.** An optional text's input is
  `string`, so `email: contact.email` (`string | null`) does not compile (`Type 'string | null' is
  not assignable to type 'string'`). Use `inputOf`, `numberInputOf`, `timeInputOf` or `dateTimeInputOf`.
- **`url()` rejects a host without a dot**, such as `http://localhost:8080`, and **`email()` rejects a
  domain without a dot**, such as `ann@localhost`, though Go's `net/url` and `net/mail` accept both.
  Where such values are valid, write that field's schema with Zod and register it in `fieldRules`
  ([Write a rule the helpers lack](#write-a-rule-the-helpers-lack)).
- **Call `.max()` and `.optional()` before `.refine()`.** A `.refine` returns Zod's copy of the rule,
  without roux's methods: `text().refine(check).optional()` still refuses a blank value, while
  `text().optional().refine(check)` accepts it as `null`. The field's `required` and `maxLength` do
  survive a `.refine`.
- **A field's schema must be one of roux's rules.** A field of a schema form whose schema is plain
  Zod (`z.string()`), or a rule behind a `.transform` or `.pipe`, throws when it renders, naming the
  field: it could show neither its required indicator nor its `maxLength`. Build it with a helper,
  keep transforms out of form schemas, or end your own rule with `.register(fieldRules, {
  required })`. A checkbox's `z.boolean()` is the exception.
- **`useServerAction`'s `failure` cannot tell a 409 apart.** It is a string or a function of the
  variables, not of the error, so every refusal of a button gets the same title; the server's
  `detail` under it says what happened.
- **A `useAppForm` form has no public helper to place a refusal's field errors.** Use
  `placeFieldErrors` above.
- **`withForm` does not accept a `useSchemaForm` form** (a type error); type a section's prop as
  `SchemaForm<typeof schema>` instead.
- **`FormDialog` needs a `trigger` even when controlled.**
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
