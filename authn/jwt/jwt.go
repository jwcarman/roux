// Package jwt is bearer-token sign-in for API-only callers (who-jwt): a client sends
// "Authorization: Bearer <access token>" from your authorization server and is signed in for that
// request, with no session, no cookie and no CSRF token. The token's (issuer, subject) is the same
// credential a provider account linked by browser sign-in is (package oidc), so one person reaches
// one identity from the browser and from the API when their provider puts the same iss and sub in
// both (Keycloak and Auth0 do; Google's and GitHub's access tokens are not JWTs).
//
// What it checks, and no setting loosens: the signature, against the issuer's keys (discovered
// from the issuer you configure, never from the token); the issuer is the one configured; the
// token has not expired; the audience contains one you configured (without it, a token the same
// server issued for any other application, or an ID token issued to another site, would sign in
// here); the token has a subject; and the subject is linked to an active identity. Every refusal
// is the same 401 sign-in-failed, with WWW-Authenticate: Bearer; the reason goes to the debug log
// and the token never to any log.
//
// A person does not become an identity by presenting a token: link the account first (the OIDC
// sign-in does it, or oidc.LinkAccount). The identity's own permissions apply: a token carries no
// scopes here, unlike an API key.
//
// Recent sign-in uses the token's auth_time (OpenID Connect Core, RFC 9470): recent enough is
// allowed; older is 401 with the step-up challenge; none is 403.
package jwt

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	goidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/oidc"
	"github.com/jwcarman/roux/pgdb"
)

// Migration is what bearer sign-in needs: the table of linked provider accounts, which OIDC
// sign-in owns. (A migration listed by two modules runs once.)
var Migration pgdb.Migration = oidc.Migration

// Config configures bearer-token sign-in.
type Config struct {
	// Issuer is your authorization server's issuer. Its keys are found by discovery
	// (<issuer>/.well-known/openid-configuration) unless JWKSURL says where they are.
	Issuer string
	// JWKSURL is where the issuer's signing keys are, for a server without discovery.
	JWKSURL string
	// Audiences are the audiences a token must name at least one of (the aud claim). Required:
	// it is what stops a token issued for another application from signing in here.
	Audiences []string
	// HTTPClient is for calls to the authorization server (default: a client with a timeout).
	HTTPClient *http.Client
	// Clock is the time source; default time.Now.
	Clock func() time.Time
}

// Method is bearer-token sign-in. Pass it to authn.Register.
type Method struct {
	cfg  Config
	host *authn.Host

	mu       sync.Mutex
	verifier *goidc.IDTokenVerifier
}

// New validates the configuration (naming the fix in any error) and returns the method.
func New(cfg Config) (*Method, error) {
	var errs []error
	check := func(name, v string) {
		if u, err := url.Parse(v); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			errs = append(errs, fmt.Errorf("%s %q must be an http(s) address", name, v))
		}
	}
	if cfg.Issuer == "" {
		errs = append(errs, errors.New("jwt: Issuer is required: your authorization server's issuer"))
	} else {
		check("Issuer", cfg.Issuer)
	}
	if cfg.JWKSURL != "" {
		check("JWKSURL", cfg.JWKSURL)
	}
	var audiences []string
	for _, a := range cfg.Audiences {
		if a = strings.TrimSpace(a); a != "" {
			audiences = append(audiences, a)
		}
	}
	if len(audiences) == 0 {
		errs = append(errs, errors.New("jwt: Audiences is required: the audience your tokens name (without it a token issued for another application would sign in here)"))
	}
	cfg.Audiences = audiences
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	if err := errors.Join(errs...); err != nil {
		return nil, fmt.Errorf("jwt: %w", err)
	}
	return &Method{cfg: cfg}, nil
}

// Contribute adds nothing to the sign-in page: a token is for a client, not a person.
func (m *Method) Contribute(*authn.SignInOptions) {
	// nothing to offer on the page: a token comes from your authorization server, not from here
}

