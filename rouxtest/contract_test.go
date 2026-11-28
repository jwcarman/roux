package rouxtest_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/rouxtest"
)

func TestAStaleContractFileIsRewrittenAndFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "contract.gen.ts")
	if err := os.WriteFile(path, []byte("stale"), 0o600); err != nil {
		t.Fatal(err)
	}
	inner := &recorder{}
	ran := runIn(inner, func(tt rouxtest.T) { rouxtest.ContractFile(tt, path) })
	if !ran || !inner.Failed() {
		t.Fatal("a stale file passed")
	}
	got, err := os.ReadFile(path)
	if want := cqrs.TypeScript(nil); err != nil || string(got) != want {
		t.Fatalf("rewritten as:\n%s\nwant:\n%s", got, want)
	}
	// Now it is current: it passes and is left alone.
	rouxtest.ContractFile(t, path)
}

func TestAContractFileThatCannotBeWrittenFails(t *testing.T) {
	inner := &recorder{}
	runIn(inner, func(tt rouxtest.T) {
		rouxtest.ContractFile(tt, filepath.Join(t.TempDir(), "missing", "contract.gen.ts"))
	})
	if !inner.Failed() {
		t.Fatal("an unwritable file passed")
	}
}
