package passkey

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/authn"
)

// Config configures passkeys.
type Config struct {
	// RPID is the relying party id: the host of the app ("app.example.com"; "localhost"
	// for local development, where browsers allow WebAuthn over plain http). Required.
	// Use one per app host, never a registrable domain other apps share: every app's
	// passkeys would show in every other app's picker.
	RPID string
	// RPName is what the browser calls the app when it asks to create a passkey
	// (default "App").
	RPName string
	// AllowedOrigins are the origins WebAuthn responses may come from, as the browser
	// reports them: a scheme (http or https), a host and an optional port, no path and
	// no trailing slash. Default "https://<RPID>".
	AllowedOrigins []string
	// CeremonyTTL is how long a sign-in or registration may take (default 5 minutes).
	CeremonyTTL time.Duration
	// NameFor names an identity in the browser's picker: usually an email address.
	// sessionCredentialID is the credential this session signed in with. Default: the
	// identity's id.
	NameFor func(ctx context.Context, db authn.DBTX, identityID, sessionCredentialID uuid.UUID) (string, error)
	// Notify tells the owner a passkey was added (see emaillink.Method.PasskeyAdded). A
	// failure is logged and never fails the registration. Optional.
	Notify func(ctx context.Context, identityID uuid.UUID, label string) error
	// Clock is the time source; default time.Now.
	Clock func() time.Time
}

// validate fills the defaults and checks the rest, naming the setting in each error so a
// bad value stops startup with something to fix.
func (c Config) validate() (Config, error) {
	var errs []error
	switch id := c.RPID; {
	case strings.TrimSpace(id) == "":
		errs = append(errs, errors.New("RPID is required: the host of your app, such as app.example.com (localhost for development)"))
	case strings.ContainsAny(id, ":/ \t?#@"):
		errs = append(errs, fmt.Errorf("RPID %q must be a bare host: no scheme, port or path", id))
	}
	if c.RPName == "" {
		c.RPName = "App"
	}
	if len(c.AllowedOrigins) == 0 && c.RPID != "" {
		c.AllowedOrigins = []string{"https://" + c.RPID}
	}
	for i, o := range c.AllowedOrigins {
		if err := checkOrigin(o); err != nil {
			errs = append(errs, fmt.Errorf("AllowedOrigins[%d] %q %w", i, o, err))
		}
	}
	if c.CeremonyTTL == 0 {
		c.CeremonyTTL = 5 * time.Minute
	}
	if c.Clock == nil {
		c.Clock = time.Now
	}
	if c.NameFor == nil {
		c.NameFor = func(_ context.Context, _ authn.DBTX, identityID, _ uuid.UUID) (string, error) {
			return identityID.String(), nil
		}
	}
	if len(errs) > 0 {
		return c, fmt.Errorf("passkey: %w", errors.Join(errs...))
	}
	return c, nil
}

// checkOrigin accepts exactly scheme://host[:port].
func checkOrigin(o string) error {
	u, err := url.Parse(o)
	if err != nil || u.Host == "" {
		return errors.New("must be an origin: a scheme, a host and an optional port, such as https://app.example.com")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("must use the http or https scheme")
	}
	if u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || strings.HasSuffix(o, "/") {
		return errors.New("must have no path, query, fragment or trailing slash: just scheme://host[:port]")
	}
	return nil
}
