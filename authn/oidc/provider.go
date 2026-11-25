package oidc

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	goidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

// Kind says how a provider is spoken to.
type Kind string

const (
	// KindOIDC is an OpenID Connect provider: its issuer is discovered, its ID token verified,
	// and the token's subject is the account.
	KindOIDC Kind = "oidc"
	// KindGitHub is github.com: OAuth 2 without OpenID Connect; the account is its numeric
	// user id (never the login, which changes when someone renames their account).
	KindGitHub Kind = "github"
	// KindOAuth2 is any other OAuth 2 provider without OpenID Connect: you name its endpoints,
	// an issuer (any stable string that identifies it) and the user-info attribute that holds
	// the account's immutable id.
	KindOAuth2 Kind = "oauth2"
)

const (
	githubIssuer   = "https://github.com"
	githubUserURL  = "https://api.github.com/user"
	googleIssuer   = "https://accounts.google.com"
	emailLookupMax = 3 * time.Second
)

// Provider is one place people can sign in with.
type Provider struct {
	// ID names the provider in URLs (/api/roux/auth/oidc/authorize/{ID}) and in the callback address you
	// register with it: lower case letters, digits and hyphens.
	ID string
	// Name is what the sign-in page's button says (default: the ID, capitalized).
	Name string
	Kind Kind
	// Issuer is the provider's issuer. For an OpenID Connect provider it is where discovery
	// happens and what every ID token's iss must equal; it comes from here, never from a token.
	Issuer       string
	ClientID     string
	ClientSecret string
	// Scopes default to openid, email and profile (OpenID Connect) or the provider's own.
	Scopes []string
	// AuthURL, TokenURL and UserInfoURL are for KindOAuth2 (and tests); an OpenID Connect
	// provider's come from discovery, GitHub's are built in.
	AuthURL, TokenURL, UserInfoURL string
	// SubjectAttribute is the user-info attribute holding the account's immutable id
	// (KindOAuth2; GitHub's is "id").
	SubjectAttribute string
	// TrustEmail says whether an address this provider marks verified may reach the sign-up
	// policy. Default true for Google and GitHub, false otherwise. Set it only for a provider
	// that verifies every address itself and lets no one claim an address they do not own.
	TrustEmail *bool
}

// Google is Google sign-in.
func Google(clientID, clientSecret string) Provider {
	return Provider{ID: "google", Name: "Google", Kind: KindOIDC, Issuer: googleIssuer, ClientID: clientID, ClientSecret: clientSecret}
}

// GitHub is github.com sign-in. Add the user:email scope (the default) so the account's
// primary verified address can reach the sign-up policy.
func GitHub(clientID, clientSecret string) Provider {
	return Provider{ID: "github", Name: "GitHub", Kind: KindGitHub, Issuer: githubIssuer, ClientID: clientID, ClientSecret: clientSecret}
}

var idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

func (p Provider) validate() (Provider, error) {
	var errs []error
	fail := func(format string, a ...any) {
		errs = append(errs, fmt.Errorf("provider %q: "+format, append([]any{p.ID}, a...)...))
	}
	if !idPattern.MatchString(p.ID) {
		fail("the id must be lower case letters, digits and hyphens (at most 32)")
	}
	if p.Name == "" {
		p.Name = strings.ToUpper(p.ID[:min(1, len(p.ID))]) + p.ID[min(1, len(p.ID)):]
	}
	if p.ClientID == "" {
		fail("the client id is required")
	}
	p, problems := p.forKind()
	for _, problem := range problems {
		fail("%s", problem)
	}
	if p.TrustEmail == nil {
		trust := p.Issuer == googleIssuer || p.Issuer == githubIssuer
		p.TrustEmail = &trust
	}
	return p, errors.Join(errs...)
}

