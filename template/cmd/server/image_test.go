package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// from is a stage's base image: FROM image [AS name].
var from = regexp.MustCompile(`(?m)^FROM\s+(\S+)`)

// The image builds from releases, not from whatever "latest" is today, and the server runs as
// nobody on a base with no shell.
func TestTheImageIsBuiltFromReleasesAndRunsAsNobody(t *testing.T) {
	raw, err := os.ReadFile("../../Dockerfile")
	if err != nil {
		t.Fatal(err)
	}
	stages := from.FindAllStringSubmatch(string(raw), -1)
	if len(stages) < 2 {
		t.Fatalf("read %d stages: the Dockerfile is not where the test looks", len(stages))
	}
	for _, s := range stages[:len(stages)-1] {
		if !release.MatchString(s[1]) {
			t.Errorf("build stage %s is not pinned to a release", s[1])
		}
	}
	if final := stages[len(stages)-1][1]; !strings.HasPrefix(final, "gcr.io/distroless/static") || !strings.HasSuffix(final, ":nonroot") {
		t.Errorf("the server runs on %s: want distroless static, as nonroot", final)
	}
}
