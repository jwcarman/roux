package main

import (
	"testing"

	"github.com/jwcarman/roux/rouxtest"
)

// The front end's contract is the server's queries and commands: an endpoint added to endpoints()
// is rewritten into frontend/src/contract.gen.ts, and this test fails once so the change is committed.
func TestTheFrontEndContractIsCurrent(t *testing.T) {
	rouxtest.ContractFile(t, "../../frontend/src/contract.gen.ts", endpoints()...)
}
