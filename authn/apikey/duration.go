package apikey

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

var isoDuration = regexp.MustCompile(`(?i)^P(?:(\d{1,6})D)?(?:T(?:(\d{1,6})H)?(?:(\d{1,7})M)?(?:(\d{1,9})S)?)?$`)

// parseDuration reads an ISO-8601 duration of days, hours, minutes and seconds ("P90D", "PT1H",
// "P1DT2H30M"), as Java's Duration.parse does. Years, months and weeks are not a fixed length, so
// they are refused; so is anything negative.
func parseDuration(s string) (time.Duration, error) {
	m := isoDuration.FindStringSubmatch(s)
	if m == nil || s == "P" || s[len(s)-1] == 'T' || s[len(s)-1] == 't' {
		return 0, fmt.Errorf("%q is not an ISO-8601 duration of days, hours, minutes and seconds, such as P90D or PT1H", s)
	}
	unit := [...]time.Duration{24 * time.Hour, time.Hour, time.Minute, time.Second}
	var d time.Duration
	for i, u := range unit {
		if m[i+1] == "" {
			continue
		}
		n, _ := strconv.Atoi(m[i+1])
		d += time.Duration(n) * u
	}
	return d, nil
}
