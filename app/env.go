package app

import (
	"errors"
	"fmt"
	"io/fs"

	"github.com/joho/godotenv"

	"github.com/jwcarman/roux/bindings"
)

// LoadEnv fills the environment the way roux reads it, never overwriting a variable already set:
// first the platform's service bindings (bindings.Apply), then .env in the working directory, if
// there is one (this machine's settings, such as its secrets: never committed, never in the image).
// So a variable you set wins, then a binding, then .env, then roux's defaults. Main calls it before
// anything reads the environment; a program that reads the app's settings without Main calls it first.
func LoadEnv() error {
	if err := bindings.Apply(); err != nil {
		return fmt.Errorf("app: %w", err)
	}
	if err := godotenv.Load(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("app: .env cannot be read: %w (fix it, or remove it)", err)
	}
	return nil
}
