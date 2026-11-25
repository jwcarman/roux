package app_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgtest"
)

const secret = "0123456789abcdef0123456789abcdef"

// emailLink is the email module with sign-in on.
func emailLink(t *testing.T) *app.EmailLink {
	t.Helper()
	t.Setenv("CODE_SECRET", secret)
	e, err := app.EmailLinkFromEnv("Acme")
	if err != nil || e == nil {
		t.Fatalf("%v %v", e, err)
	}
	return e
}

// wantError fails unless err is set and mentions every one of words.
func wantError(t *testing.T, err error, words ...string) {
	t.Helper()
	if err == nil {
		t.Fatalf("want an error mentioning %q, got none", words)
	}
	for _, w := range words {
		if !strings.Contains(err.Error(), w) {
			t.Fatalf("%q does not mention %q", err, w)
		}
	}
}

func TestGetenvFallsBackWhenUnsetOrEmpty(t *testing.T) {
	t.Setenv("ROUX_TEST_VALUE", "")
	if got := app.Getenv("ROUX_TEST_VALUE", "fallback"); got != "fallback" {
		t.Fatalf("empty: %q", got)
	}
	t.Setenv("ROUX_TEST_VALUE", "set")
	if got := app.Getenv("ROUX_TEST_VALUE", "fallback"); got != "set" {
		t.Fatalf("set: %q", got)
	}
}

func TestSecureCookiesFollowPublicURLUnlessSaid(t *testing.T) {
	for _, c := range []struct {
		secure, url string
		want        bool
	}{
		{"", "https://app.example.com", true},
		{"", "HTTPS://app.example.com", true},
		{"", "http://localhost:8080", false},
		{"", "", false},
		{"true", "http://localhost:8080", true},
		{"false", "https://app.example.com", false},
	} {
		t.Setenv("COOKIE_SECURE", c.secure)
		t.Setenv("PUBLIC_URL", c.url)
		if got, err := app.SecureCookies(); err != nil || got != c.want {
			t.Errorf("COOKIE_SECURE=%q PUBLIC_URL=%q: %v %v, want %v", c.secure, c.url, got, err, c.want)
		}
	}
	t.Setenv("COOKIE_SECURE", "yes")
	_, err := app.SecureCookies()
	wantError(t, err, "COOKIE_SECURE", `"yes"`)
}

func TestEmailLinkIsOffWithoutACodeSecret(t *testing.T) {
	t.Setenv("CODE_SECRET", "")
	if e, err := app.EmailLinkFromEnv("Acme"); e != nil || err != nil {
		t.Fatalf("%v %v", e, err)
	}
}

func TestEmailLinkIsAModuleOfItsOwn(t *testing.T) {
	t.Setenv("EMAIL_RESEND_INTERVAL", "1s")
	t.Setenv("EMAIL_TOKEN_TTL", "10m")
	e := emailLink(t)
	if e.Name() != "email-link" || len(e.Migrations()) != 1 || e.SignIn() == nil {
		t.Fatalf("%s %d %v", e.Name(), len(e.Migrations()), e.SignIn())
	}
}

func TestEmailLinkRefusesWhatItCannotUse(t *testing.T) {
	t.Setenv("CODE_SECRET", secret)
	t.Setenv("EMAIL_RESEND_INTERVAL", "soon")
	_, err := app.EmailLinkFromEnv("Acme")
	wantError(t, err, "EMAIL_RESEND_INTERVAL")

	t.Setenv("EMAIL_RESEND_INTERVAL", "")
	t.Setenv("EMAIL_TOKEN_TTL", "a while")
	_, err = app.EmailLinkFromEnv("Acme")
	wantError(t, err, "EMAIL_TOKEN_TTL")

	t.Setenv("EMAIL_TOKEN_TTL", "")
	t.Setenv("CODE_SECRET", "short")
	_, err = app.EmailLinkFromEnv("Acme")
	wantError(t, err, "CodeSecret")
}

func TestPasskeysAreOffWithoutARelyingParty(t *testing.T) {
	t.Setenv("PASSKEY_RP_ID", "")
	if p, err := app.PasskeysFromEnv("Acme", nil); p != nil || err != nil {
		t.Fatalf("%v %v", p, err)
	}
}

