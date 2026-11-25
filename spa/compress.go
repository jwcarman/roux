package spa

import (
	"bytes"
	"compress/gzip"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/andybalholm/brotli"
)

// Responses for text-like files are compressed for browsers that accept it: the front end's
// JavaScript is about 1.2 MB raw, about 356 KB gzipped and about 314 KB with brotli. Brotli is
// preferred when the browser accepts it (equal quality, or a higher one than gzip), gzip is the
// fallback, and anything else gets the file as it is. A file is compressed the first time it is
// asked for and the result kept, keyed by the file's content and the encoding, so a build served
// from disk that changes is never answered with a stale copy; of many first requests at once, one
// compresses and the rest wait for it. Fonts and images are already compressed and are sent as
// they are; so is anything too small to be worth it. (The shell is rendered per request and is
// not compressed.)

const (
	minCompress = 256 // below this a compressed stream is no smaller, and not worth the bytes
	maxCached   = 512 // a safety net for a build that changes endlessly (development)

	// brotliQuality is the best ratio brotli offers. It is slow (about a second for the whole
	// front end), which does not matter: it is paid once per file, on the first request.
	brotliQuality = 11
)

// Content codings this server can answer with.
const (
	encBrotli = "br"
	encGzip   = "gzip"
)

// compressible says whether a file's type is text: the only ones worth compressing.
func compressible(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".js", ".mjs", ".css", ".html", ".htm", ".svg", ".json", ".map", ".txt", ".xml", ".webmanifest":
		return true
	}
	return false
}

// chooseEncoding says which coding to answer with: the one the request's Accept-Encoding
// likes best of br and gzip (a quality above zero, by name or by a wildcard unless the coding
// itself was refused), brotli on a tie, or "" for the file as it is.
func chooseEncoding(r *http.Request) string {
	explicit := map[string]float64{}
	wildcard := -1.0
	for _, field := range r.Header.Values("Accept-Encoding") {
		for part := range strings.SplitSeq(field, ",") {
			token, params, _ := strings.Cut(strings.TrimSpace(part), ";")
			q := 1.0
			if _, v, ok := strings.Cut(strings.ReplaceAll(params, " ", ""), "q="); ok {
				f, err := strconv.ParseFloat(v, 64)
				if err != nil {
					continue
				}
				q = f
			}
			switch coding := strings.ToLower(strings.TrimSpace(token)); coding {
			case "x-gzip":
				explicit[encGzip] = q
			case encBrotli, encGzip:
				explicit[coding] = q
			case "*":
				wildcard = q
			}
		}
	}
	quality := func(coding string) float64 {
		if q, ok := explicit[coding]; ok {
			return q
		}
		return max(wildcard, 0)
	}
	best, bestQ := "", 0.0
	for _, coding := range []string{encBrotli, encGzip} { // brotli first: it wins a tie
		if q := quality(coding); q > bestQ {
			best, bestQ = coding, q
		}
	}
	return best
}

// compressCache keeps compressed files by encoding and content hash.
type compressCache struct {
	mu          sync.Mutex
	m           map[string]*entry
	compressing atomic.Int64 // how many compressions were actually done (for tests)
}

type entry struct {
	once sync.Once
	out  []byte // empty: not worth compressing
}

// get returns the file compressed with the coding, or nil if compressing it would not make it
// smaller. Concurrent calls for the same file and coding compress it once.
func (c *compressCache) get(coding, key string, data []byte) []byte {
	k := coding + "|" + key
	c.mu.Lock()
	if c.m == nil || len(c.m) >= maxCached {
		c.m = map[string]*entry{}
	}
	e, ok := c.m[k]
	if !ok {
		e = &entry{}
		c.m[k] = e
	}
	c.mu.Unlock()

	e.once.Do(func() {
		c.compressing.Add(1)
		// A file that cannot be compressed, or hardly shrinks, is served as it is.
		if packed, err := compress(coding, data); err == nil && len(packed) < len(data)*95/100 {
			e.out = packed
		}
	})
	return e.out
}

// contentType is the type to send for a compressible file (it must be set explicitly:
// sniffing compressed bytes would see a compressed stream).
func contentType(name string) string { return mime.TypeByExtension(path.Ext(name)) }

// compress is data in coding (brotli, else gzip), at the strongest level worth serving.
func compress(coding string, data []byte) ([]byte, error) {
	var buf bytes.Buffer
	var w io.WriteCloser
	if coding == encBrotli {
		w = brotli.NewWriterOptions(&buf, brotli.WriterOptions{Quality: brotliQuality})
	} else {
		gz, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		if err != nil {
			return nil, err
		}
		w = gz
	}
	if _, err := w.Write(data); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
