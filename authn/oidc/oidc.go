// Package oidc is sign-in with a provider account: Google, GitHub or any OpenID Connect
// provider (who-oidc). Endpoints under who's base path:
//
//	GET    /who/oidc/authorize/{id}     starts a sign-in: redirects to the provider
//	GET    /who/oidc/callback/{id}      the provider's answer: signs in, or redirects with ?pending= / ?error=
//	GET    /who/oidc/pending            the account waiting for the person to confirm
//	POST   /who/oidc/pending/sign-up    confirms: creates the identity (if the policy allows) and signs in
//	POST   /who/oidc/pending/link       confirms linking the account to the signed-in identity
//	GET    /who/me/accounts             [{id, provider, linkedAt}], oldest first
//	POST   /who/me/accounts/{id}        starts linking a provider account (recent sign-in)
//	DELETE /who/me/accounts/{id}        unlinks (recent sign-in; never the last way in)
//
// What it will not do, and no setting changes it: sign in, link or match by email address
// (an account is (issuer, subject)); trust the issuer a token names for itself; create an
// identity or link an account from a provider callback alone (the person confirms first);
// keep anything of the provider's after the callback (no tokens). Sign-up is closed unless
// the SignUp policy allows an account.
package oidc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the provider-account schema; it runs after who's.
var Migration = pgdb.Migration{Name: "roux-authn-oidc", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

// methodName is how /who/me reports a session that signed in with a provider.
const methodName = "oidc"

// SignUpRequest is an account that is not known, asking to become an identity.
type SignUpRequest struct {
	// Provider is the provider's id; Issuer is the issuer your configuration names for it.
	Provider, Issuer, Subject string
	// DisplayName is the account's email, username or name, as the person saw it.
	DisplayName string
	// Claims are the provider's simple-valued claims (text, true/false, numbers), read-only.
	Claims map[string]any
	// VerifiedEmail is set only for a provider trusted for email that marks the address verified.
	VerifiedEmail string
}

// SignUpDecision answers a SignUpRequest.
type SignUpDecision struct {
	Allow bool
	// Setup runs in the transaction that creates the identity (give it a role, a user
	// record...); if it fails nothing is created.
	Setup func(ctx context.Context, tx pgx.Tx, identityID uuid.UUID) error
}

// SignUpPolicy decides who may sign up. The default refuses everyone. Allow-list an
// organization by a claim the provider vouches for (Google's hd, Entra's tid), never by the
// domain of an email address.
type SignUpPolicy func(ctx context.Context, r SignUpRequest) SignUpDecision

// Config configures provider sign-in.
type Config struct {
	Providers []Provider
	// PublicURL is the address people reach the app at ("https://app.example.com"): the
	// callback you register with each provider is PublicURL + base path + /oidc/callback/{id}.
	PublicURL string
	// SuccessURL, FailureURL and LinkURL are paths on this site: where a sign-in lands (default
	// "/"), where a pending sign-up and every failure land (default "/"), and where a link the
	// person asked for lands (default SuccessURL).
	SuccessURL, FailureURL, LinkURL string
	// SignUp decides who may sign up; default: no one.
	SignUp SignUpPolicy
	// SignUpWindow is how long an account waits for the person to confirm it (default 10 minutes).
	SignUpWindow time.Duration
	// LinkWindow is how long a link the person started may take at the provider (default 10 minutes).
	LinkWindow time.Duration
	// Notify tells the owner an account was linked (a failure is logged, never fails the link).
	Notify func(ctx context.Context, identityID uuid.UUID, provider string) error
	// HTTPClient is for calls to providers (default http.DefaultClient with a timeout).
	HTTPClient *http.Client
	// Clock is the time source; default time.Now.
	Clock func() time.Time
}

// Method is provider sign-in. Pass it to authn.Register.
type Method struct {
	cfg       Config
	providers map[string]*runtime
	order     []string
	pool      *pgxpool.Pool
	host      *authn.Host
}

// New validates the configuration (naming the fix in any error) and returns the method.
func New(cfg Config) (*Method, error) {
	var errs []error
	u, err := url.Parse(cfg.PublicURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		errs = append(errs, fmt.Errorf("PublicURL %q must be the app's address, such as https://app.example.com", cfg.PublicURL))
	}
	cfg.PublicURL = strings.TrimSuffix(cfg.PublicURL, "/")
	if cfg.SuccessURL == "" {
		cfg.SuccessURL = "/"
	}
	if cfg.FailureURL == "" {
		cfg.FailureURL = "/"
	}
	if cfg.LinkURL == "" {
		cfg.LinkURL = cfg.SuccessURL
	}
	for name, v := range map[string]string{"SuccessURL": cfg.SuccessURL, "FailureURL": cfg.FailureURL, "LinkURL": cfg.LinkURL} {
		if !strings.HasPrefix(v, "/") || strings.HasPrefix(v, "//") || strings.ContainsAny(v, "\\\r\n") {
			errs = append(errs, fmt.Errorf("%s %q must be a path on this site: it starts with / (not //) and has no scheme", name, v))
		}
	}
	if cfg.SignUp == nil {
		cfg.SignUp = func(context.Context, SignUpRequest) SignUpDecision { return SignUpDecision{} }
	}
	if cfg.SignUpWindow <= 0 {
		cfg.SignUpWindow = 10 * time.Minute
	}
	if cfg.LinkWindow <= 0 {
		cfg.LinkWindow = 10 * time.Minute
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if len(cfg.Providers) == 0 {
		errs = append(errs, errors.New("oidc: Providers is empty: configure at least one provider"))
	}
	m := &Method{cfg: cfg, providers: map[string]*runtime{}}
	issuers := map[string]string{}
	for _, p := range cfg.Providers {
		p, err := p.validate()
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if _, dup := m.providers[p.ID]; dup {
			errs = append(errs, fmt.Errorf("provider %q is configured twice", p.ID))
			continue
		}
		if other, dup := issuers[p.Issuer]; dup {
			errs = append(errs, fmt.Errorf("providers %q and %q have the same issuer %q: one account would be two credentials", other, p.ID, p.Issuer))
			continue
		}
		issuers[p.Issuer] = p.ID
		m.providers[p.ID] = &runtime{p: p, client: cfg.HTTPClient}
		m.order = append(m.order, p.ID)
	}
	if err := errors.Join(errs...); err != nil {
		return nil, fmt.Errorf("oidc: %w", err)
	}
	return m, nil
}

func (m *Method) now() time.Time { return m.cfg.Clock().UTC() }

// Contribute adds the providers to GET /who/sign-in.
func (m *Method) Contribute(o *authn.SignInOptions) {
	for _, id := range m.order {
		o.Providers = append(o.Providers, authn.Provider{ID: id, Name: m.providers[id].p.Name})
	}
}

// Mount registers the endpoints and the account counter.
func (m *Method) Mount(h *authn.Host) error {
	m.host, m.pool = h, h.Pool()
	for _, id := range m.order {
		rt := m.providers[id]
		redirect := m.cfg.PublicURL + h.BasePath() + "/oidc/callback/" + id
		*rt = *newRuntime(rt.p, redirect, m.cfg.HTTPClient)
	}
	h.AddCounter(authn.Counter{Kind: "account", Count: func(ctx context.Context, db authn.DBTX, identityID uuid.UUID) (int64, error) {
		var n int64
		err := db.QueryRow(ctx, `
			select count(*) from roux_federated_credential f
			  join roux_credential_identity ci on ci.credential_id = f.id
			 where ci.identity_id = $1`, identityID).Scan(&n)
		return n, err
	}})
	h.Handle("GET /oidc/authorize/{id}", m.authorize)
	h.Handle("GET /oidc/callback/{id}", m.callback)
	h.Handle("GET /oidc/pending", m.pending)
	h.Handle("POST /oidc/pending/sign-up", m.signUp)
	h.HandleSigned("POST /oidc/pending/link", m.confirmLink)
	m.mountAccounts(h)
	return nil
}

// The who error codes of provider sign-in.
func unknownProvider() error {
	return authn.NewError(http.StatusNotFound, "unknown-provider", "Unknown sign-in provider")
}
func noPending() error {
	return authn.NewError(http.StatusNotFound, "no-pending-sign-up", "There is no sign-up waiting to be confirmed")
}
func signUpRefused() error {
	return authn.NewError(http.StatusForbidden, "sign-up-refused", "Sign-up is not open to this account")
}
func alreadyLinked() error {
	return authn.NewError(http.StatusConflict, "already-linked", "That account is linked to another identity")
}
func accountNotFound() error {
	return authn.NewError(http.StatusNotFound, "linked-account-not-found", "No such linked account")
}

func hashOf(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// The pages the browser lands on. Reasons never appear in a URL beyond these codes; the
// real reason is in the debug log.
const (
	errSignInFailed  = "signin-failed"
	errAlreadyLinked = "already-linked"
	errSignedIn      = "signed-in"
)

func landing(base, key, value string) string {
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + key + "=" + url.QueryEscape(value)
}

func (m *Method) failure(code string) string { return landing(m.cfg.FailureURL, "error", code) }

func (m *Method) cookie(r *http.Request, name, value string, maxAge int) *http.Cookie {
	return &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, Secure: m.host.SecureCookie(r), SameSite: http.SameSiteLaxMode}
}

func (m *Method) debug(r *http.Request, why string, err error) {
	slog.DebugContext(r.Context(), "provider sign-in refused", "why", why, "err", err)
}