func TestPasskeysNeedEmailSignIn(t *testing.T) {
	t.Setenv("PASSKEY_RP_ID", "localhost")
	_, err := app.PasskeysFromEnv("Acme", nil)
	wantError(t, err, "CODE_SECRET")
}

func TestPasskeysTakeTheirOrigins(t *testing.T) {
	e := emailLink(t)
	t.Setenv("PASSKEY_RP_ID", "localhost")
	t.Setenv("PASSKEY_ORIGINS", "http://localhost:8080, http://localhost:5173")
	p, err := app.PasskeysFromEnv("Acme", e)
	if err != nil || p == nil {
		t.Fatalf("%v %v", p, err)
	}
	if p.Name() != "passkeys" || len(p.Migrations()) != 1 || p.SignIn() == nil {
		t.Fatalf("%s %d %v", p.Name(), len(p.Migrations()), p.SignIn())
	}
	p.Drain() // nothing in flight: returns at once

	t.Setenv("PASSKEY_ORIGINS", "not an origin")
	_, err = app.PasskeysFromEnv("Acme", e)
	wantError(t, err, "not an origin")
}

func TestAPIKeysNeedSignInAndCanBeTurnedOff(t *testing.T) {
	if k, err := app.APIKeysFromEnv(nil); k != nil || err != nil {
		t.Fatalf("without sign-in: %v %v", k, err)
	}
	e := emailLink(t)
	t.Setenv("API_KEYS", "off")
	if k, err := app.APIKeysFromEnv(e); k != nil || err != nil {
		t.Fatalf("off: %v %v", k, err)
	}
}

func TestAPIKeysAreOnByDefault(t *testing.T) {
	e := emailLink(t)
	t.Setenv("API_KEY_MAX_LIFETIME", "2160h")
	k, err := app.APIKeysFromEnv(e)
	if err != nil || k == nil {
		t.Fatalf("%v %v", k, err)
	}
	if k.Name() != "api-keys" || len(k.Migrations()) != 1 || k.SignIn() == nil {
		t.Fatalf("%s %d %v", k.Name(), len(k.Migrations()), k.SignIn())
	}
}

func TestAPIKeysRefuseWhatTheyCannotUse(t *testing.T) {
	e := emailLink(t)
	t.Setenv("API_KEY_MAX_LIFETIME", "forever")
	_, err := app.APIKeysFromEnv(e)
	wantError(t, err, "API_KEY_MAX_LIFETIME")

	t.Setenv("API_KEY_MAX_LIFETIME", "")
	t.Setenv("API_KEY_PREFIX", "not a prefix!")
	_, err = app.APIKeysFromEnv(e)
	wantError(t, err, "Prefix")
}

func TestBearerTokensAreOffWithoutAnIssuer(t *testing.T) {
	t.Setenv("JWT_ISSUER", "")
	if j, err := app.JWTFromEnv(nil); j != nil || err != nil {
		t.Fatalf("%v %v", j, err)
	}
}

func TestBearerTokensNeedSignInAndAnAudience(t *testing.T) {
	t.Setenv("JWT_ISSUER", "https://issuer.example.com")
	_, err := app.JWTFromEnv(nil)
	wantError(t, err, "CODE_SECRET")

	e := emailLink(t)
	t.Setenv("JWT_AUDIENCES", "")
	_, err = app.JWTFromEnv(e)
	wantError(t, err, "Audiences")
}

func TestBearerTokens(t *testing.T) {
	e := emailLink(t)
	t.Setenv("JWT_ISSUER", "https://issuer.example.com")
	t.Setenv("JWT_AUDIENCES", "orders, billing")
	j, err := app.JWTFromEnv(e)
	if err != nil || j == nil {
		t.Fatalf("%v %v", j, err)
	}
	if j.Name() != "jwt" || len(j.Migrations()) != 1 || j.SignIn() == nil {
		t.Fatalf("%s %d %v", j.Name(), len(j.Migrations()), j.SignIn())
	}
}

// providers writes a provider file and points OIDC_PROVIDERS_FILE at it.
func providers(t *testing.T, content string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "providers.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OIDC_PROVIDERS_FILE", path)
}

