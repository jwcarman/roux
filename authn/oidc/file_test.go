package oidc_test

import (
	"context"
	"strings"
	"testing"

	"github.com/jwcarman/roux/authn/oidc"
)

func vars(m map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestProvidersFromAFile(t *testing.T) {
	const file = `[
	  {"kind": "google", "clientId": "g-id", "clientSecret": "${G_SECRET}", "signUp": {"claim": "hd", "values": ["example.com"]}},
	  {"kind": "github", "clientId": "gh-id", "clientSecret": "s"},
	  {"kind": "oidc", "id": "kc", "name": "Keycloak", "issuer": "https://sso.example.test/realms/main", "clientId": "app", "clientSecret": "${K_SECRET}", "signUp": {"open": true}}
	]`
	providers, rules, err := oidc.ParseProviders(strings.NewReader(file), vars(map[string]string{"G_SECRET": `has "quotes"`, "K_SECRET": "k"}))
	if err != nil {
		t.Fatal(err)
	}
	if len(providers) != 3 || providers[0].ID != "google" || providers[0].Name != "Google" || providers[0].ClientSecret != `has "quotes"` ||
		providers[1].ID != "github" || providers[1].Kind != oidc.KindGitHub || providers[2].ID != "kc" || providers[2].Name != "Keycloak" {
		t.Fatalf("%+v", providers)
	}
	if _, err := oidc.New(oidc.Config{PublicURL: "https://a.test", Providers: providers}); err != nil {
		t.Fatalf("what the file says must be valid: %v", err)
	}

	policy := oidc.PolicyFrom(rules, nil)
	ask := func(provider string, claims map[string]any) bool {
		return policy(context.Background(), oidc.SignUpRequest{Provider: provider, Claims: claims, VerifiedEmail: "a@example.com"}).Allow
	}
	for name, tc := range map[string]struct {
		provider string
		claims   map[string]any
		want     bool
	}{
		"the organization's claim":       {"google", map[string]any{"hd": "example.com"}, true},
		"another organization's claim":   {"google", map[string]any{"hd": "evil.test"}, false},
		"no claim (a personal account)":  {"google", map[string]any{}, false},
		"an email domain is not a claim": {"google", map[string]any{"email": "a@example.com"}, false},
		"no rule means closed":           {"github", map[string]any{"login": "x"}, false},
		"open":                           {"kc", nil, true},
		"an unknown provider":            {"nope", nil, false},
	} {
		if got := ask(tc.provider, tc.claims); got != tc.want {
			t.Errorf("%s: allowed=%v, want %v", name, got, tc.want)
		}
	}
}

func TestAProvidersFileThatIsWrongStopsStartup(t *testing.T) {
	for name, tc := range map[string]struct{ file, want string }{
		"a secret that is not set": {`[{"kind":"google","clientId":"i","clientSecret":"${NOPE}"}]`, "${NOPE}"},
		"a typo in a member":       {`[{"kind":"google","clientId":"i","signUps":{"open":true}}]`, "unknown field"},
		"not a list":               {`{"kind":"google"}`, "providers file"},
		"open and a claim":         {`[{"kind":"google","clientId":"i","signUp":{"open":true,"claim":"hd","values":["a"]}}]`, "not both"},
		"a claim with no values":   {`[{"kind":"google","clientId":"i","signUp":{"claim":"hd"}}]`, "both a claim and its values"},
	} {
		t.Run(name, func(t *testing.T) {
			_, _, err := oidc.ParseProviders(strings.NewReader(tc.file), vars(nil))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v, want %q", err, tc.want)
			}
		})
	}
}
