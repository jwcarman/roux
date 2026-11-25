package app

import (
	"runtime/debug"
	"testing"
)

func TestRouxVersionIsTheOneTheBinaryWasBuiltWith(t *testing.T) {
	dep := func(path, version string, replace *debug.Module) *debug.Module {
		return &debug.Module{Path: path, Version: version, Replace: replace}
	}
	for _, c := range []struct {
		name string
		info *debug.BuildInfo
		ok   bool
		want string
	}{
		{"a release", &debug.BuildInfo{Main: debug.Module{Path: "team-planner"},
			Deps: []*debug.Module{dep("github.com/jackc/pgx/v5", "v5.7.0", nil), dep(rouxModule, "v0.4.0", nil)}}, true, "v0.4.0"},
		{"a checkout", &debug.BuildInfo{Main: debug.Module{Path: "roux-app"},
			Deps: []*debug.Module{dep(rouxModule, "v0.0.0", &debug.Module{Path: "../"})}}, true, "local (../)"},
		{"roux itself", &debug.BuildInfo{Main: debug.Module{Path: rouxModule, Version: "(devel)"}}, true, "(devel)"},
		{"without roux", &debug.BuildInfo{Main: debug.Module{Path: "other"}}, true, "unknown"},
		{"without build info", nil, false, "unknown"},
	} {
		if got := rouxVersion(c.info, c.ok); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}
