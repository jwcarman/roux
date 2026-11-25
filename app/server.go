package app

import (
	"net/http"
	"time"
)

// Server is the HTTP server for handler on addr, with every connection bounded: the headers
// within 10 seconds, the whole request within 30, the answer within 60, and an idle keep-alive
// closed after 120, so a slow or silent client cannot hold a connection open. When the app is
// served over HTTPS (secure, as app.SecureCookies says), every answer also tells the browser to
// use HTTPS for a year (HSTS); subdomains are left alone, being another app's to decide.
func Server(addr string, handler http.Handler, secure bool) *http.Server {
	if secure {
		next := handler
		handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
			next.ServeHTTP(w, r)
		})
	}
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}
