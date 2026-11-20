# Money

A roux app keeps money as a whole number of the currency's **minor units** (cents for USD, none for
JPY) and a currency, everywhere: in Java, in the database, on the wire and in the browser. Nothing
passes through a `double`, a float or a formatted string. An app has one currency,
`roux.money.currency`.

## Turn it on

`roux-money` is in the starter. Set the app's currency (an ISO 4217 code):

```yaml
roux:
  money:
    currency: USD
```

roux then serves `GET /api/money`:

```json
{ "currency": "USD", "fractionDigits": 2 }
```

and the `MoneySettings` bean (`currency()`, `fractionDigits()`) is there to inject. Without the
setting, neither exists, and `@InCurrency` fails with
`roux.money.currency must be set to check @InCurrency`. `RouxMoneyProperties` holds the setting.

## The value: `Money`

`Money(long minorUnits, Currency currency)` is a record and an `@Embeddable`:

- `Money.of(15000, usd)`, `Money.zero(usd)`;
- `times(int n)`: a price for `n` periods (throws `ArithmeticException` on overflow);
- `plus(Money other)`: same currency only, else `IllegalArgumentException` (`Cannot add EUR to USD`);
- `isPositive()`;
- `format(Locale locale)`: `"$150.00"` in `Locale.US`, for text the server writes (a history entry, an
  email). The browser formats its own (`formatMoney`).

Its JSON is `{ "minorUnits": 15000, "currency": "USD" }`, both ways.

## The columns

Two columns per amount, `<name>_minor_units bigint` and `<name>_currency varchar(3)` (Hibernate maps
`Currency` to `varchar(3)`; a `char(3)` fails schema validation). Name them on the entity:

```java
@Embedded
@AttributeOverride(name = "minorUnits", column = @Column(name = "price_minor_units"))
@AttributeOverride(name = "currency", column = @Column(name = "price_currency"))
private Money price;
```

```xml
<column name="price_minor_units" type="bigint"><constraints nullable="false"/></column>
<column name="price_currency" type="varchar(3)"><constraints nullable="false"/></column>
```

Store the amount a record was made at (a payment's amount, not its plan's price now), so a later
price change rewrites no history. Sum in SQL over the minor units (`sum(amount_minor_units)`), and
make `Money` from the sum and the app's currency.

## Check a request's amount

```java
public record PlanRequest(
    @NotBlank @Size(max = 60) String name,
    @NotNull @PositiveMoney @InCurrency Money price,
    ...) {}
```

- `@InCurrency`: `Must be in USD` (the app's currency).
- `@PositiveMoney`: `Must be more than 0`. `@PositiveOrZeroMoney`: `Must not be negative`.

Each is a field error on the field (`price`), like `@Phone`. Their validators are
`InCurrencyValidator`, `PositiveMoneyValidator` and `PositiveOrZeroMoneyValidator`; `MoneyController`
serves `GET /api/money`.

## In the browser

`@jwcarman/roux-web/money` has the type and display:

- `Money`, `MoneySettings` (the wire shapes);
- `moneySettingsQuery`: `GET /api/money` (cached for the session);
- `formatMoney(money, locale?)`: `"$150.00"` in the reader's locale, right-aligned in a table cell;
- `timesMoney(money, n)`: `n` periods' price, in minor units, for a total shown before saving;
- `currencySymbol(currency)`: `"$"`.

`@jwcarman/roux-web/form` has the input:

- `money(settings)`: the rule (a `MoneyRule`). The user types `150`, `150.5`, `150.50`, `1,500` or
  `$150`; the output is `Money` in the app's currency. Too many decimals, a negative or text is a field
  error in the server's words. `.positive()` matches `@PositiveMoney`; `.optional()` makes an empty
  field `null`.
- `f.MoneyField` (`MoneyFieldProps`: `label`, `settings`): a text input with the currency's symbol
  before it.
- `moneyInputOf(money, settings)`: an amount as the field's text (`"150.00"`), for an edit form's
  defaults.

The form needs the settings before its schema exists, so the page loads them first:

```tsx
export function planSchema(settings: MoneySettings) {
  return z.object({ name: text().max(60), price: money(settings).positive(), ... });
}

const settings = useQuery(moneySettingsQuery).data;
{settings && <PlanFormDialog settings={settings} trigger={<Button>New plan</Button>} />}

// in the dialog
defaultValues: plan ? { price: moneyInputOf(plan.price, settings), ... } : { price: "", ... },
<form.AppField name="price">{(f) => <f.MoneyField label="Price" settings={settings} />}</form.AppField>
```

`formatMoney` takes its digits from the browser (CLDR), and `money()` from the server
(`fractionDigits`, ISO 4217). They agree for USD, EUR, GBP, CAD, AUD, JPY and most currencies, but
not for HUF, IDR, COP, LBP or IQD: an app in one of those is not supported yet.

`contracts/money.json` lists typed inputs and what each becomes; a contract test on each side keeps
the browser's parsing and the server's rules the same.

## Don't

- Don't use `double`, `float` or `BigDecimal` for an amount in a record, an entity or the wire.
- Don't send an amount as a number of major units (`150.0`) or a formatted string (`"$150.00"`).
- Don't do arithmetic on a formatted string, or parse one back.
- Don't let the browser decide an amount the server records (a payment's amount is the server's price
  times the periods); show it, and let the server compute it.
- Don't mix currencies: an app has one.
