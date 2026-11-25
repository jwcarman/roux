# Money

A roux app keeps money as a whole number of the currency's **minor units** (cents for USD, none for
JPY) and a currency, everywhere: in Go, in the database, on the wire and in the browser. Nothing
passes through a float or a formatted string. An app has one currency, `ORG_CURRENCY`.

## Turn it on

Set the organization's currency (an ISO 4217 code) in the environment:

```bash
ORG_CURRENCY=USD
```

The users module reads it (an unknown code stops startup), and the organization's context carries
the currency and its digits to the browser (`"currency": "USD", "fractionDigits": 2`;
[Dates and time](dates-and-time.md)). Without it the context's currency is `null`. A module listed
after the users module (whose `Mount` sets `k.Organization`) reads it from the kit:

```go
func (m Module) Mount(_ context.Context, k *app.Kit) error {
	cur := k.Organization().Currency // *string: nil when ORG_CURRENCY is not set
	if cur == nil {
		return errors.New("plans: set ORG_CURRENCY, the currency plans are priced in")
	}
	Register(k, Service{Pool: k.Pool, Currency: money.Currency(*cur)})
	return nil
}
```

## The value: `money.Money`

`money.Money{MinorUnits: 15000, Currency: "USD"}` is an amount (package
`github.com/jwcarman/roux/money`):

- `money.Zero(cur)`: no money in `cur`;
- `m.Times(n)`: a price for `n` periods, or an error if the product does not fit;
- `m.Plus(o)`: the two together, same currency only, else an error;
- `m.IsPositive()`;
- `m.Format(locale)`: `"$150.00"` in `en-US`, for text the server writes (a history entry, an
  email); pass the organization's locale (`k.Organization().Locale`). The browser formats its own
  (`formatMoney`).
- `money.ParseCurrency(code)` checks a code is a known ISO 4217 currency in capitals;
  `cur.Digits()` is its minor-unit digits (2 for USD, 0 for JPY).

Its JSON is `{ "minorUnits": 15000, "currency": "USD" }`, both ways. Reading it refuses a missing
or fractional `minorUnits` (a client doing float arithmetic) and an unknown currency, as a `400`.

## The columns

Two columns per amount, `<name>_minor_units bigint` and `<name>_currency text`:

```sql
price_minor_units bigint not null,
price_currency    text   not null check (char_length(price_currency) = 3),
```

and back into a `money.Money` when reading:

```go
var price money.Money
if err := row.Scan(&p.ID, &p.Name, &price.MinorUnits, &price.Currency); err != nil {
	return p, err
}
```

Store the amount a record was made at (a payment's amount, not its plan's price now), so a later
price change rewrites no history. Sum in SQL over the minor units (`sum(amount_minor_units)`), and
make `Money` from the sum and the app's currency.

## Check a request's amount

`money.Check(field, m, rules...)` runs every rule and returns a field error for each that fails,
for the input's `validate`:

```go
v = append(v, money.Check("price", b.Price, money.Positive, money.In(s.Currency))...)
```

- `money.In(cur)`: `Must be in USD` (the app's currency; the words are `money.MustBeIn(cur)`).
- `money.Positive`: `Must be more than 0` (`money.MustBeMoreThanZero`). `money.PositiveOrZero`:
  `Must not be negative`.
- A rule of your own is a `money.Rule`, `func(money.Money) string`, answering `""` when it passes.

A body member that is an amount is a `money.Money` (or a `*money.Money` when it may be missing).

## In the browser

`@jwcarman/roux-web/money` has the type and display:

- `Money` (the wire shape);
- `formatMoney(money)`: `"$150.00"` in the organization's locale, right-aligned in a table cell; the
  app's own currency, with the digits the server sent in the organization's context;
- `timesMoney(money, n)`: `n` periods' price, in minor units, for a total shown before saving;
- `currencySymbol(currency)`: `"$"`.

`@jwcarman/roux-web/form` has the input:

- `money()`: the rule (a `MoneyRule`), in the context's currency and digits. The user types `150`, `150.5`, `150.50`, `1,500` or
  `$150`; the output is `Money` in the app's currency. Too many decimals, a negative or text is a field
  error in the server's words. `.positive()` matches `money.Positive`; `.optional()` makes an empty
  field `null`.
- `f.MoneyField` (`MoneyFieldProps`: `label`): a text input with the currency's symbol before it.
- `moneyInputOf(money)`: an amount as the field's text (`"150.00"`), for an edit form's defaults.

The currency is in the page before any code runs, so a money schema is an ordinary module constant:

```tsx
export const planSchema = z.object({ name: text().max(60), price: money().positive(), ... });

// in the dialog
defaultValues: plan ? { price: moneyInputOf(plan.price), ... } : { price: "", ... },
<form.AppField name="price">{(f) => <f.MoneyField label="Price" />}</form.AppField>
```

The digits come from the server on both sides (`fractionDigits`, ISO 4217), for parsing and for
display, so HUF, IDR, COP and the rest are written as the server counts them. Grouping and symbols are
the browser's (CLDR) and may differ slightly from the server's text.

`contracts/money.json` lists typed inputs and what each becomes; a contract test on each side keeps
the browser's parsing and the server's rules the same.

## Don't

- Don't use `float64` for an amount, in Go, in a column or on the wire.
- Don't send an amount as a number of major units (`150.0`) or a formatted string (`"$150.00"`).
- Don't do arithmetic on a formatted string, or parse one back.
- Don't let the browser decide an amount the server records (a payment's amount is the server's price
  times the periods); show it, and let the server compute it.
- Don't mix currencies: an app has one.
