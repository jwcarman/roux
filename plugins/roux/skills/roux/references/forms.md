# Forms beyond the recipe

The common create/edit dialog is `feature.md` step 10. This card covers the rule helpers, every
field, a form on a page, 409s, and forms that don't save through a mutation.

## Rules

- Schemas come from `@jwcarman/roux-web/form`'s helpers; their messages are the server's, word for
  word. Never `z.string().min(1, "...")` where a helper exists.
- Call `.max()` and `.optional()` before any `.refine()`; keep `.transform`/`.pipe` out of form
  schemas (they hide `required` and `maxLength`).
- Build `defaultValues` and `mutation` from the current record on every render; never hold them in
  state, `useMemo` or a ref, or a 409 repeats forever.
- The form catches nothing, toasts nothing, resets nothing: `useSchemaForm` and `FormDialog` do it.

## Names: rule helpers

Each helper's words are the server's; the server's `validate` (`feature.md` step 3) checks the same
rule:

| Helper | Input | The server's check in `validate` |
| --- | --- | --- |
| `text()` | trimmed string | trimmed, then `problem.MustNotBeBlank` when empty |
| `email()` | trimmed | `net/mail.ParseAddress`, else `problem.ValidEmail` |
| `url()` | trimmed, http(s) | `net/url.Parse` with an `http`/`https` scheme and a host, else `problem.ValidURL` |
| `phone()` | trimmed, ≥ 7 digits | no Go helper yet: the pattern in roux's `contracts/phone.json` as a `regexp`, else `problem.BadFormat` |
| `date()` | `YYYY-MM-DD` | `time.Parse(time.DateOnly, s)`, else `problem.BadFormat`; missing `problem.MustNotBeEmpty` |
| `time()` | `HH:mm` | `time.Parse("15:04", s)`, else `problem.BadFormat` |
| `number()` / `integer()` | `number \| undefined` | a `*float64` / `*int64` that is not nil |
| `oneOf(values)` | select value, `""` placeholder | `slices.Contains(values, v)`, else `problem.MustBeOneOf(values...)` |
| `id()` | select over loaded ids | `uuid.Parse`, and that the row exists |
| `money()` | see `money.md` | `money.Check` |

Methods: `.max(n)` (text: `problem.MustBeBetween(1, n)` when required, `(0, n)` when optional;
numbers: `problem.MustBeAtMost(n)`), `.min(n)` (`problem.MustBeAtLeast(n)`), `.notInFuture()` on
`date` (the server compares with the organization's today, `problem.MustNotBeInFuture`; never
`time.Now()`), `.optional()` (empty → `null`; on the server a nil pointer passes).
Rule types for your own helpers: `TextRule`, `DateRule`, `TimeRule`, `ChoiceRule`, `NumberRule`,
`AfterRule`.

**Two fields in order:** in the browser, last:

```ts
export const termSchema = after(z.object({ startsOn: date(), endsOn: date() }), {
  field: "endsOn",
  other: "startsOn",
  otherLabel: "the start date",
});
```

and in `validate`, when both sides are present and valid (an empty field is left to its own rule):

```go
if !in.EndsOn.IsZero() && !in.StartsOn.IsZero() && !in.EndsOn.After(in.StartsOn) {
	bad("endsOn", problem.MustBeAfter("the start date"))
}
```

The message is `Must be after {other}` (`startsOn` → `Must be after starts on` without a label);
give both sides the same label. Equal is not after. Works for dates, times, instants and numbers.

**A rule no helper covers:** write Zod in the server's words and register it in `fieldRules`:

```ts
export const code = z.string().trim()
  .min(1, { error: "Must not be blank", abort: true })
  .regex(/^[A-Z]{3}$/, { error: "Is not in the expected format" })
  .register(fieldRules, { required: true });
```
 `fieldRules` holds a
`FieldRule` (`{ required, maxLength? }`). A checkbox is `z.boolean()`.

## Names: fields

