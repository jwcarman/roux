//go:build embedweb

// Package web carries the built roux-web front end inside the server binary.
//
// It is compiled in only with the embedweb build tag, after the front end has been built:
//
//	cd frontend && npm ci && npm run build      # makes frontend/dist
//	go build -tags embedweb ./cmd/server        # embeds it (or: make build)
//
// Without the tag nothing here is compiled, so `go build`, `go test` and `go vet` need no
// Node and no dist directory.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist is the built front end (index.html at its root, hashed files under assets/), and
// whether this binary has one.
func Dist() (fs.FS, bool) {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil, false
	}
	return sub, true
}
