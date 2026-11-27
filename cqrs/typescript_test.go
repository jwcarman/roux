package cqrs_test

import (
	"os"
	"strings"
	"testing"
	"time"

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
	When   time.Time   `json:"when"`
	Blob   []byte      `json:"blob"`
	*pointerStamp
	Shared shared `json:"shared"`
}

type pointerStamp struct {
	EditedBy string  `json:"editedBy"`
	Reason   *string `json:"reason"`
}

// shared is used in an input and in a row, where its pointer member differs.
type shared struct {
	Label *string `json:"label"`
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
	Shared   shared     `json:"shared"`
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

func TestTypeScriptIsTheSameInAnyEndpointOrder(t *testing.T) {
	eps := contractEndpoints()
	rev := []cqrs.Endpoint{eps[3], eps[2], eps[1], eps[0]}
	if a, b := cqrs.TypeScript(eps), cqrs.TypeScript(rev); a != b {
		t.Errorf("order changed the contract:\n%s\nvs\n%s", a, b)
	}
}

func TestTypeScriptDescribesASharedStructPerSide(t *testing.T) {
	got := cqrs.TypeScript(contractEndpoints())
	for _, want := range []string{"export interface sharedInput {\n  label?: string | null;", "export interface shared {\n  label: string | null;", "shared: sharedInput;", "shared: shared;"} {
		if !strings.Contains(got, want) {
			t.Errorf("contract lacks %q:\n%s", want, got)
		}
	}
}

type untagged struct {
	Extra string
}

func TestTypeScriptRefusesAFieldWithoutAJSONTag(t *testing.T) {
	defer func() {
		want := `cqrs: untagged.Extra has no json tag; tag it (json:"extra") or json:"-" to leave it out`
		if got := recover(); got != want {
			t.Errorf("panic = %v, want %q", got, want)
		}
	}()
	cqrs.TypeScript([]cqrs.Endpoint{cqrs.Lookup[cqrs.NoArgs, untagged]{Name: "things"}})
}

type intArgs struct {
	When int `query:"when"`
}

type strayArgs struct {
	Status string `query:"status"`
	Extra  string
}

type unexportedArgs struct {
	hidden string `query:"hidden"`
}

func (a unexportedArgs) Hidden() string { return a.hidden }

func TestTypeScriptRefusesBadQueryArgs(t *testing.T) {
	cases := map[string]struct {
		endpoint cqrs.Endpoint
		want     string
	}{
		"a query arg that is not a string": {
			cqrs.Query[intArgs, contractAdded]{Name: "items"},
			`cqrs: query "items" arg When has type int; query args are strings — make it a string (with oneof for a fixed set)`,
		},
		"an arg field without a query tag": {
			cqrs.Query[strayArgs, contractAdded]{Name: "items"},
			`cqrs: query "items" arg field Extra has no query tag; tag it query:"extra" or unexport it`,
		},
		"an unexported tagged arg": {
			cqrs.Lookup[unexportedArgs, contractAdded]{Name: "things"},
			`cqrs: lookup "things" arg hidden is unexported; export it or drop its query tag`,
		},
		"args that are not a struct": {
			cqrs.Lookup[string, contractAdded]{Name: "things"},
			`cqrs: lookup "things" takes args of type string; args are a struct of query-tagged strings, or cqrs.NoArgs`,
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if got := recover(); got != c.want {
					t.Errorf("panic = %v, want %q", got, c.want)
				}
			}()
			cqrs.TypeScript([]cqrs.Endpoint{c.endpoint})
		})
	}
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

type NoArgs struct {
	Name string `query:"name"`
}

type Money struct {
	Cents int `json:"cents"`
}

type clash struct {
	Label *string `json:"label"`
}

type clashInput struct {
	Other string `json:"other"`
}

type clashCommand struct {
	Clash      clash      `json:"clash"`
	ClashInput clashInput `json:"clashInput"`
}

func (c clashCommand) Validate() (clashCommand, error) { return c, nil }

type clashRow struct {
	Clash clash `json:"clash"`
}

type moneyRow struct {
	Price money.Money `json:"price"`
	Mine  Money       `json:"mine"`
}

func TestTypeScriptRefusesTwoTypesWithOneName(t *testing.T) {
	cases := map[string]struct {
		endpoints []cqrs.Endpoint
		want      string
	}{
		"same name in two packages": {
			[]cqrs.Endpoint{cqrs.Lookup[cqrs.NoArgs, contractAdded]{Name: "a"}, cqrs.Lookup[NoArgs, contractAdded]{Name: "b"}},
			`cqrs: two types would both be named "NoArgs" in the contract (github.com/jwcarman/roux/cqrs.NoArgs and github.com/jwcarman/roux/cqrs_test.NoArgs); rename one`,
		},
		"the input suffix meets a Go type": {
			[]cqrs.Endpoint{cqrs.Command[clashCommand, clashRow]{Name: "add"}},
			`cqrs: two types would both be named "clashInput" in the contract (github.com/jwcarman/roux/cqrs_test.clash and github.com/jwcarman/roux/cqrs_test.clashInput); rename one`,
		},
		"a type named Money": {
			[]cqrs.Endpoint{cqrs.Lookup[cqrs.NoArgs, moneyRow]{Name: "a"}},
			`cqrs: two types would both be named "Money" in the contract (github.com/jwcarman/roux/cqrs_test.Money and github.com/jwcarman/roux/money.Money); rename one`,
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if got := recover(); got != c.want {
					t.Errorf("panic = %v, want %q", got, c.want)
				}
			}()
			cqrs.TypeScript(c.endpoints)
		})
	}
}