// forKind fills the kind's defaults and says what the kind needs that is missing.
func (p Provider) forKind() (Provider, []string) {
	var problems []string
	switch p.Kind {
	case KindOIDC:
		if p.Issuer == "" {
			problems = append(problems, "an OpenID Connect provider needs its issuer")
		}
		if isEntraShared(p.Issuer) {
			problems = append(problems, "Microsoft's shared endpoints (common, organizations, consumers) are not supported: use your tenant's issuer")
		}
		if len(p.Scopes) == 0 {
			p.Scopes = []string{goidc.ScopeOpenID, "email", "profile"}
		}
	case KindGitHub:
		p.Issuer = githubIssuer
		p.UserInfoURL = cmp.Or(p.UserInfoURL, githubUserURL)
		p.SubjectAttribute = cmp.Or(p.SubjectAttribute, "id")
		if len(p.Scopes) == 0 {
			p.Scopes = []string{"read:user", "user:email"}
		}
	case KindOAuth2:
		if p.Issuer == "" || p.SubjectAttribute == "" {
			problems = append(problems, "an OAuth 2 provider needs an issuer (any stable string that names it) and a subject attribute (the user-info attribute holding the account's immutable id, never a username or an email address)")
		}
		if p.AuthURL == "" || p.TokenURL == "" || p.UserInfoURL == "" {
			problems = append(problems, "an OAuth 2 provider needs its authorization, token and user-info URLs")
		}
	default:
		problems = append(problems, fmt.Sprintf("the kind must be %q, %q or %q", KindOIDC, KindGitHub, KindOAuth2))
	}
	return p, problems
}

func isEntraShared(issuer string) bool {
	for _, t := range []string{"/common/", "/organizations/", "/consumers/"} {
		if strings.Contains(issuer, "login.microsoftonline.com"+t) {
			return true
		}
	}
	return false
}

// account is who a provider says the person is, after the exchange.
type account struct {
	Issuer, Subject, DisplayName string
	Claims                       map[string]any
	VerifiedEmail                string
}

// runtime is a provider ready to use: its OAuth 2 settings, and (for OpenID Connect) its
// discovered keys, found on first use and again after a failure.
type runtime struct {
	p      Provider
	client *http.Client
	oauth  oauth2.Config

	mu       sync.Mutex
	verifier *goidc.IDTokenVerifier
}

func newRuntime(p Provider, redirect string, client *http.Client) *runtime {
	rt := &runtime{p: p, client: client}
	rt.oauth = oauth2.Config{ClientID: p.ClientID, ClientSecret: p.ClientSecret, RedirectURL: redirect, Scopes: p.Scopes}
	switch p.Kind {
	case KindGitHub:
		rt.oauth.Endpoint = github.Endpoint
		if p.AuthURL != "" {
			rt.oauth.Endpoint = oauth2.Endpoint{AuthURL: p.AuthURL, TokenURL: p.TokenURL}
		}
	case KindOAuth2:
		rt.oauth.Endpoint = oauth2.Endpoint{AuthURL: p.AuthURL, TokenURL: p.TokenURL}
	}
	return rt
}

func (rt *runtime) ctx(ctx context.Context) context.Context {
	if rt.client == nil {
		return ctx
	}
	return context.WithValue(ctx, oauth2.HTTPClient, rt.client)
}

// discover finds an OpenID Connect provider's endpoints and keys, once it can.
func (rt *runtime) discover(ctx context.Context) (*goidc.IDTokenVerifier, error) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.verifier != nil {
		return rt.verifier, nil
	}
	prov, err := goidc.NewProvider(rt.ctx(ctx), rt.p.Issuer) // refuses an issuer that is not the one asked for
	if err != nil {
		return nil, fmt.Errorf("discovering %s: %w", rt.p.Issuer, err)
	}
	rt.oauth.Endpoint = prov.Endpoint()
	rt.verifier = prov.Verifier(&goidc.Config{ClientID: rt.p.ClientID})
	return rt.verifier, nil
}

// authURL is where the browser goes, carrying the state, the PKCE challenge and (for OpenID
// Connect) the nonce. A link also asks the provider to show which account it is linking.
func (rt *runtime) authURL(ctx context.Context, state, nonce, verifier string, link bool) (string, error) {
	opts := []oauth2.AuthCodeOption{oauth2.S256ChallengeOption(verifier)}
	if rt.p.Kind == KindOIDC {
		if _, err := rt.discover(ctx); err != nil {
			return "", err
		}
		opts = append(opts, goidc.Nonce(nonce))
	}
	if link {
		switch {
		case rt.p.Issuer == googleIssuer || rt.p.Issuer == githubIssuer:
			opts = append(opts, oauth2.SetAuthURLParam("prompt", "select_account"))
		case rt.p.Kind == KindOIDC:
			opts = append(opts, oauth2.SetAuthURLParam("prompt", "login"))
		}
	}
	return rt.oauth.AuthCodeURL(state, opts...), nil
}