Inside `form.AppField name="..."`, the child gets `f` with: `f.InputField` (`type` `date`,
`time`, `email`, `tel`, `datetime-local`...), `f.TextAreaField`, `f.NumberField` (`min`, `max`,
`step` limit the stepper only), `f.SelectField` (`options`: bare values humanized, or objects `{ value, label }` typed `Option`; `labels`; `placeholder`), `f.RadioGroupField` (`options`, `orientation`),
`f.CheckboxField`, and `MoneyField` (`money.md`). All take `label` (required), `helperText`,
`required`. Props types: `InputFieldProps`, `TextAreaFieldProps`, `NumberFieldProps`,
`SelectFieldProps` (values are `SelectValue`: string, number or boolean), `RadioGroupFieldProps`,
`CheckboxFieldProps`, `FormFieldProps`. The same components are exported by name (`InputField`,
`TextAreaField`, `NumberField`, `SelectField`, `RadioGroupField`, `CheckboxField`) for tests.

`defaultValues` from a record: `inputOf(v)` (null → `""`), `numberInputOf(v)` (null → `undefined`),
`timeInputOf(iso)` (`18:30:00` → `18:30`), `dateTimeInputOf(iso)`. A create's blanks: `""`,
`undefined` for numbers, `false` for a checkbox.

## Names: hooks and components

- `useSchemaForm({ schema, defaultValues, mutation, onSuccess?, failure? })` (`SchemaFormOptions`)
  returns a `SchemaForm<S>`: TanStack Form plus `restart()` and `onSaved(listener)`.
- `FormDialog` (`FormDialogProps`: `form`, `title`, `trigger`, `submitLabel?`, `open?`,
  `onOpenChange?`). It takes a `DialogForm`. Controlled only when the page opens it from code; still
  needs `trigger`.
- On a page: `form.AppForm` › `form.Form` › fields, `form.SubmitButton`, `form.ResetButton`,
  `form.SubmittingIndicator` (also exported as `Form`, `SubmitButton`, `ResetButton`,
  `SubmittingIndicator`).
- A long form: pass the form to sections typed `SchemaForm<typeof schema>` (not `withForm`, which
  takes only `useAppForm` forms).
- Not a save (a sign-in link, a filter): `useAppForm({ defaultValues, validators: { onBlur: schema,
  onSubmit: schema }, onSubmit })`. Place a 400's field errors with `fieldErrorsOf(problem)` and
  `form.setFieldMeta(name, (m) => ({ ...m, errorMap: { ...m.errorMap, onServer: message } }))`.
- A custom control: `FormField` (`label`, `helperText`, `required`, `controlLabelled`) with
  `useFieldContext<T>()` inside `form.AppField`; `useFormContext()` reads the form;
  `errorMessages(errors)` when drawing errors yourself. `fieldContext` and `formContext` are the
  contexts; never build another hook with `createFormHook`.

## Dates and times in forms

Wire: `LocalDate` `2026-11-17`, `LocalTime` `18:30` (server writes `18:30:00`). Convert with
`parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime` (`/dates`; `undefined` for an
unreal date). Arithmetic with date-fns. Today is the organization's `today()` (`dates.md`).

## 409s

The edit mutation carries the `version` it was built with and refreshes the record's queries. On
a 409 the form toasts `This record changed since you loaded it`, refetches, and starts over from
the newer record. For that, `meta.refreshes` must name the query the form's record came from: a
dialog opened from a list row needs `lists()`.

## Check

`npm test` with a form test per dialog: client rule in the server's words and nothing sent; the
request body (trimmed, `""` as `null`); a server field error under its field; `stale()` toasts.

## Pitfalls

- `email: contact.email` where it may be `null` doesn't compile: use `inputOf`.
- A schema key with no field refuses every submit.
- A field whose schema is plain Zod (`z.string()`), or a rule behind `.transform`/`.pipe`, throws
  when it renders, naming the field; only a checkbox's `z.boolean()` may be plain.
- `url()` rejects `http://localhost:8080`, `email()` rejects `ann@localhost`: write that field's Zod
  and register it where those are valid.
- `integer()`'s `Must be a whole number` exists only in the browser.
