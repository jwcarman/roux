# Forms: fields on a surface, rules in Validate

A form is part of a surface (`feature.md` step 7): a `Form` holding `InputField`s and `SelectField`s
bound to a `local` draft, and a `Button` whose event runs a command. The server's `Validate` is the
gate; a field's `@checks` repeat its rules in the browser, in roux's words. This card is the
fields, the rules on both sides, and the names of the React form layer the catalog is built on.

## Rules

- A form's values live in a `local` (`/draft`), its server errors in another (`/errors`) with the
  same members; the button's event `context` carries each value, and the binding's `command(...,
  { errors: d.errors, onSuccess: [{ reset: d.draft }] })` places field problems and clears the
  draft.
- `Validate` (the command's `cqrs.Input`) checks every rule and answers every mistake at once with
  `problem.Validation`, each violation's `Field` the input's JSON member: the surface shows it under
  the field whose `serverError` is bound to `/errors/<member>`.
- Messages are roux's words, never retyped variations: in Go the `problem` constants and functions,
  in a check's `message` the same text (`Must not be blank`).
- Client checks show on blur but don't block a submit (this round): the server's answer is what
  stops a bad save.
- A rule about stored data (a unique name, a state) is the domain service's, raised as
  `problem.InvalidField(field, message)`; it shows under the field the same way.

## Fields

```json
{
  "id": "draftDay",
  "component": "InputField",
  "label": "Day",
  "type": "date",
  "required": true,
  "helperText": "The day it is due",
  "value": { "@path": "/draft/day" },
  "serverError": { "@path": "/errors/day" },
  "@checks": [
    { "condition": { "@call": "required", "args": { "value": { "@path": "/draft/day" } } }, "message": "Must not be empty" }
  ]
}
```

- `InputField`: `type` `text` (default), `email`, `tel`, `date` (`yyyy-mm-dd` in the draft), `time`
  (`HH:mm`). `SelectField`: `options` `[{ value, label }]` (values spelled as the Go side spells
  them), `placeholder`. Both: `label`, `value`, `required`, `helperText`, `serverError`, `@checks`.
- Every field is inside a `Form`; the button is in the same `Form`.
- A value is text in the draft: a blank field sends `""`. The input type takes pointers
  (`*string`), so `Validate` treats `""` and a missing member alike, and parses what it needs
  (`time.Parse(time.DateOnly, s)`).
- Checks (`@call`): `required`, `length` (`min`, `max`), `regex` (`pattern`), `email`, `numeric`
  (`min`, `max`); each `args` names the `value` path it checks.

## The rules on both sides

| `Validate` (Go) | Its words | A field's `@checks` |
| --- | --- | --- |
| trimmed, empty → `problem.MustNotBeBlank` | `Must not be blank` | `required` |
| over the limit → `problem.MustBeBetween(1, n)` | `Must be between 1 and n characters` | `length` with `max` |
| `slices.Contains(values, v)`, else `problem.MustBeOneOf(values...)` | `Must be one of a, b` | (a `SelectField` offers only those) |
| `net/mail.ParseAddress`, else `problem.ValidEmail` | `Must be a valid email address` | `email` |
| `time.Parse(time.DateOnly, s)`, else `problem.BadFormat` | `Is not in the expected format` | `type: "date"` |
| a required date missing → `problem.MustNotBeEmpty` | `Must not be empty` | `required` |
| two fields in order → `problem.MustBeAfter("the start date")` | `Must be after the start date` | none: the server's |
| a value it can't read → `problem.InvalidValue` | `Invalid value` | none |

Two fields in order, in `Validate`, when both are present and valid (an empty field is left to its
own rule):

```go
if !in.endsOn.IsZero() && !in.startsOn.IsZero() && !in.endsOn.After(in.startsOn) {
	v = append(v, problem.Violation{Field: "endsOn", Message: problem.MustBeAfter("the start date")})
}
```

## Editing a record

Not this round on a surface: there are no detail surfaces (route parameters) or modals yet, so a
form that edits one record stays out of surfaces until they come. When it comes, the command's input
carries the `version` it was read at and the service answers `problem.StaleVersion()` (`409`) when
it no longer matches (`cqrs.md`, "Stale writes").

## The React form layer

`@jwcarman/roux-web/form` is what the catalog's `Form`, `InputField` and `SelectField` and roux's
built-in pages (sign-in, users, appearance) are built with. A feature's screen does not use it:
it matters when adding a primitive (`surfaces.md`).

- Rule helpers, each in the server's words: `text()`, `email()`, `url()`, `phone()`, `date()`,
  `time()`, `number()`, `integer()`, `oneOf(values)`, `id()`, `money()` (`money.md`), with `.max(n)`,
  `.min(n)`, `.notInFuture()`, `.optional()`; `after(schema, { field, other, otherLabel })` for two
  in order. Rule types: `TextRule`, `DateRule`, `TimeRule`, `ChoiceRule`, `NumberRule`, `AfterRule`;
  `fieldRules` holds each schema's `FieldRule` (`{ required, maxLength? }`).
- `useSchemaForm({ schema, defaultValues, mutation, onSuccess?, failure? })` (`SchemaFormOptions`)
  returns a `SchemaForm<S>` (`restart()`, `onSaved(listener)`); `FormDialog` (`FormDialogProps`)
  takes a `DialogForm`; `useAppForm` for a form that doesn't save; `fieldErrorsOf(problem)`. A
  long form's sections take a `SchemaForm<typeof schema>`, not `withForm` (which takes only
  `useAppForm` forms).
- Fields: `InputField`, `TextAreaField`, `NumberField`, `SelectField` (values are `SelectValue`,
  options `Option`), `RadioGroupField`, `CheckboxField`, `MoneyField`, with `InputFieldProps`,
  `TextAreaFieldProps`, `NumberFieldProps`, `SelectFieldProps`, `RadioGroupFieldProps`,
  `CheckboxFieldProps`, `FormFieldProps`; `Form`, `SubmitButton`, `ResetButton`,
  `SubmittingIndicator`.
- A custom control: `FormField` with `useFieldContext<T>()`; `useFormContext()`;
  `errorMessages(errors)`; `fieldContext` and `formContext`.
- Inputs from records: `inputOf(v)`, `numberInputOf(v)`, `timeInputOf(iso)`, `dateTimeInputOf(iso)`.
- Dates on the wire: `parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime` (`/dates`).

## Check

Go: a test per rule of `Validate` (`400` naming the field), and per service rule. Vitest, through
the route: the command's body (`added`), a server field error under its field (`invalidFields`),
the draft cleared and the toast after a success (`feature.md` step 10).

## Pitfalls

- A field whose `serverError` isn't bound, or `errors` without that member: the server's message
  becomes a toast instead of showing under the field.
- A violation's `Field` that differs from the input's JSON member (`Name` for `name`): the same.
- A draft member the event's `context` doesn't send: the command never gets it.
- `@checks` words that differ from the server's: the person sees two messages for one rule.
- A `SelectField` option spelled differently from Go's list: every save is a `400`.