var errNoSubject = errors.New("the provider returned no subject")

// exchange trades the code for the account. Everything the provider says about the account
// is checked here; the caller decides what the account may do.
func (rt *runtime) exchange(ctx context.Context, code, verifier, nonce string) (account, error) {
	if rt.p.Kind == KindOIDC {
		if _, err := rt.discover(ctx); err != nil {
			return account{}, err
		}
	}
	tok, err := rt.oauth.Exchange(rt.ctx(ctx), code, oauth2.VerifierOption(verifier))
	if err != nil {
		return account{}, fmt.Errorf("exchanging the code: %w", err)
	}
	if rt.p.Kind == KindOIDC {
		return rt.fromIDToken(ctx, tok, nonce)
	}
	return rt.fromUserInfo(ctx, tok)
}

func (rt *runtime) fromIDToken(ctx context.Context, tok *oauth2.Token, nonce string) (account, error) {
	raw, _ := tok.Extra("id_token").(string)
	if raw == "" {
		return account{}, errors.New("the provider returned no ID token")
	}
	verifier, err := rt.discover(ctx)
	if err != nil {
		return account{}, err
	}
	id, err := verifier.Verify(rt.ctx(ctx), raw) // signature, issuer, audience, expiry
	if err != nil {
		return account{}, fmt.Errorf("the ID token: %w", err)
	}
	if id.Nonce != nonce {
		return account{}, errors.New("the ID token's nonce is not the one sent")
	}
	if id.Subject == "" {
		return account{}, errNoSubject
	}
	var all map[string]any
	if err := id.Claims(&all); err != nil {
		return account{}, err
	}
	a := account{Issuer: rt.p.Issuer, Subject: id.Subject, Claims: simple(all)}
	if verified, _ := all["email_verified"].(bool); verified && *rt.p.TrustEmail {
		a.VerifiedEmail, _ = all["email"].(string)
	}
	a.DisplayName = firstString(all, "email", "preferred_username", "name")
	if a.DisplayName == "" {
		a.DisplayName = id.Subject
	}
	return a, nil
}

func (rt *runtime) fromUserInfo(ctx context.Context, tok *oauth2.Token) (account, error) {
	client := rt.oauth.Client(rt.ctx(ctx), tok)
	var all map[string]any
	if err := getJSON(ctx, client, rt.p.UserInfoURL, &all); err != nil {
		return account{}, fmt.Errorf("the user info: %w", err)
	}
	subject := stringOf(all[rt.p.SubjectAttribute])
	if subject == "" {
		return account{}, errNoSubject
	}
	a := account{Issuer: rt.p.Issuer, Subject: subject, Claims: simple(all)}
	a.DisplayName = firstString(all, "login", "preferred_username", "email", "name")
	if a.DisplayName == "" {
		a.DisplayName = subject
	}
	if rt.p.Kind == KindGitHub && *rt.p.TrustEmail {
		a.VerifiedEmail = rt.githubEmail(ctx, client)
	}
	return a, nil
}

// githubEmail is the account's primary, verified address. It is a courtesy to the sign-up
// policy: when the lookup fails or is slow, the person still signs in and the policy sees none.
func (rt *runtime) githubEmail(ctx context.Context, client *http.Client) string {
	ctx, cancel := context.WithTimeout(ctx, emailLookupMax)
	defer cancel()
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := getJSON(ctx, client, strings.TrimSuffix(rt.p.UserInfoURL, "/")+"/emails", &emails); err != nil {
		return ""
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	return ""
}

func getJSON(ctx context.Context, client *http.Client, u string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s answered %d", u, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(into)
}

// simple keeps the claims a sign-up policy may read: text, true/false and numbers.
func simple(all map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range all {
		switch v.(type) {
		case string, bool, float64:
			out[k] = v
		}
	}
	return out
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s, _ := m[k].(string); s != "" {
			return s
		}
	}
	return ""
}

// stringOf spells a subject attribute: text as it is, a whole number without an exponent.
func stringOf(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	}
	return ""
}
