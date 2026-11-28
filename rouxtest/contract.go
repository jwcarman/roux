package rouxtest

import (
	"os"

	"github.com/jwcarman/roux/cqrs"
)

// ContractFile keeps the front end's contract (frontend/src/contract.gen.ts) the same as the
// server's queries and commands, so it is never written by hand: its text is
// cqrs.TypeScript(endpoints). When the file is not that text, it rewrites the file and fails, so
// the change is seen and committed.
func ContractFile(t T, path string, endpoints ...cqrs.Endpoint) {
	t.Helper()
	want := cqrs.TypeScript(endpoints)
	got, err := os.ReadFile(path)
	if err == nil && string(got) == want {
		return
	}
	if err := os.WriteFile(path, []byte(want), 0o600); err != nil {
		t.Fatalf("rouxtest: writing %s: %v", path, err)
	}
	t.Errorf("rouxtest: %s did not match the server's queries and commands; it is rewritten: commit it", path)
}
