# Money

An amount is a whole number of the currency's minor units plus a currency, everywhere: Java, the
database, the wire and the browser. An app has one currency.

## Rules

- No `double`, `float` or `BigDecimal` for an amount; never send major units (`150.0`) or a
  formatted string; never parse or do arithmetic on a formatted string.
- The server computes amounts it records (a payment = the server's price × periods); the browser
  only shows them.
- Store the amount a record was made at (a payment's amount, not the plan's price now).
- Sum in SQL over the minor units, then build `Money` from the sum and the app's currency.

## Names

- Setting: `roux.money.currency: USD` (`RouxMoneyProperties`). It enables the `MoneySettings` bean
  (`currency()`, `fractionDigits()`) and puts the currency in the organization's context.
- `Money(long minorUnits, Currency currency)` (`org.jwcarman.roux.money`, a record and
  `@Embeddable`): `Money.of(15000, usd)`, `Money.zero(usd)`, `times(n)`, `plus(other)` (same
  currency), `isPositive()`, `format(locale)` for server-written text (pass `calendar.locale()`).
  JSON: `{ "minorUnits": 15000, "currency": "USD" }`.
- Request constraints: `@InCurrency` (`Must be in USD`), `@PositiveMoney` (`Must be more than 0`),
  `@PositiveOrZeroMoney` (`Must not be negative`). Validators you never reference:
  `InCurrencyValidator`, `PositiveMoneyValidator`, `PositiveOrZeroMoneyValidator`.
- Browser, `/money`: `Money`, `formatMoney(money)` (`"$150.00"`, organization's locale),
  `timesMoney(money, n)`, `currencySymbol(currency)`.
- Browser, `/form`: `money()` (a `MoneyRule`; `.positive()` ↔ `@PositiveMoney`, `.optional()`),
  `f.MoneyField` (`MoneyField`, `MoneyFieldProps`: `label`), `moneyInputOf(money)` for defaults.

## Steps: an amount on an entity

1. Changeset: two columns per amount.

   ```xml
   <column name="price_minor_units" type="bigint"><constraints nullable="false"/></column>
   <column name="price_currency" type="varchar(3)"><constraints nullable="false"/></column>
   ```
2. Entity:

   ```java
   @Embedded
   @AttributeOverride(name = "minorUnits", column = @Column(name = "price_minor_units"))
   @AttributeOverride(name = "currency", column = @Column(name = "price_currency"))
   private Money price;
   ```
3. Request: `@NotNull @PositiveMoney @InCurrency Money price`.
4. Module: `price: money().positive()` in the schema; `price: Money` on the record's interface.
5. Dialog: `defaultValues: plan ? { price: moneyInputOf(plan.price) } : { price: "" }` and
   `<form.AppField name="price">{(f) => <f.MoneyField label="Price" />}</form.AppField>`.
6. Table cell: `formatMoney(row.original.price)`, right-aligned.

## Check

Controller test: a request in another currency is a field error `Must be in USD`; zero is `Must be
more than 0`. Form test: typing `150.50` sends `{ "minorUnits": 15050, "currency": "USD" }`.

## Pitfalls

- `char(3)` for the currency fails schema validation; it's `varchar(3)`.
- Without `roux.money.currency`, `@InCurrency` fails with `roux.money.currency must be set to check
  @InCurrency`, and the browser has no currency.
- `Money.plus` of two currencies throws `IllegalArgumentException`; `times` throws on overflow.
