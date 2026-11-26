package main

import (
	"os"
	"testing"

	"github.com/jwcarman/roux/cqrs"

	"roux-the-day/internal/items"
)

const contractFile = "../../frontend/src/contract.gen.ts"

// The front end's contract is the server's queries and commands: a change to one is rewritten
// into frontend/src/contract.gen.ts by UPDATE=1, and this test fails until that is committed.
func TestContractIsCurrent(t *testing.T) {
	want := cqrs.TypeScript(items.Endpoints(items.Service{}))
	if os.Getenv("UPDATE") != "" {
		if err := os.WriteFile(contractFile, []byte(want), 0o600); err != nil {
			t.Fatal(err)
		}
		return
	}
	got, err := os.ReadFile(contractFile)
	if err != nil || string(got) != want {
		t.Fatal("contract.gen.ts is stale; run UPDATE=1 go test ./cmd/server -run TestContractIsCurrent")
	}
}
