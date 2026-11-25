# Money

An amount is a whole number of the currency's minor units plus a currency, everywhere: Go, the
database, the wire and the browser. An app has one currency, `ORG_CURRENCY`.

## Rules

- No `float64` for an amount; never send major units (`150.0`) or a formatted string; never parse
  or do arithmetic on a formatted string.
- The server computes amounts it records (a payment = the server's price × periods); the browser
  only shows them.
- Store the amount a record was made at (a payment's amount, not the plan's price now).
- Sum in SQL over the minor units, then build `money.Money` from the sum and the app's currency.

## Names

- Setting: `ORG_CURRENCY=USD` (ISO 4217; an unknown code stops startup). The users module reads it
  into `k.Organization().Currency` (`*string`, nil when unset) and the browser's context.
- `money.Money{MinorUnits: 15000, Currency: "USD"}` (package `github.com/jwcarman/roux/money`):
  `money.Zero(cur)`, `m.Times(n)` and `m.Plus(o)` (each returns an error: overflow, or two
  currencies), `m.IsPositive()`, `m.Format(locale)` for server-written text (pass
  `k.Organization().Locale`). `money.Currency`, `money.ParseCurrency(code)`, `cur.Digits()`.
  JSON: `{ "minorUnits": 15000, "currency": "USD" }`; a missing or fractional `minorUnits` or an
  unknown currency is a `400`.
- Rules for `validate`: `money.Check(field, m, rules...)` returns a `problem.Violation` per failed
  rule: `money.In(cur)` (`Must be in USD`), `money.Positive` (`Must be more than 0`),
  `money.PositiveOrZero` (`Must not be negative`). A rule is a `money.Rule` (`func(Money) string`, ""
  when it passes); the messages are `money.MustBeMoreThanZero` and the others, and
  `money.MustBeIn(cur)`.
- Browser, `/money`: `Money`, `formatMoney(money)` (`"$150.00"`, organization's locale),
  `timesMoney(money, n)`, `currencySymbol(currency)`.
- Browser, `/form`: `money()` (a `MoneyRule`; `.positive()` ↔ `money.Positive`, `.optional()`),
  `f.MoneyField` (`MoneyField`, `MoneyFieldProps`: `label`), `moneyInputOf(money)` for defaults.

## Steps: an amount on a record

1. Migration: two columns per amount.

   ```sql
   price_minor_units bigint not null,
   price_currency    text   not null check (char_length(price_currency) = 3),
   ```
2. The module reads the currency at `Mount`:

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
3. Input: the body member is `Price *money.Money`; in `validate`, a missing one is
   `problem.MustNotBeEmpty`, else
   `v = append(v, money.Check("price", *b.Price, money.Positive, money.In(s.Currency))...)`.
4. Service: write `price.MinorUnits, price.Currency`; read back with
   `row.Scan(..., &p.Price.MinorUnits, &p.Price.Currency)`. The answer's field is `money.Money`.
5. Module (browser): `price: money().positive()` in the schema; `price: Money` on the interface.
6. Dialog: `defaultValues: plan ? { price: moneyInputOf(plan.price) } : { price: "" }` and
   `<form.AppField name="price">{(f) => <f.MoneyField label="Price" />}</form.AppField>`.
7. Table cell: `formatMoney(row.original.price)`, right-aligned.

## Check

Go test: a price in another currency is a field error `Must be in USD`; zero is `Must be more than
0`. Form test: typing `150.50` sends `{ "minorUnits": 15050, "currency": "USD" }`.

## Pitfalls

- `numeric` or `real` columns for an amount: store `bigint` minor units.
- Without `ORG_CURRENCY`, `k.Organization().Currency` is nil and the browser has no currency: stop
  at `Mount` with a message naming the setting.
- `Plus` of two currencies and `Times` past `int64` return errors: return them, don't ignore them.
