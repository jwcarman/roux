// Package apperr defines the shared, HTTP-agnostic error vocabulary for the
// kit. Domain code wraps these with context and returns them; api.NewMux maps
// them to RFC 9457 problems by default.
//
//	return fmt.Errorf("item %d: %w", id, apperr.ErrNotFound)
package apperr

import "errors"

var (
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("conflict")
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
)
