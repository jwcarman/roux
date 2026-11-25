package organization_test

import (
	"strings"
	"testing"
	"time"

	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/organization"
)

func zone(t *testing.T, name string) *time.Location {
	t.Helper()
	l, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestTodayIsTheOrganizationsNotTheServers(t *testing.T) {
	ny := zone(t, "America/New_York")
	// 03:30 UTC on the 25th is 22:30 on the 24th in New York.
	c := organization.NewContext(time.Date(2026, 11, 25, 3, 30, 0, 0, time.UTC), ny, "en-US")
	if c.Today != "2026-11-24" || c.TimeZone != "America/New_York" || c.Locale != "en-US" {
		t.Fatalf("%+v", c)
	}
	if want := time.Date(2026, 11, 25, 5, 0, 0, 0, time.UTC); !c.TodayEndsAt.Equal(want) {
		t.Fatalf("today ends at %s, want %s (New York's next midnight)", c.TodayEndsAt, want)
	}
	if c.Currency != nil || c.FractionDigits != nil {
		t.Fatalf("no currency is null, not empty: %+v", c)
	}

	// The same instant is a different day in Tokyo.
	if got := organization.NewContext(time.Date(2026, 11, 25, 3, 30, 0, 0, time.UTC), zone(t, "Asia/Tokyo"), "ja-JP").Today; got != "2026-11-25" {
		t.Fatalf("Tokyo's today = %s", got)
	}
}

func TestADayThatIsNot24HoursEndsWhenItReallyEnds(t *testing.T) {
	ny := zone(t, "America/New_York")
	// Clocks go forward on 2026-03-08: that day is 23 hours long.
	spring := organization.NewContext(time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC), ny, "en-US")
	if want := time.Date(2026, 3, 9, 4, 0, 0, 0, time.UTC); spring.Today != "2026-03-08" || !spring.TodayEndsAt.Equal(want) {
		t.Fatalf("spring forward: %+v (want end %s)", spring, want)
	}
	// Clocks go back on 2026-11-01: 25 hours.
	fall := organization.NewContext(time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), ny, "en-US")
	if want := time.Date(2026, 11, 2, 5, 0, 0, 0, time.UTC); fall.Today != "2026-11-01" || !fall.TodayEndsAt.Equal(want) {
		t.Fatalf("fall back: %+v (want end %s)", fall, want)
	}
}

func TestACurrencyIsToldWithItsDigits(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC) }
	cal, err := organization.NewCalendar("Asia/Tokyo", "ja-JP", now)
	if err != nil {
		t.Fatal(err)
	}
	yen := cal.WithCurrency("JPY")
	c := yen.Context()
	if c.Currency == nil || *c.Currency != "JPY" || c.FractionDigits == nil || *c.FractionDigits != 0 || yen.Currency() != "JPY" {
		t.Fatalf("%+v", c)
	}
	if cal.Context().Currency != nil || cal.Currency() != "" {
		t.Fatal("WithCurrency must not change the calendar it was called on")
	}
}

func TestTheWeekStartsWhereTheLocaleStartsIt(t *testing.T) {
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	for locale, want := range map[string]time.Weekday{
		"en-US": time.Sunday, "en": time.Sunday, "en-GB": time.Monday, "de-DE": time.Monday,
		"fr": time.Monday, "ar-EG": time.Saturday, "ja-JP": time.Sunday, "dv-MV": time.Friday,
	} {
		if got := organization.NewContext(now, time.UTC, locale).WeekStart; got != want {
			t.Errorf("%s: the week starts on %s, want %s", locale, got, want)
		}
	}
}

func TestAnOrganizationChoosesItsOwnWeekStart(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC) }
	cal, err := organization.NewCalendar("Europe/Berlin", "de-DE", now)
	if err != nil {
		t.Fatal(err)
	}
	if got := cal.WithWeekStart(time.Sunday).Context().WeekStart; got != time.Sunday {
		t.Fatalf("chosen: %s", got)
	}
	if got := cal.Context().WeekStart; got != time.Monday {
		t.Fatalf("WithWeekStart must not change the calendar it was called on: %s", got)
	}
}

func TestCalendarChecksItsSettings(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC) }
	if cal, err := organization.NewCalendar("America/New_York", "en-US", now); err != nil || cal.Context().Today != "2026-11-24" {
		t.Fatalf("good settings: %v", err)
	}
	for _, c := range []struct{ zone, locale, want string }{
		{"", "en-US", "time zone is required"},
		{"Local", "en-US", "time zone is required"},
		{"Mars/Olympus_Mons", "en-US", "not an IANA zone"},
		{"UTC", "en_us", "BCP 47"},
		{"UTC", "EN-us", "written canonically"},
		{"UTC", "", "BCP 47"},
		{"UTC", "not a tag", "BCP 47"},
	} {
		if _, err := organization.NewCalendar(c.zone, c.locale, now); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("NewCalendar(%q, %q) = %v, want containing %q", c.zone, c.locale, err, c.want)
		}
	}
}

func TestOrganizationEndpoint(t *testing.T) {
	env := authntest.New(t, "organization")
	cal, err := organization.NewCalendar("America/New_York", "en-US", env.Clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	organization.Register(env.Mux, env.Host, cal.Context)
	env.Serve()

	if r := env.Browser().Get("/api/roux/organization"); r.StatusCode != 401 {
		t.Fatalf("anonymous: %d", r.StatusCode)
	}
	r := env.SignedIn(env.Identity()).Get("/api/roux/organization")
	want := `{"timeZone":"America/New_York","locale":"en-US","today":"2026-11-24","todayEndsAt":"2026-11-25T05:00:00Z","currency":null,"fractionDigits":null,"weekStart":0}`
	if r.StatusCode != 200 || strings.TrimSpace(string(r.Body)) != want {
		t.Fatalf("%d %s\nwant %s", r.StatusCode, r.Body, want)
	}
}
