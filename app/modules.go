package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/apikey"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authn/jwt"
	"github.com/jwcarman/roux/authn/oidc"
	"github.com/jwcarman/roux/authn/passkey"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/money"
	"github.com/jwcarman/roux/organization"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/spa"
	"github.com/jwcarman/roux/theme"
	"github.com/jwcarman/roux/users"
)

// The stock modules read their settings from the environment (the variables are listed on each
// constructor), and return nil when their feature is off, so a caller adds one only if it is
// non-nil. A module that needs another takes it as an argument.

// Getenv is os.Getenv with a default for an unset or empty variable.
func Getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func duration(key string) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return 0, nil // the default
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return d, nil
}

// SecureCookies says whether every cookie is marked Secure whatever the request looks like.
//
//	COOKIE_SECURE   true or false; unset, it follows PUBLIC_URL (https:// means true)
//
// Behind a load balancer or ingress that ends TLS the server sees plain HTTP, so it cannot tell
// by itself that the browser is on HTTPS: set PUBLIC_URL to the https address (or COOKIE_SECURE=true).
func SecureCookies() (bool, error) {
	switch v := os.Getenv("COOKIE_SECURE"); v {
	case "":
		return strings.HasPrefix(strings.ToLower(os.Getenv("PUBLIC_URL")), "https://"), nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("COOKIE_SECURE must be true or false, not %q", v)
	}
}

// EmailLink is sign-in by an emailed link or typed code.
type EmailLink struct{ Method *emaillink.Method }

func (*EmailLink) Name() string                 { return "email-link" }
func (*EmailLink) Migrations() []pgdb.Migration { return []pgdb.Migration{emaillink.Migration} }
func (e *EmailLink) SignIn() authn.Method       { return e.Method }

// EmailLinkFromEnv is the email module, or nil (with a note in the log) when CODE_SECRET is not
// set: signing in is opt-in.
//
//	CODE_SECRET   at least 32 random characters (openssl rand -base64 32); required to turn it on
//	PUBLIC_URL    where browsers reach the app (default http://localhost:8080); sign-in links point here
//	SMTP_ADDR     host:port of the mail server (default localhost:1025, Mailpit)
//	MAIL_FROM     the sender's address (default no-reply@localhost)
//	EMAIL_RESEND_INTERVAL, EMAIL_TOKEN_TTL   durations such as 1s or 5m (defaults 60s and 5m)
func EmailLinkFromEnv(appName string) (*EmailLink, error) {
	secret := os.Getenv("CODE_SECRET")
	if secret == "" {
		slog.Info("signing in is off: set CODE_SECRET to turn it on")
		return nil, nil
	}
	resend, err := duration("EMAIL_RESEND_INTERVAL")
	if err != nil {
		return nil, err
	}
	ttl, err := duration("EMAIL_TOKEN_TTL")
	if err != nil {
		return nil, err
	}
	m, err := emaillink.New(emaillink.Config{
		LinkBaseURL:    strings.TrimRight(Getenv("PUBLIC_URL", "http://localhost:8080"), "/") + "/signin/link",
		CodeSecret:     secret,
		ResendInterval: resend,
		TokenTTL:       ttl,
		AppName:        appName,
		Sender: &emaillink.SMTPSender{
			Addr: Getenv("SMTP_ADDR", "localhost:1025"),
			From: Getenv("MAIL_FROM", "no-reply@localhost"),
		},
	})
	if err != nil {
		return nil, err
	}
	return &EmailLink{Method: m}, nil
}

// Passkeys is sign-in with passkeys (WebAuthn).
type Passkeys struct{ Method *passkey.Method }

func (*Passkeys) Name() string                 { return "passkeys" }
func (*Passkeys) Migrations() []pgdb.Migration { return []pgdb.Migration{passkey.Migration} }
func (p *Passkeys) SignIn() authn.Method       { return p.Method }

// Drain waits for notices accepted a moment ago to go out.
func (p *Passkeys) Drain() { p.Method.Wait() }

// PasskeysFromEnv is the passkey module, or nil when PASSKEY_RP_ID is not set. It needs email
// sign-in too: a passkey is registered from a recent session, and email is what makes the first
// one, and what names the passkey and announces it.
//
//	PASSKEY_RP_ID    the host of the app: app.example.com, or localhost for development
//	PASSKEY_ORIGINS  allowed origins, comma separated (default https://<rp id>); for local
//	                 development use http://localhost:8080
func PasskeysFromEnv(appName string, email *EmailLink) (*Passkeys, error) {
	rp := os.Getenv("PASSKEY_RP_ID")
	if rp == "" {
		slog.Info("passkeys are off: set PASSKEY_RP_ID to turn them on")
		return nil, nil
	}
	if email == nil {
		return nil, errors.New("passkeys need email sign-in (set CODE_SECRET): a passkey is registered from a recent session, which email makes")
	}
	var origins []string
	if v := os.Getenv("PASSKEY_ORIGINS"); v != "" {
		for _, o := range strings.Split(v, ",") {
			origins = append(origins, strings.TrimSpace(o))
		}
	}
	m, err := passkey.New(passkey.Config{
		RPID: rp, RPName: appName, AllowedOrigins: origins,
		NameFor: email.Method.AddressFor, Notify: email.Method.PasskeyAdded,
	})
	if err != nil {
		return nil, err
	}
	return &Passkeys{Method: m}, nil
}

