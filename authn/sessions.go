package authn

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/api"
)

// The caller's own sessions, so a person can see every browser they are signed in on and
// sign any of them out (after losing a phone, or using a shared computer):
//
//	GET    /who/me/sessions              the live sessions, newest sign-in first
//	DELETE /who/me/sessions/{id}         ends one; the caller's own signs out at once, any other
//	                                     needs a recent sign-in
//	DELETE /who/me/sessions?others=true  ends every other session: {"ended": n}; needs a recent sign-in
//
// The id shown is not the session cookie, so showing it exposes nothing that could take a
// session over. userAgent (and the device label read from it) is whatever the browser
// sent at sign-in: untrusted text, to be shown as text.

type sessionView struct {
	ID           string  `json:"id"`
	Device       string  `json:"device"`
	UserAgent    *string `json:"userAgent"`
	SignInMethod string  `json:"signInMethod"`
	SignedInAt   string  `json:"signedInAt"`
	LastSeenAt   string  `json:"lastSeenAt"`
	Current      bool    `json:"current"`
}

func sessionNotFound() error {
	return NewError(http.StatusNotFound, "session-not-found", "No session of yours has that id")
}

func (h *Host) mountSessions() {
	h.HandleSigned("GET /me/sessions", func(w http.ResponseWriter, r *http.Request, p *Principal) error {
		rows, err := h.store.live(r.Context(), p.IdentityID, h.now(), h.sessionTimeout)
		if err != nil {
			return err
		}
		out := make([]sessionView, len(rows))
		for i, s := range rows {
			ua := ""
			if s.userAgent != nil {
				ua = *s.userAgent
			}
			out[i] = sessionView{
				ID: s.id.String(), Device: deviceLabel(ua), UserAgent: s.userAgent, SignInMethod: s.method,
				SignedInAt: s.signedInAt.Format(time.RFC3339Nano), LastSeenAt: s.lastSeenAt.Format(time.RFC3339Nano),
				Current: s.id == p.SessionID,
			}
		}
		return api.JSON(w, http.StatusOK, out)
	})

	h.HandleSigned("DELETE /me/sessions", func(w http.ResponseWriter, r *http.Request, p *Principal) error {
		// A stray request must not be able to end everything.
		if r.URL.Query().Get("others") != "true" {
			return NewError(http.StatusBadRequest, "invalid-request", "Ending every session needs others=true")
		}
		if err := h.RequireRecent(p); err != nil {
			return err
		}
		n, err := h.store.endOthers(r.Context(), p.IdentityID, p.SessionID, h.now(), h.sessionTimeout)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, struct {
			Ended int64 `json:"ended"`
		}{n})
	})

	h.HandleSigned("DELETE /me/sessions/{id}", func(w http.ResponseWriter, r *http.Request, p *Principal) error {
		// The id is looked at before the sign-in's age is: another person's session, an
		// unknown one and a malformed id are all the same 404.
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			return sessionNotFound()
		}
		live, err := h.store.isLive(r.Context(), p.IdentityID, id, h.now(), h.sessionTimeout)
		if err != nil {
			return err
		}
		if !live {
			return sessionNotFound()
		}
		if id == p.SessionID { // signing out this browser: what POST /logout does
			if err := h.endSession(w, r); err != nil {
				return err
			}
			h.clearCSRF(w, r)
			w.WriteHeader(http.StatusNoContent)
			return nil
		}
		if err := h.RequireRecent(p); err != nil {
			return err
		}
		if _, err := h.store.endLive(r.Context(), p.IdentityID, id, h.now(), h.sessionTimeout); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	})
}

// deviceLabel is a rough label read from a User-Agent, such as "Firefox on macOS": the
// more specific browsers are checked first, because Edge and Opera also say Chrome and
// Chrome also says Safari.
func deviceLabel(ua string) string {
	if strings.TrimSpace(ua) == "" {
		return "Unknown browser"
	}
	return browserOf(ua) + " on " + systemOf(ua)
}

func browserOf(ua string) string {
	switch {
	case strings.Contains(ua, "Edg/"):
		return "Edge"
	case strings.Contains(ua, "OPR/"), strings.Contains(ua, "Opera"):
		return "Opera"
	case strings.Contains(ua, "Firefox/"), strings.Contains(ua, "FxiOS"):
		return "Firefox"
	case strings.Contains(ua, "Chrome/"), strings.Contains(ua, "CriOS"):
		return "Chrome"
	case strings.Contains(ua, "Safari/"):
		return "Safari"
	}
	return "Unknown browser"
}

// systemOf: ChromeOS and Android also say Linux, and iOS says "like Mac OS X", so they go first.
func systemOf(ua string) string {
	switch {
	case strings.Contains(ua, "CrOS"):
		return "ChromeOS"
	case strings.Contains(ua, "Android"):
		return "Android"
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPad"):
		return "iOS"
	case strings.Contains(ua, "Windows"):
		return "Windows"
	case strings.Contains(ua, "Macintosh"), strings.Contains(ua, "Mac OS X"):
		return "macOS"
	case strings.Contains(ua, "Linux"):
		return "Linux"
	}
	return "unknown system"
}
