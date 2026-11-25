package spa

import (
	"embed"
	"io/fs"
)

//go:embed all:standin
var standin embed.FS

// StandIn is a stand-in for a built front end (index.html with roux's four placeholders,
// one hashed script), so a server with no front end built still serves a page.
func StandIn() fs.FS {
	sub, err := fs.Sub(standin, "standin")
	if err != nil {
		panic(err) // the directory is embedded above; this cannot happen
	}
	return sub
}
