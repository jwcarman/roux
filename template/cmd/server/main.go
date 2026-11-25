// Command server runs Roux App: roux's app.Main with this application's name, its front end and its
// modules (modules.go).
package main

import (
	"github.com/jwcarman/roux/app"
	web "roux-app/frontend"
)

func main() {
	app.Main(app.Config{Name: "roux-app", DisplayName: "Roux App", Frontend: web.Dist, Modules: modules})
}
