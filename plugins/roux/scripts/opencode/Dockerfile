# OpenCode and a Linux copy of an eval fixture, for running roux's evals with a local model.
# Built by build-image.sh with an eval fixture (eval-fixture.sh) as its context. The model is not in
# here: LM Studio serves it on the Mac, which a container reaches at host.docker.internal.
FROM eclipse-temurin:25-jdk

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

ARG OPENCODE_URL=https://github.com/anomalyco/opencode/releases/download/v2.2.5/opencode-linux-arm64.tar.gz
RUN curl -fsSL "$OPENCODE_URL" | tar -xz -C /usr/local/bin && opencode --version

WORKDIR /fixture
COPY . /fixture

# The fixture's own mvnw runs its bundled macOS JDK; here Maven runs on the image's.
RUN printf '%s\n' '#!/bin/sh' \
      '# Maven, bundled with this copy of the app; Java is the image'"'"'s.' \
      'base="$(cd "$(dirname "$0")" && pwd)"' \
      'mkdir -p "$base/.mvn/home"' \
      'MAVEN_OPTS="-Duser.home=$base/.mvn/home ${MAVEN_OPTS:-}"' \
      'export MAVEN_OPTS' \
      'exec "$base/.mvn/maven/bin/mvn" "$@"' > mvnw \
  && chmod +x mvnw

# Node for Linux, and the Linux builds of npm's native packages, fetched once; then npm is offline
# again, as in the fixture, and one build proves the copy works.
RUN ./mvnw -B -q frontend:install-node-and-npm@install-node \
  && sed -i 's/^offline=true$/prefer-offline=true/' frontend/.npmrc \
  && (cd frontend && PATH="/fixture/target/node:$PATH" npm ci --no-audit --no-fund) \
  && sed -i 's/^prefer-offline=true$/offline=true/' frontend/.npmrc \
  && ./mvnw -B -q -o package -DskipTests -Djacoco.skip=true \
  && rm -f Dockerfile \
  && git -c user.name=eval-fixture -c user.email=eval-fixture@example.invalid commit -q -am "The fixture, for Linux"

ENV PATH="/fixture/target/node:${PATH}"
