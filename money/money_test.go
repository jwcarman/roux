package money_test

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/jwcarman/roux/money"
)

// contracts/money.json's "rules": the server's answer, which money() in the browser matches.
func TestRulesMatchTheContract(t *testing.T) {
	raw, err := os.ReadFile("../contracts/money.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Rules []struct {
			Money    money.Money `json:"money"`
			Positive bool        `json:"positive"`
			Message  *string     `json:"message"`
		} `json:"rules"`
	}
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	if len(contract.Rules) == 0 {
		t.Fatal("no rules in the contract")
	}
	for _, c := range contract.Rules {
		first := money.Rule(money.PositiveOrZero)
		if c.Positive {
			first = money.Positive
		}
		got := money.Check("money", c.Money, first, money.In("USD"))
		switch {
		case c.Message == nil && len(got) != 0:
			t.Errorf("%+v: want no error, got %v", c.Money, got)
		case c.Message != nil && (len(got) != 1 || got[0].Message != *c.Message):
			t.Errorf("%+v positive=%v: want %q, got %v", c.Money, c.Positive, *c.Message, got)
		}
	}
}

func TestAZeroAmountInAnotherCurrencyIsTwoErrors(t *testing.T) {
	got := money.Check("price", money.Money{Currency: "EUR"}, money.Positive, money.In("USD"))
	if len(got) != 2 || got[0].Message != "Must be more than 0" || got[1].Message != "Must be in USD" || got[1].Field != "price" {
		t.Fatalf("%v", got)
	}
}

func TestJSONIsMinorUnitsAndACode(t *testing.T) {
	out, err := json.Marshal(money.Money{MinorUnits: 15000, Currency: "USD"})
	if err != nil || string(out) != `{"minorUnits":15000,"currency":"USD"}` {
		t.Fatalf("%s %v", out, err)
	}
	var m money.Money
	if err := json.Unmarshal(out, &m); err != nil || m != (money.Money{MinorUnits: 15000, Currency: "USD"}) {
		t.Fatalf("%+v %v", m, err)
	}
}

func TestJSONRefusesWhatWouldBeAWrongPrice(t *testing.T) {
	for _, in := range []string{
		`{"minorUnits":150.5,"currency":"USD"}`, // a fraction is refused, not truncated
		`{"minorUnits":1.5e-1,"currency":"USD"}`,
		`{"currency":"USD"}`,
		`{"minorUnits":"150","currency":"USD"}`,
		`{"minorUnits":150}`,
		`{"minorUnits":150,"currency":"XYZ"}`,
		`{"minorUnits":150,"currency":"usd"}`,
		`{"minorUnits":99999999999999999999,"currency":"USD"}`,
		`[]`,
		`{"minorUnits":null,"currency":"USD"}`,
		`{"minorUnits":true,"currency":"USD"}`,
	} {
		var m money.Money
		if err := json.Unmarshal([]byte(in), &m); err == nil {
			t.Errorf("%s was accepted as %+v", in, m)
		}
	}
	for _, in := range []string{`{"minorUnits":150.0,"currency":"JPY"}`, `{"minorUnits":1.5e2,"currency":"JPY"}`} {
		var m money.Money
		if err := json.Unmarshal([]byte(in), &m); err != nil || m.MinorUnits != 150 {
			t.Errorf("%s is a whole number: %+v %v", in, m, err)
		}
	}
}

func TestCurrencies(t *testing.T) {
	for code, digits := range map[string]int{"USD": 2, "JPY": 0, "EUR": 2, "BHD": 3} {
		c, err := money.ParseCurrency(code)
		if err != nil || c.Digits() != digits {
			t.Errorf("%s: %v digits %d, want %d", code, err, c.Digits(), digits)
		}
	}
	for _, bad := range []string{"", "usd", "XYZ", "US"} {
		if _, err := money.ParseCurrency(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestArithmetic(t *testing.T) {
	usd := func(n int64) money.Money { return money.Money{MinorUnits: n, Currency: "USD"} }
	if got, err := usd(150).Plus(usd(50)); err != nil || got != usd(200) {
		t.Errorf("plus: %+v %v", got, err)
	}
	if _, err := usd(1).Plus(money.Money{MinorUnits: 1, Currency: "EUR"}); err == nil {
		t.Error("adding another currency should fail")
	}
	if _, err := usd(math.MaxInt64).Plus(usd(1)); err == nil {
		t.Error("an overflowing sum should fail")
	}
	if _, err := usd(math.MinInt64).Plus(usd(-1)); err == nil {
		t.Error("an underflowing sum should fail")
	}
	if got, err := usd(1500).Times(3); err != nil || got != usd(4500) {
		t.Errorf("times: %+v %v", got, err)
	}
	if got, err := usd(1500).Times(0); err != nil || got != usd(0) {
		t.Errorf("times zero: %+v %v", got, err)
	}
	for _, c := range []struct{ m, n int64 }{{math.MaxInt64, 2}, {math.MinInt64, -1}, {-1, math.MinInt64}} {
		if _, err := usd(c.m).Times(c.n); err == nil {
			t.Errorf("%d times %d should overflow", c.m, c.n)
		}
	}
	if money.Zero("JPY") != (money.Money{Currency: "JPY"}) || usd(0).IsPositive() || !usd(1).IsPositive() {
		t.Error("zero and positive")
	}
}

func TestFormatFollowsTheLocale(t *testing.T) {
	for _, c := range []struct {
		m      money.Money
		locale string
		want   string
	}{
		{money.Money{MinorUnits: 15000, Currency: "USD"}, "en-US", "$150.00"},
		{money.Money{MinorUnits: 150050, Currency: "EUR"}, "de-DE", "1.500,50\u00a0€"}, // a no-break space, as Java writes it,
		{money.Money{MinorUnits: 150, Currency: "JPY"}, "ja-JP", "￥150"},
		{money.Money{MinorUnits: 150, Currency: "XYZ"}, "en-US", "150 XYZ"}, // not a currency: still readable
	} {
		if got := c.m.Format(c.locale); got != c.want {
			t.Errorf("%+v in %s: %q, want %q", c.m, c.locale, got, c.want)
		}
	}
}