const keycloak = `[{"kind": "oidc", "id": "keycloak", "name": "Keycloak", "issuer": "http://localhost:8180/realms/acme",
  "clientId": "acme", "clientSecret": "s3cret", "signUp": {"open": true}}]`

func TestProviderSignInIsOffWithoutAProviderFile(t *testing.T) {
	t.Setenv("OIDC_PROVIDERS_FILE", "")
	if o, err := app.OIDCFromEnv(nil, nil); o != nil || err != nil {
		t.Fatalf("%v %v", o, err)
	}
}

func TestProviderSignInNeedsEmailAndUsers(t *testing.T) {
	providers(t, keycloak)
	e := emailLink(t)
	for _, c := range []struct {
		email *app.EmailLink
		users *app.Users
	}{{nil, app.UsersFromEnv(e)}, {e, nil}} {
		_, err := app.OIDCFromEnv(c.email, c.users)
		wantError(t, err, "CODE_SECRET")
	}
}

func TestProviderSignIn(t *testing.T) {
	providers(t, keycloak)
	e := emailLink(t)
	t.Setenv("INVITABLE_ROLES", "MEMBER, LEAD")
	o, err := app.OIDCFromEnv(e, app.UsersFromEnv(e))
	if err != nil || o == nil {
		t.Fatalf("%v %v", o, err)
	}
	if o.Name() != "oidc" || len(o.Migrations()) != 1 || o.SignIn() == nil {
		t.Fatalf("%s %d %v", o.Name(), len(o.Migrations()), o.SignIn())
	}
}

func TestProviderSignInRefusesWhatItCannotUse(t *testing.T) {
	e := emailLink(t)
	t.Setenv("OIDC_PROVIDERS_FILE", filepath.Join(t.TempDir(), "missing.json"))
	_, err := app.OIDCFromEnv(e, app.UsersFromEnv(e))
	wantError(t, err, "missing.json")

	providers(t, keycloak)
	t.Setenv("PUBLIC_URL", "not a url")
	_, err = app.OIDCFromEnv(e, app.UsersFromEnv(e))
	wantError(t, err, "PublicURL")
}

// assembled runs the users module, with email sign-in, against a database of its own.
func assembled(t *testing.T, schema string) (*app.Kit, error) {
	t.Helper()
	e := emailLink(t)
	k := kit()
	k.Pool = pgtest.Pool(t, schema)
	return k, app.Assemble(context.Background(), k, e, app.UsersFromEnv(e))
}

func TestTheUsersModuleSetsUpTheOrganizationAndTheFirstOwner(t *testing.T) {
	t.Setenv("ORG_TIME_ZONE", "America/New_York")
	t.Setenv("ORG_LOCALE", "en-GB")
	t.Setenv("ORG_CURRENCY", "EUR")
	t.Setenv("OWNER_EMAIL", "owner@example.test")
	t.Setenv("OWNER_NAME", "Olive Owner")
	k, err := assembled(t, "app_users_module")
	if err != nil {
		t.Fatal(err)
	}
	org := k.Organization()
	if org.TimeZone != "America/New_York" || org.Locale != "en-GB" || org.Currency == nil || *org.Currency != "EUR" {
		t.Fatalf("%+v", org)
	}
	var owners int
	if err := k.Pool.QueryRow(context.Background(),
		`select count(*) from roux_user where display_name = 'Olive Owner'`).Scan(&owners); err != nil || owners != 1 {
		t.Fatalf("owners %d %v", owners, err)
	}
}

func TestTheUsersModuleRefusesWhatItCannotUse(t *testing.T) {
	for _, c := range []struct{ name, key, value, words string }{
		{"app_users_blank_role", "INVITABLE_ROLES", " , ", "blank"},
		// trimmed, so a space does not slip OWNER past the check
		{"app_users_owner_role", "INVITABLE_ROLES", "MEMBER, OWNER", "OWNER"},
		{"app_users_bad_zone", "ORG_TIME_ZONE", "Mars/Olympus", "Mars/Olympus"},
		{"app_users_bad_currency", "ORG_CURRENCY", "XYZ", "ORG_CURRENCY"},
		{"app_users_lone_owner", "OWNER_EMAIL", "owner@example.test", "OWNER_NAME"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv(c.key, c.value)
			_, err := assembled(t, c.name)
			wantError(t, err, c.words)
		})
	}
}
