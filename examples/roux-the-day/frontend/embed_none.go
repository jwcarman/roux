//go:build !embedweb

// Package web carries the built roux-web front end inside the server binary. This build
// was made without the embedweb tag, so it carries none: see embed_web.go.
package web

import "io/fs"

// Dist reports that this binary has no front end built in.
func Dist() (fs.FS, bool) { return nil, false }
