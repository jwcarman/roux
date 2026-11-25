package emaillink

import (
	"cmp"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	defaultCodeLength      = 6
	minCodeLength          = 6
	defaultCodeMaxAttempts = 5
	defaultTokenTTL        = 5 * time.Minute
	defaultResendInterval  = time.Minute
	minCodeSecretLength    = 32
)

// Config configures email-link sign-in. Zero values take who's defaults.
type Config struct {
	// LinkBaseURL is the page of the app that receives sign-in links; the link
	// is this URL followed by "#token=" and the token. Required.
	LinkBaseURL string
	// CodeSecret keys the HMAC of typed codes: at least 32 random characters,
	// the same on every instance, never stored in the database. Required.
	// (Generate one with `openssl rand -base64 32`.)
	CodeSecret string
	// CodeLength is the typed code's length (default 6, at least 6).
	CodeLength int
	// CodeMaxAttempts is how many wrong codes an address allows before its code
	// is burnt (default 5).
	CodeMaxAttempts int
	// AddressConfirmationURL is the page that receives the link in an "add or change your
	// address" email (default LinkBaseURL); the token follows as "#confirm-address=".
	AddressConfirmationURL string
	// TokenTTL is how long a link and code stay valid (default 5 minutes).
	TokenTTL time.Duration
	// ResendInterval is the least time between two emails to one address
	// (default 60 seconds); it must not exceed TokenTTL.
	ResendInterval time.Duration

	// AppName is what the email calls the app (default "App").
	AppName string
	// BrandColor is the email's accent colour, "#rrggbb" (default blue).
	BrandColor string
	// Sender delivers the emails. Required.
	Sender Sender
	// Clock is the time source; default time.Now.
	Clock func() time.Time
}

// withDefaults fills the zero values and validates, naming the fix in each error
// so a bad setting stops startup with something actionable.
func (c Config) withDefaults() (Config, error) {
	c.CodeLength = cmp.Or(c.CodeLength, defaultCodeLength)
	c.CodeMaxAttempts = cmp.Or(c.CodeMaxAttempts, defaultCodeMaxAttempts)
	c.TokenTTL = cmp.Or(c.TokenTTL, defaultTokenTTL)
	c.ResendInterval = cmp.Or(c.ResendInterval, defaultResendInterval)
	c.AppName = cmp.Or(c.AppName, "App")
	c.BrandColor = cmp.Or(c.BrandColor, "#3b82f6")
	if c.Clock == nil {
		c.Clock = time.Now
	}
	if c.AddressConfirmationURL == "" {
		c.AddressConfirmationURL = c.LinkBaseURL
	} else if strings.ContainsAny(c.AddressConfirmationURL, "#?") {
		return c, fmt.Errorf("emaillink: AddressConfirmationURL %q must have no query or fragment: the token is added as a fragment", c.AddressConfirmationURL)
	}
	if errs := c.problems(); len(errs) > 0 {
		return c, fmt.Errorf("emaillink: %w", errors.Join(errs...))
	}
	return c, nil
}

// problems is every setting that cannot work, each naming its fix.
func (c Config) problems() []error {
	var errs []error
	if strings.TrimSpace(c.LinkBaseURL) == "" {
		errs = append(errs, errors.New("LinkBaseURL is required: the page of your app that receives sign-in links"))
	} else if strings.ContainsAny(c.LinkBaseURL, "#?") {
		errs = append(errs, fmt.Errorf("LinkBaseURL %q must have no query or fragment: the token is added as a fragment", c.LinkBaseURL))
	}
	if c.CodeLength < minCodeLength {
		errs = append(errs, fmt.Errorf("CodeLength must be at least %d", minCodeLength))
	}
	if c.CodeMaxAttempts < 1 {
		errs = append(errs, errors.New("CodeMaxAttempts must be at least 1"))
	}
	switch s := c.CodeSecret; {
	case strings.TrimSpace(s) == "":
		errs = append(errs, errors.New("CodeSecret is required: at least 32 random characters (openssl rand -base64 32)"))
	case strings.HasPrefix(s, "${") && strings.HasSuffix(s, "}"):
		errs = append(errs, fmt.Errorf("CodeSecret is the unresolved placeholder %s: set the variable it names", s))
	case len(s) < minCodeSecretLength:
		errs = append(errs, fmt.Errorf("CodeSecret must be at least %d characters", minCodeSecretLength))
	}
	if c.ResendInterval > c.TokenTTL {
		errs = append(errs, fmt.Errorf("ResendInterval (%s) must not be longer than TokenTTL (%s)", c.ResendInterval, c.TokenTTL))
	}
	if c.Sender == nil {
		errs = append(errs, errors.New("Sender is required: there must be a way to deliver the emails"))
	}
	return errs
}

// String hides the secret, so a logged Config cannot leak it.
func (c Config) String() string {
	return fmt.Sprintf("emaillink.Config{LinkBaseURL: %q, CodeLength: %d, CodeMaxAttempts: %d, TokenTTL: %s, ResendInterval: %s, CodeSecret: ****}",
		c.LinkBaseURL, c.CodeLength, c.CodeMaxAttempts, c.TokenTTL, c.ResendInterval)
}