// APIKeys is API key authentication.
type APIKeys struct{ Method *apikey.Method }

func (*APIKeys) Name() string                 { return "api-keys" }
func (*APIKeys) Migrations() []pgdb.Migration { return []pgdb.Migration{apikey.Migration} }
func (k *APIKeys) SignIn() authn.Method       { return k.Method }

// APIKeysFromEnv is the API key module, or nil when API_KEYS=off. Keys are made by a signed-in
// person, so it needs sign-in to be on.
//
//	API_KEYS              off to turn API keys off (default on)
//	API_KEY_PREFIX        what every key starts with (default roux_); API_KEY_HEADER (default X-API-Key)
//	API_KEY_MAX_LIFETIME  the longest a key may last, such as 2160h (default 365 days)
func APIKeysFromEnv(email *EmailLink) (*APIKeys, error) {
	if email == nil {
		return nil, nil
	}
	if os.Getenv("API_KEYS") == "off" {
		slog.Info("API keys are off")
		return nil, nil
	}
	cfg := apikey.Config{Prefix: os.Getenv("API_KEY_PREFIX"), Header: os.Getenv("API_KEY_HEADER")}
	max, err := duration("API_KEY_MAX_LIFETIME")
	if err != nil {
		return nil, err
	}
	cfg.MaxLifetime = max
	m, err := apikey.New(cfg)
	if err != nil {
		return nil, err
	}
	return &APIKeys{Method: m}, nil
}

// JWT is bearer-token sign-in for API-only callers.
type JWT struct{ Method *jwt.Method }

func (*JWT) Name() string                 { return "jwt" }
func (*JWT) Migrations() []pgdb.Migration { return []pgdb.Migration{jwt.Migration} }
func (j *JWT) SignIn() authn.Method       { return j.Method }

// JWTFromEnv is the bearer-token module, or nil when JWT_ISSUER is not set. A token signs in only
// as an identity its (issuer, subject) is linked to, which provider sign-in does (OIDC_PROVIDERS_FILE).
//
//	JWT_ISSUER     your authorization server's issuer; its keys are found by discovery
//	JWT_AUDIENCES  the audiences a token must name one of, comma separated (required with JWT_ISSUER)
//	JWT_JWKS_URL   where the signing keys are, for a server without discovery
func JWTFromEnv(email *EmailLink) (*JWT, error) {
	issuer := os.Getenv("JWT_ISSUER")
	if issuer == "" {
		slog.Info("bearer tokens are off: set JWT_ISSUER to turn them on")
		return nil, nil
	}
	if email == nil {
		return nil, errors.New("bearer tokens need sign-in to be on (set CODE_SECRET): a token signs in as an identity that exists")
	}
	var audiences []string
	for _, a := range strings.Split(os.Getenv("JWT_AUDIENCES"), ",") {
		audiences = append(audiences, strings.TrimSpace(a))
	}
	m, err := jwt.New(jwt.Config{Issuer: issuer, JWKSURL: os.Getenv("JWT_JWKS_URL"), Audiences: audiences})
	if err != nil {
		return nil, err
	}
	return &JWT{Method: m}, nil
}

// OIDC is sign-in with Google, GitHub or any OpenID Connect provider.
type OIDC struct{ Method *oidc.Method }

func (*OIDC) Name() string                 { return "oidc" }
func (*OIDC) Migrations() []pgdb.Migration { return []pgdb.Migration{oidc.Migration} }
func (o *OIDC) SignIn() authn.Method       { return o.Method }

