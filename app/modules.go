package app

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
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

// list is a comma-separated variable's entries, each trimmed: "MEMBER, LEAD" is MEMBER and LEAD.
func list(key, fallback string) []string {
	entries := strings.Split(Getenv(key, fallback), ",")
	for i, e := range entries {
		entries[i] = strings.TrimSpace(e)
	}
	return entries
}

// boolean reads a true-or-false setting: unset is def, and anything but true or false is refused,
// so a TRUE, a 1 or an off never quietly means the default.
func boolean(key string, def bool) (bool, error) {
	switch v := os.Getenv(key); v {
	case "":
		return def, nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be true or false, not %q", key, v)
	}
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
// A PUBLIC_URL of http:// for a host other than this machine is refused unless COOKIE_SECURE=false
// says plain HTTP is on purpose.
func SecureCookies() (bool, error) {
	public := os.Getenv("PUBLIC_URL")
	switch v := os.Getenv("COOKIE_SECURE"); v {
	case "":
		if plainHTTPOffThisMachine(public) {
			return false, fmt.Errorf("PUBLIC_URL is %s: sign-in links and cookies would travel unencrypted. "+
				"Serve the app over HTTPS and set PUBLIC_URL to its https:// address, or set COOKIE_SECURE=false "+
				"to run on plain HTTP on purpose", public)
		}
		return strings.HasPrefix(strings.ToLower(public), "https://"), nil
	case "true":
		return true, nil
	case "false":
		if plainHTTPOffThisMachine(public) {
			slog.Warn("serving on plain HTTP (COOKIE_SECURE=false): sign-in links and cookies travel unencrypted", "publicUrl", public)
		}
		return false, nil
	default:
		return false, fmt.Errorf("COOKIE_SECURE must be true or false, not %q", v)
	}
}

// plainHTTPOffThisMachine says whether the address is http:// for a host other than this
// machine: development is on localhost, anything else is people's sign-ins on the wire.
func plainHTTPOffThisMachine(address string) bool {
	u, err := url.Parse(address)
	if err != nil || !strings.EqualFold(u.Scheme, "http") {
		return false
	}
	host := u.Hostname()
	if strings.EqualFold(host, "localhost") {
		return false
	}
	ip := net.ParseIP(host)
	return ip == nil || !ip.IsLoopback()
}

// EmailLink is sign-in by an emailed link or typed code.
type EmailLink struct {
	Method *emaillink.Method

	mail   *emaillink.SMTPSender
	checks sync.WaitGroup
}

// mailCheckTimeout bounds the startup check of the mail server.
const mailCheckTimeout = 10 * time.Second

// Start checks the mail server in the background (connect, secure, sign in; nothing is sent), so
// a slow or unreachable one never holds up startup. A failure is logged as an ERROR naming the
// cause: until it is fixed nobody can sign in by email. It is checked once; a failed send is
// logged the same way later.
func (e *EmailLink) Start(ctx context.Context, _ *Kit) error {
	e.checks.Go(func() {
		ctx, cancel := context.WithTimeout(ctx, mailCheckTimeout)
		defer cancel()
		if err := e.mail.Check(ctx); err != nil {
			slog.ErrorContext(ctx, "the mail server cannot be used: sign-in emails will not go out until this is fixed", "err", err)
			return
		}
		slog.InfoContext(ctx, "mail server ready", "addr", e.mail.Addr)
	})
	return nil
}

// Drain waits for the mail server check and for emails accepted a moment ago to go out.
func (e *EmailLink) Drain() {
	e.checks.Wait()
	e.Method.Wait()
}

func (*EmailLink) Name() string                 { return "email-link" }
func (*EmailLink) Migrations() []pgdb.Migration { return []pgdb.Migration{emaillink.Migration} }
func (e *EmailLink) SignIn() authn.Method       { return e.Method }

// EmailLinkFromEnv is the email module: sign-in by an emailed link or typed code, which every
// other way in (passkeys, providers, API keys, bearer tokens) builds on. CODE_SECRET is required.
//
//	CODE_SECRET   at least 32 random characters (openssl rand -base64 32), the same on every instance;
//	              weaker than about 128 bits logs a warning, and make dev's secret is refused behind an https:// PUBLIC_URL
//	PUBLIC_URL    where browsers reach the app (default http://localhost:8080); sign-in links point here
//	SMTP_ADDR     host:port of the mail server (default localhost:1025, Mailpit)
//	MAIL_FROM     the sender's address (default no-reply@localhost)
//	SMTP_USERNAME, SMTP_PASSWORD  the mail server's login, if it asks for one (both, or neither)
//	SMTP_ALLOW_PLAINTEXT  true to send without STARTTLS to a relay off this machine, on a network you trust
//	EMAIL_RESEND_INTERVAL, EMAIL_TOKEN_TTL   durations such as 1s or 5m (defaults 60s and 5m)
//
// emails is the app's own wording for roux's emails (emaillink.Config.Templates): the template's
// cmd/server/emails folder, where a file named after an email replaces roux's.
func EmailLinkFromEnv(appName string, emails fs.FS) (*EmailLink, error) {
	secret := os.Getenv("CODE_SECRET")
	if secret == "" {
		return nil, errors.New("CODE_SECRET is required: the key that hashes sign-in codes, at least 32 random " +
			"characters, the same on every instance (openssl rand -base64 32; make dev sets one for development)")
	}
	if err := checkCodeSecret(secret, publicURL()); err != nil {
		return nil, err
	}
	resend, err := duration("EMAIL_RESEND_INTERVAL")
	if err != nil {
		return nil, err
	}
	ttl, err := duration("EMAIL_TOKEN_TTL")
	if err != nil {
		return nil, err
	}
	plaintext, err := boolean("SMTP_ALLOW_PLAINTEXT", false)
	if err != nil {
		return nil, err
	}
	user, password := os.Getenv("SMTP_USERNAME"), os.Getenv("SMTP_PASSWORD")
	if (user == "") != (password == "") {
		return nil, errors.New("SMTP_USERNAME and SMTP_PASSWORD go together: set both to sign in to the mail server, or neither")
	}
	sender := &emaillink.SMTPSender{
		Addr:           Getenv("SMTP_ADDR", "localhost:1025"),
		From:           Getenv("MAIL_FROM", "no-reply@localhost"),
		Username:       user,
		Password:       password,
		AllowPlaintext: plaintext,
	}
	if err := checkMailSettings(sender); err != nil {
		return nil, err
	}
	m, err := emaillink.New(emaillink.Config{
		LinkBaseURL:    strings.TrimRight(publicURL(), "/") + "/signin/link",
		CodeSecret:     secret,
		ResendInterval: resend,
		TokenTTL:       ttl,
		AppName:        appName,
		Templates:      emails,
		Sender:         sender,
	})
	if err != nil {
		return nil, err
	}
	return &EmailLink{Method: m, mail: sender}, nil
}

// checkMailSettings refuses SMTP_ADDR and MAIL_FROM that could never work: typos, not outages.
func checkMailSettings(s *emaillink.SMTPSender) error {
	host, port, err := net.SplitHostPort(s.Addr)
	if n, perr := strconv.Atoi(port); err != nil || host == "" || perr != nil || n < 1 || n > 65535 {
		return fmt.Errorf("SMTP_ADDR is %q: it must be the mail server's host:port, such as smtp.example.com:587 "+
			"(STARTTLS) or smtp.example.com:465 (TLS)", s.Addr)
	}
	if _, err := mail.ParseAddress(s.From); err != nil {
		return fmt.Errorf("MAIL_FROM is %q: it must be an email address, such as no-reply@example.com or "+
			"\"Acme <no-reply@example.com>\"", s.From)
	}
	return nil
}

// Passkeys is sign-in with passkeys (WebAuthn).
type Passkeys struct{ Method *passkey.Method }

func (*Passkeys) Name() string                 { return "passkeys" }
func (*Passkeys) Migrations() []pgdb.Migration { return []pgdb.Migration{passkey.Migration} }
func (p *Passkeys) SignIn() authn.Method       { return p.Method }

// Drain waits for notices accepted a moment ago to go out.
func (p *Passkeys) Drain() { p.Method.Wait() }

// PasskeysFromEnv is the passkey module, or nil when PASSKEYS=false. It follows PUBLIC_URL: the
// relying party is its host and its origin is allowed, so the address people use is the one that
// works. It needs email sign-in too: a passkey is registered from a recent session, and email is
// what makes the first one, and what names the passkey and announces it.
//
//	PASSKEYS         true or false (default true)
//	PASSKEY_RP_ID    the relying party, when it is not PUBLIC_URL's host: a parent domain
//	                 (example.com for app.example.com), so passkeys work across its subdomains
//	PASSKEY_ORIGINS  more allowed origins, comma separated, beside PUBLIC_URL's (the Vite dev
//	                 server's, http://localhost:5173, say)
func PasskeysFromEnv(appName string, email *EmailLink) (*Passkeys, error) {
	on, err := boolean("PASSKEYS", true)
	if err != nil || !on {
		if err == nil {
			slog.Info("passkeys are off (PASSKEYS=false)")
		}
		return nil, err
	}
	if email == nil {
		return nil, errors.New("passkeys need email sign-in (set CODE_SECRET): a passkey is registered from a recent session, which email makes")
	}
	public, err := url.Parse(publicURL())
	if err != nil || public.Scheme == "" || public.Host == "" {
		return nil, fmt.Errorf("PUBLIC_URL must be the address people use, such as https://app.example.com, not %q", os.Getenv("PUBLIC_URL"))
	}
	rp := Getenv("PASSKEY_RP_ID", public.Hostname())
	origins := []string{public.Scheme + "://" + public.Host}
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

// Drain waits for "API key made" notices accepted a moment ago to go out.
func (k *APIKeys) Drain() { k.Method.Wait() }

// APIKeysFromEnv is the API key module, or nil when API_KEYS=false. Keys are made by a signed-in
// person, so it needs sign-in to be on.
//
//	API_KEYS              true or false (default true)
//	API_KEY_PREFIX        what every key starts with (default roux_); API_KEY_HEADER (default X-API-Key)
//	API_KEY_MAX_LIFETIME  the longest a key may last, such as 2160h (default 365 days)
func APIKeysFromEnv(email *EmailLink) (*APIKeys, error) {
	if email == nil {
		return nil, nil
	}
	on, err := boolean("API_KEYS", true)
	if err != nil {
		return nil, err
	}
	if !on {
		slog.Info("API keys are off (API_KEYS=false)")
		return nil, nil
	}
	cfg := apikey.Config{Prefix: os.Getenv("API_KEY_PREFIX"), Header: os.Getenv("API_KEY_HEADER"), Notify: email.Method.APIKeyMade}
	longest, err := duration("API_KEY_MAX_LIFETIME")
	if err != nil {
		return nil, err
	}
	cfg.MaxLifetime = longest
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
		slog.Info("bearer tokens are off: API callers cannot present a JWT from your authorization server; to turn them on set JWT_ISSUER to its issuer and JWT_AUDIENCES to the audiences a token must name")
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
		slog.Info("sign-in with Google, GitHub or another OpenID Connect provider is off: list the providers in a JSON file and set OIDC_PROVIDERS_FILE to its path (deploy/oidc-providers.dev.json is an example)")
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
		role = list("INVITABLE_ROLES", "USER")[0]
	}
	m, err := oidc.New(oidc.Config{
		Providers:  providers,
		PublicURL:  publicURL(),
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

func (*Users) mountsFirst() {
	// Only a marker: the other modules read the organization and the theme this module sets.
}
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
	if u.email == nil {
		return errors.New("the users module needs email sign-in: pass UsersFromEnv the module EmailLinkFromEnv made")
	}
	invitable, err := authz.NewInvitable(list("INVITABLE_ROLES", "USER"))
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

// Start makes the first owner, when there is none. With no one active who can manage the team
// and no OWNER_EMAIL, it refuses: nobody could ever sign in to change that.
func (u *Users) Start(ctx context.Context, k *Kit) error {
	owner, name := os.Getenv("OWNER_EMAIL"), os.Getenv("OWNER_NAME")
	switch {
	case owner != "" && name == "", owner == "" && name != "":
		return errors.New("OWNER_EMAIL and OWNER_NAME go together: set both, or neither")
	case owner == "":
		err := authz.EnsureAdmin(ctx, k.Pool)
		if errors.Is(err, authz.ErrLastAdmin) {
			return errors.New("nobody can sign in to manage this app: set OWNER_EMAIL and OWNER_NAME to make " +
				"the first owner (make dev sets yours)")
		}
		return err
	default:
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

// publicURL is where browsers reach the app (PUBLIC_URL), http://localhost:8080 in development.
func publicURL() string { return Getenv("PUBLIC_URL", "http://localhost:8080") }
