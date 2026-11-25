// Package money is an amount of money: whole minor units (cents, yen) in an ISO 4217
// currency, never a float, so a price is never off by a rounding error.
//
// On the wire it is roux's shape, which roux-web reads and writes:
//
//	{"minorUnits":15000,"currency":"USD"}
//
// A handler checks an amount with roux's rules, whose messages the browser shows as
// written (contracts/money.json):
//
//	if v := money.Check("price", req.Price, money.Positive, money.In(cfg.Currency)); len(v) > 0 {
//		return problem.Validation(v...)
//	}
//
// A store keeps an amount in two columns, the minor units (bigint) and the currency
// code (text), and builds it back with Money{MinorUnits: n, Currency: c}.
package money

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"

	"github.com/bojanz/currency"

	"github.com/jwcarman/roux/problem"
)

// Currency is an ISO 4217 currency code, such as "USD".
type Currency string

// ParseCurrency checks code is a known ISO 4217 currency, written in capitals.
func ParseCurrency(code string) (Currency, error) {
	if code == "" || code != strings.ToUpper(code) || !currency.IsValid(code) {
		return "", fmt.Errorf("money: %q is not an ISO 4217 currency code, such as USD", code)
	}
	return Currency(code), nil
}

// Digits is how many minor-unit digits the currency has: 2 for USD, 0 for JPY.
func (c Currency) Digits() int {
	d, _ := currency.GetDigits(string(c))
	return int(d)
}

// Money is an amount in a currency.
type Money struct {
	MinorUnits int64    `json:"minorUnits"`
	Currency   Currency `json:"currency"`
}

// Zero is no money in c.
func Zero(c Currency) Money { return Money{Currency: c} }

// IsPositive reports whether m is more than zero.
func (m Money) IsPositive() bool { return m.MinorUnits > 0 }

// Plus is m and o together. They must be in the same currency, and the sum must fit.
func (m Money) Plus(o Money) (Money, error) {
	if m.Currency != o.Currency {
		return Money{}, fmt.Errorf("money: cannot add %s to %s", o.Currency, m.Currency)
	}
	sum := m.MinorUnits + o.MinorUnits
	if (o.MinorUnits > 0 && sum < m.MinorUnits) || (o.MinorUnits < 0 && sum > m.MinorUnits) {
		return Money{}, errors.New("money: the sum overflows")
	}
	return Money{MinorUnits: sum, Currency: m.Currency}, nil
}

// Times is m n times (a price for n periods). The product must fit.
func (m Money) Times(n int64) (Money, error) {
	if m.MinorUnits != 0 && n != 0 {
		p := m.MinorUnits * n
		if p/n != m.MinorUnits || (m.MinorUnits == -1 && n == math.MinInt64) || (n == -1 && m.MinorUnits == math.MinInt64) {
			return Money{}, errors.New("money: the product overflows")
		}
		return Money{MinorUnits: p, Currency: m.Currency}, nil
	}
	return Money{Currency: m.Currency}, nil
}

// Format writes m as locale (a BCP 47 tag) writes it, with its currency's symbol and
// digits: "$150.00" in en-US, "1.500,50 €" in de-DE. It is for text the server writes,
// such as a history entry; the browser formats amounts itself.
func (m Money) Format(locale string) string {
	a, err := currency.NewAmountFromInt64(m.MinorUnits, string(m.Currency))
	if err != nil {
		return fmt.Sprintf("%d %s", m.MinorUnits, m.Currency)
	}
	return currency.NewFormatter(currency.NewLocale(locale)).Format(a)
}

// UnmarshalJSON reads roux's shape. minorUnits must be there and a whole number: a
// fraction (a client doing float arithmetic) is refused, not truncated to a wrong
// price. The currency must be a known code.
func (m *Money) UnmarshalJSON(data []byte) error {
	var raw struct {
		MinorUnits json.RawMessage `json:"minorUnits"`
		Currency   *string         `json:"currency"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if len(raw.MinorUnits) == 0 || bytes.Equal(raw.MinorUnits, []byte("null")) {
		return errors.New("money: minorUnits is required")
	}
	// A JSON number that is whole however it is written (150, 150.0, 1.5e2) and fits; a
	// string is not a number. big.Rat reads JSON's number syntax.
	var r *big.Rat
	var ok bool
	if c := raw.MinorUnits[0]; c == '-' || (c >= '0' && c <= '9') {
		r, ok = new(big.Rat).SetString(string(raw.MinorUnits))
	}
	if !ok || !r.IsInt() || !r.Num().IsInt64() {
		return errors.New("money: minorUnits must be a whole number")
	}
	n := r.Num().Int64()
	if raw.Currency == nil {
		return errors.New("money: currency is required")
	}
	c, err := ParseCurrency(*raw.Currency)
	if err != nil {
		return err
	}
	*m = Money{MinorUnits: n, Currency: c}
	return nil
}

// roux's messages, the browser's money() rule's words.
const (
	MustBeMoreThanZero = problem.MustBeMoreThan0
	MustNotBeNegative  = problem.MustNotBeNegative
)

// MustBeIn is the message for an amount in another currency.
func MustBeIn(c Currency) string { return "Must be in " + string(c) }

// Rule checks an amount: roux's message when it fails, "" when it passes.
type Rule func(Money) string

// Positive is more than zero.
func Positive(m Money) string {
	if m.MinorUnits > 0 {
		return ""
	}
	return MustBeMoreThanZero
}

// PositiveOrZero is zero or more.
func PositiveOrZero(m Money) string {
	if m.MinorUnits >= 0 {
		return ""
	}
	return MustNotBeNegative
}

// In is the app's currency.
func In(c Currency) Rule {
	return func(m Money) string {
		if m.Currency == c {
			return ""
		}
		return MustBeIn(c)
	}
}

// Check runs every rule against m and returns a field error for each that fails, all
// of them (a zero price in another currency is two errors), for problem.Validation.
func Check(field string, m Money, rules ...Rule) []problem.Violation {
	var v []problem.Violation
	for _, rule := range rules {
		if msg := rule(m); msg != "" {
			v = append(v, problem.Violation{Field: field, Message: msg})
		}
	}
	return v
}
