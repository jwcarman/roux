// Package organization is what the browser is told about the organization the app
// serves: its time zone, its locale, what today is there and when it ends. A
// business date must never depend on where the server runs, so "today" is always
// read in the organization's zone. It travels in the page (#app-context, see
// kit/spa) and at GET /api/organization, where the browser asks when its today ends.
package organization

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/text/language"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
)

// Path is where the context is served.
const Path = "/api/organization"

// Context is the organization as the browser sees it: roux's JSON, nulls included.
type Context struct {
	TimeZone       string    `json:"timeZone"`       // IANA zone
	Locale         string    `json:"locale"`         // BCP 47 tag
	Today          string    `json:"today"`          // the organization's date, yyyy-mm-dd
	TodayEndsAt    time.Time `json:"todayEndsAt"`    // when the browser should ask for the new day
	Currency       *string   `json:"currency"`       // ISO 4217, or null
	FractionDigits *int      `json:"fractionDigits"` // the currency's digits, or null
}

// NewContext computes today and its end from one reading of now, so a midnight
// between two readings cannot pair a day with the next day's end. Today ends at
// the organization's next midnight, so a 23- or 25-hour day is right.
func NewContext(now time.Time, zone *time.Location, locale string) Context {
	local := now.In(zone)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, zone)
	return Context{
		TimeZone:    zone.String(),
		Locale:      locale,
		Today:       today.Format(time.DateOnly),
		TodayEndsAt: today.AddDate(0, 0, 1).UTC(),
	}
}

// Calendar is the organization's zone and locale over a clock.
type Calendar struct {
	zone   *time.Location
	locale string
	clock  func() time.Time
}

// NewCalendar checks the settings (they fail startup, not a request): the zone must
// be a real IANA zone, and the locale a BCP 47 tag written canonically ("en-US", not
// "en_us"), so what the browser formats with is what was meant.
func NewCalendar(zone, locale string, clock func() time.Time) (*Calendar, error) {
	var errs []error
	loc := time.UTC
	if strings.TrimSpace(zone) == "" || zone == "Local" {
		errs = append(errs, errors.New("the time zone is required: an IANA zone such as America/New_York"))
	} else if l, err := time.LoadLocation(zone); err != nil {
		errs = append(errs, fmt.Errorf("the time zone %q is not an IANA zone", zone))
	} else {
		loc = l
	}
	if tag, err := language.Parse(locale); err != nil || tag.String() != locale {
		errs = append(errs, fmt.Errorf("the locale %q must be a BCP 47 tag written canonically, such as en-US", locale))
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("organization: %w", errors.Join(errs...))
	}
	if clock == nil {
		clock = time.Now
	}
	return &Calendar{zone: loc, locale: locale, clock: clock}, nil
}

// Context is the organization as of now.
func (c *Calendar) Context() Context { return NewContext(c.clock(), c.zone, c.locale) }

// Register serves the context at GET /api/organization, for anyone signed in.
func Register(mux *api.Mux, host *authn.Host, source func() Context) {
	mux.Handle("GET "+Path, host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, http.StatusOK, source())
	}))
}
