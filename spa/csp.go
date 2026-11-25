package spa

import (
	"fmt"
	"regexp"
	"strings"
)

// Directive names a Content-Security-Policy directive an application may add
// sources to. Only these can be extended: default-src, object-src, base-uri and
// frame-ancestors have no way to be loosened.
type Directive string

const (
	ScriptSrc  Directive = "script-src"
	StyleSrc   Directive = "style-src"
	ImgSrc     Directive = "img-src"
	FontSrc    Directive = "font-src"
	ConnectSrc Directive = "connect-src"
	FrameSrc   Directive = "frame-src"
	MediaSrc   Directive = "media-src"
	FormAction Directive = "form-action"
)

const self = "'self'"

// extendable lists the directives in the order they are written, with the
// sources each starts from and whether the response's nonce applies.
var extendable = []struct {
	name   Directive
	base   string
	nonced bool
}{
	{ScriptSrc, self, true},
	{StyleSrc, self, true},
	{ImgSrc, self + " data:", false},
	{FontSrc, self, false},
	{ConnectSrc, self, false},
	{FrameSrc, self, false},
	{MediaSrc, self, false},
	{FormAction, self, false},
}

var (
	never      = map[string]bool{"*": true, "'unsafe-inline'": true, "'unsafe-eval'": true, "'unsafe-hashes'": true}
	schemeOnly = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*:$`)
	oneSource  = regexp.MustCompile(`^[^\s;,]+$`)
)

// policy is the shell's Content-Security-Policy: strict by default (everything
// from the app's own origin; scripts and styles also with the response's nonce;
// no plugins, no framing; forms only to the app). 'unsafe-inline' and
// 'unsafe-eval' are never in it.
type policy struct {
	added map[Directive][]string
}

// newPolicy appends extra sources after the defaults, never replacing them. A
// source that would undo the policy (a wildcard, an unsafe keyword, a bare
// scheme for scripts or styles, or anything that would end the directive) is
// refused, so a bad setting stops the application from starting instead of
// weakening it.
func newPolicy(extra map[Directive][]string) (*policy, error) {
	known := map[Directive]bool{}
	nonced := map[Directive]bool{}
	for _, d := range extendable {
		known[d.name] = true
		nonced[d.name] = d.nonced
	}
	p := &policy{added: map[Directive][]string{}}
	for directive, sources := range extra {
		if !known[directive] {
			return nil, fmt.Errorf("spa: csp: %q cannot be extended", directive)
		}
		for _, src := range sources {
			switch {
			case !oneSource.MatchString(src):
				return nil, refused(directive, src, "is not one source: no spaces, ';' or ','")
			case never[strings.ToLower(src)]:
				return nil, refused(directive, src, "would loosen the policy for everything")
			case nonced[directive] && schemeOnly.MatchString(src):
				return nil, refused(directive, src, "would allow every "+src+" source")
			}
			p.added[directive] = append(p.added[directive], src)
		}
	}
	return p, nil
}

func refused(d Directive, src, why string) error {
	return fmt.Errorf("spa: csp %s: %q %s", d, src, why)
}

// forNonce is the header value for a response whose inline scripts and styles
// carry nonce.
func (p *policy) forNonce(nonce string) string {
	directives := []string{"default-src " + self}
	for _, d := range extendable {
		sources := []string{d.base}
		if d.nonced {
			sources = append(sources, "'nonce-"+nonce+"'")
		}
		sources = append(sources, p.added[d.name]...)
		directives = append(directives, string(d.name)+" "+strings.Join(sources, " "))
	}
	directives = append(directives, "object-src 'none'", "base-uri "+self, "frame-ancestors 'none'")
	return strings.Join(directives, "; ")
}
