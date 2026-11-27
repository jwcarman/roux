// Command server runs Roux The Day: roux's app.Main with this application's name, its look, its front end and its
// modules (modules.go).
package main

import (
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/spa"
	web "roux-the-day/frontend"
)

func main() {
	app.Main(app.Config{Name: "roux-the-day", DisplayName: "Roux The Day", Look: spa.Friendly, Frontend: web.Dist, Modules: modules})
}
