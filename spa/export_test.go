package spa

import "net/http"

// Compressions says how many compressions a handler from New has actually done, so a test can
// tell a cached answer from a repeated one.
func Compressions(h http.Handler) int64 { return h.(*handler).compress.compressing.Load() }
