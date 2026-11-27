package spa_test

import (
	"strings"
	"testing"

	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/spa"
)

func TestThemeValidateRefusesUnknownDepth(t *testing.T) {
	th := spa.StockTheme("App")
	th.Depth = "deep"
	err := th.Validate()
	if err == nil || !strings.Contains(err.Error(), `depth "deep"`) {
		t.Fatalf("want an error naming depth \"deep\", got %v", err)
	}
}

func TestStockThemeIsFlat(t *testing.T) {
	if d := spa.StockTheme("App").Depth; d != "flat" {
		t.Fatalf("depth %q", d)
	}
	th := spa.StockTheme("App")
	th.Depth = "raised"
	if err := th.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestViolationsListsDepth(t *testing.T) {
	th := spa.StockTheme("App")
	th.Depth = "deep"
	got := th.Violations()
	want := problem.Violation{Field: "depth", Message: problem.BadFormat}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("%v", got)
	}
}
