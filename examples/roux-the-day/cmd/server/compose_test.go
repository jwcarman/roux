package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

var (
	portLine  = regexp.MustCompile(`^\s*-\s*"([^"]+)"`)
	imageLine = regexp.MustCompile(`^\s*image:\s*(\S+)`)
	pinnedTag = regexp.MustCompile(`:v?\d+(\.\d+)*(-[a-z0-9]+)?$`)
)

// The development services stay on this machine, and each runs a release, not whatever
// "latest" is today: their passwords are app/app and admin/admin.
func TestTheDevelopmentServicesAreLocalAndPinned(t *testing.T) {
	compose, err := os.ReadFile("../../compose.yaml")
	if err != nil {
		t.Fatal(err)
	}
	ports, images := 0, 0
	for line := range strings.Lines(string(compose)) {
		if m := portLine.FindStringSubmatch(line); m != nil && strings.Contains(m[1], ":") {
			ports++
			if !strings.HasPrefix(m[1], "127.0.0.1:") {
				t.Errorf("port %q is published on every interface: write it 127.0.0.1:%s", m[1], m[1])
			}
		}
		if m := imageLine.FindStringSubmatch(line); m != nil {
			images++
			if !pinnedTag.MatchString(m[1]) {
				t.Errorf("image %s is not pinned to a release", m[1])
			}
		}
	}
	if ports == 0 || images == 0 {
		t.Fatalf("read %d ports and %d images: the compose file is not where the test looks", ports, images)
	}
}
