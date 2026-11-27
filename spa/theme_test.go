package spa_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/spa"
)

func TestThemeValidateRefusesUnknownDepth(t *testing.T) {
	th := spa.Clean.Theme("App")
	th.Depth = "deep"
	err := th.Validate()
	if err == nil || !strings.Contains(err.Error(), `depth "deep"`) {
		t.Fatalf("want an error naming depth \"deep\", got %v", err)
	}
}

func TestCleanIsFlat(t *testing.T) {
	if d := spa.Clean.Theme("App").Depth; d != "flat" {
		t.Fatalf("depth %q", d)
	}
	th := spa.Clean.Theme("App")
	th.Depth = "raised"
	if err := th.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestViolationsListsDepth(t *testing.T) {
	th := spa.Clean.Theme("App")
	th.Depth = "deep"
	got := th.Violations()
	want := problem.Violation{Field: "depth", Message: problem.BadFormat}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("%v", got)
	}
}

// looks.json is roux's ready-made looks; roux-web's LOOKS is checked against the same file.
func TestLooksMatchContract(t *testing.T) {
	raw, err := os.ReadFile("../contracts/looks.json")
	if err != nil {
		t.Fatal(err)
	}
	var want map[string]spa.Look
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	got := map[string]spa.Look{"Clean": spa.Clean, "Friendly": spa.Friendly, "Bold": spa.Bold, "Calm": spa.Calm, "Classic": spa.Classic}
	if len(want) != len(got) {
		t.Fatalf("looks.json has %d looks, spa has %d", len(want), len(got))
	}
	for name, look := range got {
		if want[name] != look {
			t.Errorf("%s: spa %+v, looks.json %+v", name, look, want[name])
		}
	}
}

func TestZeroLookIsClean(t *testing.T) {
	if got, want := (spa.Look{}).Theme("App"), spa.Clean.Theme("App"); got != want {
		t.Fatalf("%+v, want %+v", got, want)
	}
}

func TestALookMakesATheme(t *testing.T) {
	th := spa.Friendly.Theme("Acme")
	want := spa.Theme{AppName: "Acme", Palette: "teal", BrandColor: "#3b82f6", Shape: "round", Depth: "raised", HeadingFont: "friendly", BodyFont: "friendly"}
	if th != want {
		t.Fatalf("%+v", th)
	}
	if err := th.Validate(); err != nil {
		t.Fatal(err)
	}
}
