package oidc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Rule says who may sign up with one provider. There is no rule by the domain of an email
// address: a verified address proves only that someone could read a mailbox once. Allow-list
// an organization by a claim the provider vouches for (Google Workspace's hd, Entra's tid).
type Rule struct {
	// Open lets every account of the provider sign up.
	Open bool `json:"open"`
	// Claim and Values let the accounts whose claim is one of the values sign up.
	Claim  string   `json:"claim"`
	Values []string `json:"values"`
}

func (r Rule) allows(req SignUpRequest) bool {
	if r.Open {
		return true
	}
	if r.Claim == "" {
		return false
	}
	got, _ := req.Claims[r.Claim].(string)
	return got != "" && slices.Contains(r.Values, got)
}

func (r Rule) validate() error {
	switch {
	case r.Open && (r.Claim != "" || len(r.Values) > 0):
		return errors.New("signUp is either open or a claim with values, not both")
	case !r.Open && (r.Claim == "") != (len(r.Values) == 0):
		return errors.New("signUp needs both a claim and its values")
	}
	return nil
}

// PolicyFrom is a sign-up policy from per-provider rules (by provider id): a provider with no
// rule, or an account the rule does not allow, is refused. setup runs in the transaction that
// creates the identity.
func PolicyFrom(rules map[string]Rule, setup func(ctx context.Context, tx pgx.Tx, identityID uuid.UUID, r SignUpRequest) error) SignUpPolicy {
	return func(_ context.Context, req SignUpRequest) SignUpDecision {
		if !rules[req.Provider].allows(req) {
			return SignUpDecision{}
		}
		return SignUpDecision{Allow: true, Setup: func(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
			if setup == nil {
				return nil
			}
			return setup(ctx, tx, id, req)
		}}
	}
}

type fileEntry struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Kind             string   `json:"kind"` // google, github, oidc or oauth2
	Issuer           string   `json:"issuer"`
	ClientID         string   `json:"clientId"`
	ClientSecret     string   `json:"clientSecret"`
	Scopes           []string `json:"scopes"`
	AuthURL          string   `json:"authUrl"`
	TokenURL         string   `json:"tokenUrl"`
	UserInfoURL      string   `json:"userInfoUrl"`
	SubjectAttribute string   `json:"subjectAttribute"`
	TrustEmail       *bool    `json:"trustEmail"`
	SignUp           Rule     `json:"signUp"`
}

var varPattern = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// ParseProviders reads a JSON list of providers, such as
//
//	[
//	  {"kind": "google", "clientId": "...", "clientSecret": "${GOOGLE_CLIENT_SECRET}",
//	   "signUp": {"claim": "hd", "values": ["example.com"]}},
//	  {"kind": "oidc", "id": "keycloak", "issuer": "https://sso.example.com/realms/main",
//	   "clientId": "app", "clientSecret": "${KEYCLOAK_SECRET}", "signUp": {"open": true}}
//	]
//
// Secrets stay out of the file: ${NAME} is replaced by the environment variable, and one that
// is not set stops startup. Unknown members are errors, so a typo cannot silently turn a
// protection off. Sign-up is closed for a provider with no signUp.
func ParseProviders(r io.Reader, env func(string) (string, bool)) ([]Provider, map[string]Rule, error) {
	raw, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err != nil {
		return nil, nil, err
	}
	var missing []string
	raw = varPattern.ReplaceAllFunc(raw, func(m []byte) []byte {
		name := string(varPattern.FindSubmatch(m)[1])
		v, ok := env(name)
		if !ok {
			missing = append(missing, name)
		}
		b, _ := json.Marshal(v) // quoted, so a value cannot break out of its string
		return b[1 : len(b)-1]
	})
	if len(missing) > 0 {
		return nil, nil, fmt.Errorf("the providers file uses ${%s}, which is not set", missing[0])
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var entries []fileEntry
	if err := dec.Decode(&entries); err != nil {
		return nil, nil, fmt.Errorf("the providers file: %w", err)
	}
	var providers []Provider
	rules := map[string]Rule{}
	for i, e := range entries {
		p := Provider{
			ID: e.ID, Name: e.Name, Kind: Kind(e.Kind), Issuer: e.Issuer, ClientID: e.ClientID, ClientSecret: e.ClientSecret,
			Scopes: e.Scopes, AuthURL: e.AuthURL, TokenURL: e.TokenURL, UserInfoURL: e.UserInfoURL,
			SubjectAttribute: e.SubjectAttribute, TrustEmail: e.TrustEmail,
		}
		switch e.Kind {
		case "google":
			p.Kind, p.Issuer = KindOIDC, googleIssuer
			p.ID, p.Name = orDefault(e.ID, "google"), orDefault(e.Name, "Google")
		case "github":
			p.Kind, p.Issuer = KindGitHub, githubIssuer
			p.ID, p.Name = orDefault(e.ID, "github"), orDefault(e.Name, "GitHub")
		}
		if err := e.SignUp.validate(); err != nil {
			return nil, nil, fmt.Errorf("provider %d (%q): %w", i+1, p.ID, err)
		}
		providers = append(providers, p)
		rules[p.ID] = e.SignUp
	}
	return providers, rules, nil
}

// LoadProviders is ParseProviders for a file, with the process environment.
func LoadProviders(path string) ([]Provider, map[string]Rule, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = f.Close() }()
	return ParseProviders(f, os.LookupEnv)
}

func orDefault(v, d string) string {
	if v == "" {
		return d
	}
	return v
}
