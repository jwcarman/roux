# @jwcarman/create-roux-app

Starts a new [roux](https://github.com/jwcarman/roux) app: a Go server and a React front end on
roux, with sign-in, the first owner, the sidebar frame, Users, Settings and Appearance.

```bash
npm create @jwcarman/roux-app team-planner
npm create @jwcarman/roux-app team-planner -- --name "Acme Planner"
```

`team-planner` is the new directory, the Go module and the npm name: lowercase letters, digits and
single dashes, starting with a letter. The name (by default the directory's words, "Team Planner")
is what people see until the owner renames the app. The app is roux's app template at this
package's version, with roux at the same version from the Go module proxy and npm, and a first
commit when git can make one.

Then, with Docker running, Go 1.27 and Node 20 or later:

```bash
cd team-planner
make dev
```

and sign in at <http://localhost:8080> as `owner@example.com` (the link is in Mailpit,
<http://localhost:8025>).

[Getting started](https://jwcarman.github.io/roux/guides/getting-started/) goes on from there.
