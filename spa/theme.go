package spa

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jwcarman/roux/problem"
)

// Theme is how the app looks and what it is called, as the shell carries it to
// the browser: written into the page as JSON (and the name as the title) so the
// first paint already has the right look. The vocabulary is roux-web's.
type Theme struct {
	AppName     string `json:"appName"`
	Palette     string `json:"palette"`     // a Chakra palette name, or "brand" to generate one from BrandColor
	BrandColor  string `json:"brandColor"`  // "#" and six hex digits
	Shape       string `json:"shape"`       // how round corners are
	Depth       string `json:"depth"`       // "flat" or "raised": whether cards sit on a tinted page with a soft shadow
	HeadingFont string `json:"headingFont"` // the lettering of headings
	BodyFont    string `json:"bodyFont"`    // the lettering of text
}

const maxAppName = 60

var (
	palettes = set("gray", "red", "orange", "yellow", "green", "teal", "blue", "cyan", "purple", "pink", "brand")
	shapes   = set("square", "slight", "medium", "round", "extra-round")
	depths   = set("flat", "raised")
	fonts    = set("standard", "modern", "friendly", "classic")
	color    = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

func set(v ...string) map[string]bool {
	m := make(map[string]bool, len(v))
	for _, s := range v {
		m[s] = true
	}
	return m
}

// Look is a ready-made look: the parts of a Theme that are about how the app looks, not what it is
// called. contracts/looks.json holds the five below; roux-web's LOOKS offers the same ones on the
// Appearance page. The zero Look is Clean.
type Look struct {
	Palette     string `json:"palette"`
	Shape       string `json:"shape"`
	Depth       string `json:"depth"`
	HeadingFont string `json:"headingFont"`
	BodyFont    string `json:"bodyFont"`
}

// The ready-made looks. Clean is roux's own.
var (
	Clean    = Look{Palette: "gray", Shape: "medium", Depth: "flat", HeadingFont: "standard", BodyFont: "standard"}
	Friendly = Look{Palette: "teal", Shape: "round", Depth: "raised", HeadingFont: "friendly", BodyFont: "friendly"}
	Bold     = Look{Palette: "purple", Shape: "square", Depth: "flat", HeadingFont: "modern", BodyFont: "modern"}
	Calm     = Look{Palette: "blue", Shape: "slight", Depth: "raised", HeadingFont: "standard", BodyFont: "standard"}
	Classic  = Look{Palette: "green", Shape: "slight", Depth: "flat", HeadingFont: "classic", BodyFont: "standard"}
)

// Theme is the look under the given app name. The zero Look is Clean.
func (l Look) Theme(appName string) Theme {
	if l == (Look{}) {
		l = Clean
	}
	return Theme{AppName: appName, Palette: l.Palette, BrandColor: "#3b82f6", Shape: l.Shape, Depth: l.Depth, HeadingFont: l.HeadingFont, BodyFont: l.BodyFont}
}

// StockTheme is the default look under the given name: Clean.
func StockTheme(appName string) Theme { return Clean.Theme(appName) }

// Validate refuses a value the frontend has no look for, so a theme that would
// render wrongly fails here instead of in the browser.
func (t Theme) Validate() error {
	if n := utf8.RuneCountInString(t.AppName); t.AppName == "" || n > maxAppName {
		return fmt.Errorf("spa: theme appName %q must be 1 to %d characters", t.AppName, maxAppName)
	}
	for _, c := range []struct {
		part, val string
		ok        bool
	}{
		{"palette", t.Palette, palettes[t.Palette]},
		{"brandColor", t.BrandColor, color.MatchString(t.BrandColor)},
		{"shape", t.Shape, shapes[t.Shape]},
		{"depth", t.Depth, depths[t.Depth]},
		{"headingFont", t.HeadingFont, fonts[t.HeadingFont]},
		{"bodyFont", t.BodyFont, fonts[t.BodyFont]},
	} {
		if !c.ok {
			return fmt.Errorf("spa: theme %s %q is not a value the frontend knows", c.part, c.val)
		}
	}
	return nil
}

// Violations lists what is wrong with each part of the theme, in the words of roux's
// forms (a blank name is "Must not be blank"; a value the frontend has no look for is
// "Is not in the expected format"), for an endpoint that takes a theme from a person.
func (t Theme) Violations() []problem.Violation {
	var v []problem.Violation
	switch n := utf8.RuneCountInString(t.AppName); {
	case t.AppName == "" || len(strings.TrimSpace(t.AppName)) == 0:
		v = append(v, problem.Violation{Field: "appName", Message: problem.MustNotBeBlank})
	case n > maxAppName:
		v = append(v, problem.Violation{Field: "appName", Message: problem.MustBeBetween(0, maxAppName)})
	}
	for _, c := range []struct {
		field string
		ok    bool
	}{
		{"palette", palettes[t.Palette]},
		{"brandColor", color.MatchString(t.BrandColor)},
		{"shape", shapes[t.Shape]},
		{"depth", depths[t.Depth]},
		{"headingFont", fonts[t.HeadingFont]},
		{"bodyFont", fonts[t.BodyFont]},
	} {
		if !c.ok {
			v = append(v, problem.Violation{Field: c.field, Message: problem.BadFormat})
		}
	}
	return v
}
