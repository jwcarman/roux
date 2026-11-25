# Roux The Day: findings

Roux The Day is the example roux grows from: a team's shared planner, built in rounds. Each entry
below is something that was hard, missing or clunky while building it, what roux could do about
it, and where in the app it shows. What more than one app would need is extracted into roux.

## Round one: items, and a paginator

- **Copying the template by hand.** The app started as `rsync` of `template/` plus renaming
  `roux-app` in nine files (`go.mod`, imports, the Makefile's binaries, telemetry's service name,
  `APP_NAME`, the package names) and repointing `file:` paths one level deeper. create-roux-app
  does this for a new app, but not inside roux's own repository. *roux could:* let
  create-roux-app write into `examples/` with the runtime and roux-web linked from the repo.
