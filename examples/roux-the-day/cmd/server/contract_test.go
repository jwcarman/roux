package main

import (
	"os"
	"testing"

	"github.com/jwcarman/roux/cqrs"

	"roux-the-day/internal/items"
)

// contractFile is the front end's copy of the server's queries and commands.
const contractFile = "../../frontend/src/contract.gen.ts"

// The front end's contract is the server's queries and commands: a change to one is rewritten into
// frontend/src/contract.gen.ts, and this test fails once so the change is noticed and committed.
// Each feature adds its endpoints: slices.Concat(items.Endpoints(items.Service{}), ...).
func TestTheFrontEndContractIsCurrent(t *testing.T) {
	want := cqrs.TypeScript(items.Endpoints(items.Service{}))
	if got, err := os.ReadFile(contractFile); err == nil && string(got) == want {
		return
	}
	if err := os.WriteFile(contractFile, []byte(want), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Fatal("frontend/src/contract.gen.ts was stale and is rewritten: run the test again and commit it")
}
