# @jwcarman/create-roux-app

Starts a new [roux](https://github.com/jwcarman/roux) app: Spring Boot 4 and React on roux, with
sign-in, the first owner, the sidebar frame, Users, Settings and Appearance.

```bash
npm create @jwcarman/roux-app acme-gym
npm create @jwcarman/roux-app acme-gym -- --name "Acme Fitness"
```

`acme-gym` is the new directory, the Maven artifact and the npm name: lowercase letters, digits and
single dashes, starting with a letter. The name (by default the directory's words, "Acme Gym") is
what people see until the owner renames the app. The app is roux's app template at this package's
version, with roux at the same version from Maven Central and npm, a Maven wrapper, and a first
commit when git can make one.

Then, with Docker running and JDK 25:

```bash
cd acme-gym
./mvnw spring-boot:run -Dspring-boot.run.arguments="--roux.owner.email=you@example.com --roux.owner.name=You"
```

[Getting started](https://github.com/jwcarman/roux/blob/main/docs/guides/getting-started.md) goes on
from there.