// Mount lets the Authorization header sign requests in.
func (m *Method) Mount(h *authn.Host) error {
	m.host = h
	h.AddAuthenticator("Authorization", m.authenticate)
	return nil
}

var signingAlgs = []string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512", "EdDSA"}

// discover finds the issuer's keys, once it can (and again after a failure).
func (m *Method) discover(ctx context.Context) (*goidc.IDTokenVerifier, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.verifier != nil {
		return m.verifier, nil
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, m.cfg.HTTPClient)
	conf := &goidc.Config{SkipClientIDCheck: true, SupportedSigningAlgs: signingAlgs, Now: m.cfg.Clock} // the audience is checked below
	if m.cfg.JWKSURL != "" {
		m.verifier = goidc.NewVerifier(m.cfg.Issuer, goidc.NewRemoteKeySet(ctx, m.cfg.JWKSURL), conf)
		return m.verifier, nil
	}
	p, err := goidc.NewProvider(ctx, m.cfg.Issuer) // refuses an issuer that is not the one asked for
	if err != nil {
		return nil, fmt.Errorf("discovering %s: %w", m.cfg.Issuer, err)
	}
	m.verifier = p.Verifier(conf)
	return m.verifier, nil
}

// bearer is the token in an Authorization header, if it is one.
func bearer(value string) (string, bool) {
	scheme, token, ok := strings.Cut(strings.TrimSpace(value), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
		return "", false
	}
	return strings.TrimSpace(token), true
}

func (m *Method) authenticate(r *http.Request, value string) (*authn.Principal, error) {
	token, ok := bearer(value)
	if !ok {
		return nil, nil // another scheme: not ours to judge
	}
	ctx := r.Context()
	refuse := func(why string, err error) (*authn.Principal, error) {
		slog.DebugContext(ctx, "bearer token refused", "why", why, "err", err)
		return nil, authn.SignInFailed().WithHeader("WWW-Authenticate", "Bearer")
	}
	verifier, err := m.discover(ctx)
	if err != nil {
		return refuse("the issuer's keys are not available", err)
	}
	id, err := verifier.Verify(ctx, token) // signature, issuer, expiry
	if err != nil {
		return refuse("verify", err)
	}
	if id.Subject == "" {
		return refuse("no subject", nil)
	}
	if !audienceMatches(id.Audience, m.cfg.Audiences) {
		return refuse("audience", nil)
	}
	var claims struct {
		AuthTime *float64 `json:"auth_time"`
	}
	if err := id.Claims(&claims); err != nil {
		return refuse("claims", err)
	}

	pool := m.host.Pool()
	cred, found, err := oidc.FindCredential(ctx, pool, m.cfg.Issuer, id.Subject)
	if err != nil {
		return nil, err
	}
	if !found {
		return refuse("unknown credential", nil)
	}
	res, identity, err := authn.Resolve(ctx, pool, cred)
	if err != nil {
		return nil, err
	}
	if res != authn.Resolved {
		return refuse("no active identity", nil)
	}
	perms, err := m.host.PermissionsOf(ctx, identity)
	if err != nil {
		return nil, err
	}
	p := &authn.Principal{IdentityID: identity, CredentialID: cred, Permissions: perms, Method: authn.MethodJWT}
	if claims.AuthTime != nil {
		// A sign-in cannot follow the token it brought: one later than the token's issue time
		// (beyond clock skew) is not believed, so the token counts as having none.
		at := time.Unix(int64(*claims.AuthTime), 0).UTC()
		if !at.After(id.IssuedAt.Add(authTimeSkew)) {
			p.SignedInAt = at
		}
	}
	return p, nil
}

// authTimeSkew is how far past the token's issue time its auth_time may be: two clocks a little
// apart.
const authTimeSkew = time.Minute

func audienceMatches(got, want []string) bool {
	for _, a := range got {
		for _, w := range want {
			if a == w {
				return true
			}
		}
	}
	return false
}
