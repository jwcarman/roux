# Everyday targets. `make check` runs the Go checks, fastest first, stopping at the first
# failure; `make build` makes the release binary: one file, with the front end inside.

# golangci-lint, exactly this version, built into bin/ the first time `make lint` needs it, so the
# lint never depends on what a machine has installed. Raise the version here.
GOLANGCI_LINT_VERSION := v2.15.0
GOLANGCI_LINT := bin/golangci-lint-$(GOLANGCI_LINT_VERSION)

.PHONY: check verify services dev up down e2e fmt lint build web build-dev image test vet clean

check: fmt vet lint test

# make verify is every check an app has, fastest first, stopping at the first failure: its exit status
# alone says whether the app is good. It starts nothing (see make services).
verify: check ## every check: the Go checks, the front end's format, lint, tests and build, then the Playwright suite
	cd frontend && npm ci && npm run format:check && npm run lint && npm run coverage && npm run build
	e2e/run.sh

# Postgres and Mailpit, on this machine, for make dev, make e2e and make verify. Elsewhere, give
# their addresses instead: DATABASE_URL, SMTP_ADDR and E2E_MAILPIT_URL (TEST_DATABASE_URL for make test).
services: ## Postgres and Mailpit on this machine (http://localhost:8025): make e2e and make verify need them, or their addresses
	docker compose up -d --wait postgres mailpit

# make dev is the working loop: Postgres and Mailpit, then the server under air (rebuilt when a Go file
# changes) and Vite (the pages, reloaded as you edit) together, at http://localhost:5173
# (scripts/dev.sh). Its settings are for this machine, and each gives way to the environment:
# OWNER_EMAIL=you@... make dev signs you in as yourself. A deployment makes its own CODE_SECRET
# (openssl rand -base64 32).
dev: services frontend/node_modules/.package-lock.json ## the live loop at http://localhost:5173: Postgres and Mailpit (http://localhost:8025), the server rebuilt when Go changes, Vite
	scripts/dev.sh

up: ## the app in Docker at http://localhost:8080, as a deployment runs it: the image built, Postgres and Mailpit beside it
	docker compose --profile app up -d --build --wait
	@echo "Up at http://localhost:8080: sign in as $${OWNER_EMAIL:-owner@example.com}, the link is in Mailpit, http://localhost:8025. make down stops it."

down: ## stop everything docker compose started; the database keeps its data
	docker compose --profile app --profile oidc --profile otel stop

e2e: ## the Playwright suite against a fresh copy of the app on port 8099 (its own database; make services first); ARGS go to Playwright
	e2e/run.sh $(ARGS)

fmt:
	@out="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

lint: $(GOLANGCI_LINT)
	$(GOLANGCI_LINT) run ./...

$(GOLANGCI_LINT):
	GOBIN=$(CURDIR)/bin go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)
	mv bin/golangci-lint $@

build: web ## one self-contained binary (bin/roux-app): front end embedded, stripped
	go build -tags embedweb -ldflags='-s -w' -trimpath -o bin/roux-app ./cmd/server

# The front end's build, remade whenever anything it is built from is newer than it, so make e2e
# never serves a stale one; its dependencies are installed again when the lock changes.
# Tests and the generated route tree are not inputs (the router plugin rewrites the tree as it builds).
FRONTEND_INPUTS := $(shell find frontend/src frontend/public -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -name routeTree.gen.ts 2>/dev/null) \
	frontend/index.html frontend/vite.config.ts frontend/tsconfig.json frontend/node_modules/.package-lock.json

frontend/node_modules/.package-lock.json: frontend/package-lock.json
	cd frontend && npm ci

frontend/dist/index.html: $(FRONTEND_INPUTS)
	cd frontend && npm run build

web: ## build the front end into frontend/dist
	cd frontend && npm ci && npm run build

build-dev: ## the server alone (bin/roux-app-dev); serves FRONTEND_DIR or a stand-in page; needs no Node
	go build -o bin/roux-app-dev ./cmd/server

image: ## the container image (Dockerfile): roux-app, from a clean build of the front end and server
	docker build -t roux-app .

test: ## the Go tests; database tests use TEST_DATABASE_URL, or a Postgres container each (Docker)
	go test -coverpkg=./... -coverprofile=coverage.out ./...

vet:
	go vet ./...

clean:
	rm -rf bin frontend/dist
