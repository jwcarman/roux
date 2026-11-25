package problem_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/jwcarman/roux/problem"
)

// contracts/messages.json is roux's words for a broken rule; the browser's tests read the
// same file, so a form and the server never say two different things.
func TestMessagesAreTheContracts(t *testing.T) {
	raw, err := os.ReadFile("../contracts/messages.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract map[string]string
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	ours := map[string]string{
		"NotBlank":        problem.MustNotBeBlank,
		"NotNull":         problem.MustNotBeEmpty,
		"NotEmpty":        problem.MustNotBeEmpty,
		"Size":            problem.MustBeBetween(1, 2),
		"Email":           problem.ValidEmail,
		"Min":             problem.MustBeAtLeast(1),
		"Max":             problem.MustBeAtMost(1),
		"Positive":        problem.MustBeMoreThan0,
		"PositiveOrZero":  problem.MustNotBeNegative,
		"Past":            problem.MustBeInThePast,
		"PastOrPresent":   problem.MustNotBeInFuture,
		"Future":          problem.MustBeInTheFuture,
		"FutureOrPresent": problem.MustNotBeInPast,
		"Pattern":         problem.BadFormat,
		"URL":             problem.ValidURL,
		"Phone":           problem.BadFormat,
		"NotInFuture":     problem.MustNotBeInFuture,
		"After":           problem.MustBeAfter("starts at"),
	}
	fill := map[string]string{"{min}": "1", "{max}": "2", "{value}": "1", "{other}": "starts at"}
	for rule, want := range contract {
		for placeholder, v := range fill {
			want = strings.ReplaceAll(want, placeholder, v)
		}
		got, ok := ours[rule]
		if !ok {
			t.Errorf("%s: the contract has it, the server does not", rule)
		} else if got != want {
			t.Errorf("%s: the server says %q, the contract %q", rule, got, want)
		}
	}
	if len(ours) != len(contract) {
		t.Errorf("the server has %d messages, the contract %d", len(ours), len(contract))
	}
}
