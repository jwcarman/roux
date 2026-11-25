//go:build embedweb

package web_test

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/jwcarman/roux/spa"
	web "roux-the-day/frontend"
)

// The front end that was built and embedded must satisfy what the server needs of it. This
// runs only for a build with the embedweb tag (go test -tags embedweb ./frontend).
func TestTheEmbeddedBuildIsServable(t *testing.T) {
	dist, ok := web.Dist()
	if !ok {
		t.Fatal("no front end embedded")
	}
	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	for _, placeholder := range []string{"__CSP_NONCE__", "__APP_NAME__", "__APP_THEME__", "__APP_CONTEXT__"} {
		if !strings.Contains(string(index), placeholder) {
			t.Errorf("index.html has no %s: the build is not roux-web's (see Vite's html.cspNonce)", placeholder)
		}
	}
	assets, err := fs.Glob(dist, "assets/*.js")
	if err != nil || len(assets) == 0 {
		t.Fatalf("no hashed scripts under assets/: %v %v", assets, err)
	}
	if _, err := spa.New(spa.Config{FS: dist}); err != nil {
		t.Fatalf("the server cannot serve this build: %v", err)
	}
}
