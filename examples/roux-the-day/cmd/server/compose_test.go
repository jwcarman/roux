package main

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

// release is a tag naming one release, with an optional variant: 17.6-alpine, v1.34.0; not
// "17" or "latest", which move. (Postgres numbers its releases major.minor.)
var release = regexp.MustCompile(`:v?\d+\.\d+(\.\d+)?(-[a-z0-9]+)?$`)

// compose is what the test reads of compose.yaml: each service's image and published ports, in
// any of compose's spellings ("5432", "127.0.0.1:5432:5432", 5432, or the long form).
type compose struct {
	Services map[string]struct {
		Image string `yaml:"image"`
		Ports []any  `yaml:"ports"`
	} `yaml:"services"`
}

// The development services stay on this machine, and each runs a release, not whatever
// "latest" is today: their passwords are app/app and admin/admin.
func TestTheDevelopmentServicesAreLocalAndPinned(t *testing.T) {
	raw, err := os.ReadFile("../../compose.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var c compose
	if err := yaml.Unmarshal(raw, &c); err != nil {
		t.Fatal(err)
	}
	if len(c.Services) == 0 {
		t.Fatal("no services: the compose file is not where the test looks")
	}
	for name, s := range c.Services {
		if !release.MatchString(s.Image) {
			t.Errorf("%s: image %q is not pinned to a release", name, s.Image)
		}
		for _, p := range s.Ports {
			if !onThisMachine(p) {
				t.Errorf("%s: port %v is published on every interface: write it \"127.0.0.1:host:container\"", name, p)
			}
		}
	}
}

// onThisMachine is whether a published port binds the loopback address only.
func onThisMachine(port any) bool {
	switch p := port.(type) {
	case string:
		return strings.HasPrefix(p, "127.0.0.1:")
	case map[string]any:
		return p["host_ip"] == "127.0.0.1"
	default: // a bare number publishes on every interface
		return false
	}
}

func TestAPortOffThisMachineIsCaughtHoweverItIsWritten(t *testing.T) {
	for _, p := range []any{"5432", "5432:5432", "0.0.0.0:5432:5432", 5432, map[string]any{"target": 5432, "published": 5432}} {
		if onThisMachine(p) {
			t.Errorf("%v counted as on this machine", p)
		}
	}
	for _, p := range []any{"127.0.0.1:5432:5432", map[string]any{"target": 5432, "host_ip": "127.0.0.1"}} {
		if !onThisMachine(p) {
			t.Errorf("%v counted as off this machine", p)
		}
	}
}
