package cqrs_test

import (
	"os"
	"testing"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/cqrs"
	"github.com/jwcarman/roux/money"
)

type auditStamp struct {
	CreatedBy string `json:"createdBy"`
	Hidden    string `json:"-"`
}

type contractRow struct {
	auditStamp
	ID     uuid.UUID   `json:"id"`
	Title  string      `json:"title"`
	Count  int64       `json:"count"`
	Ratio  float64     `json:"ratio"`
	Done   bool        `json:"done"`
	Price  money.Money `json:"price"`
	Note   *string     `json:"note"`
	Tags   []string    `json:"tags"`
	Parts  []part      `json:"parts"`
	Secret string      `json:"-"`
}

type part struct {
	Name string `json:"name"`
}

type contractArgs struct {
	Status string `query:"status" oneof:"open,done"`
	Text   string `query:"text"`
}

type contractInput struct {
	Title    string     `json:"title"`
	Due      *string    `json:"due"`
	Optional *part      `json:"optional"`
	Owner    *uuid.UUID `json:"owner"`
	Ids      []int      `json:"ids"`
}

func (c contractInput) Validate() (contractInput, error) { return c, nil }

type contractAdded struct {
	ID uuid.UUID `json:"id"`
}

func contractEndpoints() []cqrs.Endpoint {
	return []cqrs.Endpoint{
		cqrs.Query[contractArgs, contractRow]{Name: "rows", DependsOn: []string{"RowAdded", "RowGone"}},
		cqrs.Lookup[cqrs.NoArgs, contractAdded]{Name: "summary", DependsOn: []string{"RowAdded"}},
		cqrs.Command[contractInput, contractAdded]{Name: "addRow", Emits: []string{"RowAdded"}},
		cqrs.Command[contractInput, contractAdded]{Name: "quiet"},
	}
}

func TestTypeScriptMatchesGolden(t *testing.T) {
	got := cqrs.TypeScript(contractEndpoints())
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile("testdata/contract.gen.ts", []byte(got), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile("testdata/contract.gen.ts")
	if err != nil {
		t.Fatal(err)
	}
	if got != string(want) {
		t.Errorf("contract differs from testdata/contract.gen.ts (rerun with UPDATE_GOLDEN=1 to accept):\n%s", got)
	}
}

type Thing struct {
	Extra map[string]int `json:"extra"`
}

func TestTypeScriptRefusesAnUnsupportedType(t *testing.T) {
	defer func() {
		want := "cqrs: Thing.Extra is a map[string]int, which the contract can't describe; use a struct or a slice"
		if got := recover(); got != want {
			t.Errorf("panic = %v, want %q", got, want)
		}
	}()
	cqrs.TypeScript([]cqrs.Endpoint{cqrs.Lookup[cqrs.NoArgs, Thing]{Name: "things"}})
}
