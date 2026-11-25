// Command server runs Roux The Day: roux's app.Main with this application's name, its front end and its
// modules (modules.go).
package main

import (
	"github.com/jwcarman/roux/app"
	web "roux-the-day/frontend"
)

func main() {
	app.Main(app.Config{Name: "roux-the-day", DisplayName: "Roux The Day", Frontend: web.Dist, Modules: modules})
}
