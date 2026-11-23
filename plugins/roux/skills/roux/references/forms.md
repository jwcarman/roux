# Forms beyond the recipe

The common create/edit dialog is `feature.md` steps 7–8. This card covers the rule helpers, every
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

| Helper | Input | Mirrors |
| --- | --- | --- |
| `text()` | trimmed string | `@NotBlank` |
| `email()` | trimmed | `@NotBlank @Email` |
| `url()` | trimmed, http(s) | `@NotBlank @URL` |
| `phone()` | trimmed, ≥ 7 digits | `@NotBlank @Phone` (`Phone.PATTERN`) |
| `date()` | `YYYY-MM-DD` | `@NotNull LocalDate` |
| `time()` | `HH:mm` | `@NotNull LocalTime` |
| `number()` / `integer()` | `number \| undefined` | `@NotNull` |
| `oneOf(values)` | select value, `""` placeholder | `@NotNull` enum |
| `id()` | select over loaded ids | `@NotNull UUID` |
| `money()` | see `money.md` | |

Methods: `.max(n)` (text: `@Size(max = n)`; numbers: `@Max`), `.min(n)` (`@Min`),
`.notInFuture()` on `date` (`@NotInFuture`, never `@PastOrPresent`), `.optional()` (empty → `null`).
Rule types for your own helpers: `TextRule`, `DateRule`, `TimeRule`, `ChoiceRule`, `NumberRule`,
`AfterRule`. Server validators you never reference: `AfterValidator`, `NotInFutureValidator`,
`PhoneValidator`.

**Two fields in order:** `@After(field = "endsOn", other = "startsOn")` on the request record, and in
the browser, last:

```ts
export const termSchema = after(z.object({ startsOn: date(), endsOn: date() }), {
  field: "endsOn",
  other: "startsOn",
  otherLabel: "the start date",
});
```

The message is `Must be after {other}`; with `otherLabel` on both sides (`@After(..., otherLabel =
"the start date")`) it reads `Must be after the start date`. Equal is not after. Works for dates,
times, instants and numbers.

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
- Not a save (who's sign-in, a filter): `useAppForm({ defaultValues, validators: { onBlur: schema,
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

- `email: student.email` where it may be `null` doesn't compile: use `inputOf`.
- A schema key with no field refuses every submit.
- `url()` rejects `http://localhost:8080`, `email()` rejects `ann@localhost`: write that field's Zod
  and register it where those are valid.
- `integer()`'s `Must be a whole number` exists only in the browser.