// OIDCFromEnv is the provider sign-in module, or nil when OIDC_PROVIDERS_FILE is not set. A new
// identity becomes a user through the users module, in the transaction that creates it.
//
//	OIDC_PROVIDERS_FILE  a JSON list of providers (see oidc.ParseProviders); ${NAME} in it is an environment variable
//	PUBLIC_URL           where browsers reach the app: each provider's callback is PUBLIC_URL/api/roux/auth/oidc/callback/{id}
//	OIDC_SUCCESS_URL     where a sign-in lands (default /); OIDC_FAILURE_URL where failures and a pending
//	                     sign-up land (default /signin); OIDC_LINK_URL where a requested link lands (default success)
//	OIDC_SIGNUP_ROLE     the role a provider sign-up gets (default: the first of INVITABLE_ROLES)
//
// Sign-up is closed for any provider whose entry has no "signUp" rule.
func OIDCFromEnv(email *EmailLink, members *Users) (*OIDC, error) {
	path := os.Getenv("OIDC_PROVIDERS_FILE")
	if path == "" {
		slog.Info("provider sign-in is off: set OIDC_PROVIDERS_FILE to turn it on")
		return nil, nil
	}
	if email == nil || members == nil {
		return nil, errors.New("provider sign-in needs email sign-in (set CODE_SECRET): the first owner and every invitation come by email")
	}
	providers, rules, err := oidc.LoadProviders(path)
	if err != nil {
		return nil, err
	}
	role := os.Getenv("OIDC_SIGNUP_ROLE")
	if role == "" {
		role = strings.TrimSpace(strings.Split(Getenv("INVITABLE_ROLES", "USER"), ",")[0])
	}
	m, err := oidc.New(oidc.Config{
		Providers:  providers,
		PublicURL:  Getenv("PUBLIC_URL", "http://localhost:8080"),
		SuccessURL: Getenv("OIDC_SUCCESS_URL", "/"),
		FailureURL: Getenv("OIDC_FAILURE_URL", "/signin"),
		LinkURL:    os.Getenv("OIDC_LINK_URL"),
		SignUp: oidc.PolicyFrom(rules, func(ctx context.Context, tx pgx.Tx, id uuid.UUID, r oidc.SignUpRequest) error {
			return members.SignUp(ctx, tx, id, r.DisplayName, role) // the service exists by the time anyone signs up
		}),
		Notify: email.Method.AccountLinked,
	})
	if err != nil {
		return nil, err
	}
	return &OIDC{Method: m}, nil
}

// Users is roux's own endpoints: the users directory, roles, the theme and the organization,
// and the first owner.
type Users struct {
	email *EmailLink
	svc   users.Service
}

func (*Users) Name() string { return "users" }
func (*Users) Migrations() []pgdb.Migration {
	return []pgdb.Migration{activity.Migration, users.Migration, theme.Migration}
}

// UsersFromEnv is the users module. It needs email sign-in: invitations and the first owner
// come by email.
//
//	INVITABLE_ROLES  roles an invitation may give, comma separated (default USER)
//	ORG_TIME_ZONE    the organization's IANA time zone (default UTC); ORG_LOCALE (default en-US)
//	ORG_CURRENCY     the ISO 4217 currency the organization deals in, if any (USD)
//	OWNER_EMAIL      the first owner's address; OWNER_NAME their name (both, or neither)
func UsersFromEnv(email *EmailLink) *Users { return &Users{email: email} }

// SignUp makes a new identity a user, inside the transaction that creates it. It is what
// provider sign-up uses; the service is built when the module is mounted.
func (u *Users) SignUp(ctx context.Context, tx pgx.Tx, id uuid.UUID, name, role string) error {
	return u.svc.SignUp(ctx, tx, id, name, role)
}

// Mount registers roux's endpoints.
func (u *Users) Mount(_ context.Context, k *Kit) error {
	invitable, err := authz.NewInvitable(strings.Split(Getenv("INVITABLE_ROLES", "USER"), ","))
	if err != nil {
		return err
	}
	calendar, err := organization.NewCalendar(Getenv("ORG_TIME_ZONE", "UTC"), Getenv("ORG_LOCALE", "en-US"), time.Now)
	if err != nil {
		return err
	}
	if code := os.Getenv("ORG_CURRENCY"); code != "" {
		cur, err := money.ParseCurrency(code)
		if err != nil {
			return fmt.Errorf("ORG_CURRENCY: %w", err)
		}
		calendar = calendar.WithCurrency(cur)
	}
	themes := theme.Service{Pool: k.Pool, Defaults: spa.StockTheme(k.AppName)}
	u.svc = users.Service{Pool: k.Pool, Host: k.Host, Email: u.email.Method, Invitable: invitable}

	authz.RegisterInvitable(k.Mux, k.Host, invitable)
	organization.Register(k.Mux, k.Host, calendar.Context)
	theme.Register(k.Mux, k.Host, themes)
	users.Register(k.Mux, k.Host, u.svc)
	k.ShellTheme = themes.Shell
	k.Organization = calendar.Context
	return nil
}

// Start makes the first owner, when there is none.
func (u *Users) Start(ctx context.Context, _ *Kit) error {
	owner, name := os.Getenv("OWNER_EMAIL"), os.Getenv("OWNER_NAME")
	switch {
	case owner != "" && name == "", owner == "" && name != "":
		return errors.New("OWNER_EMAIL and OWNER_NAME go together: set both, or neither")
	case owner != "":
		created, err := u.svc.BootstrapOwner(ctx, owner, name)
		if err != nil {
			return fmt.Errorf("the first owner: %w", err)
		}
		if created {
			slog.Info("created the first owner")
		}
	}
	return nil
}
