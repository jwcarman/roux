# Everyday targets. `make check` runs the Go checks, fastest first, stopping at the first
# failure; `make build` makes the release binary: one file, with the front end inside.

GOLANGCI_LINT ?= golangci-lint

.PHONY: check dev up down e2e fmt lint build web build-dev image test vet clean

check: fmt vet lint test

# dev's settings are for this machine, and each gives way to the environment: OWNER_EMAIL=you@...
# make dev signs you in as yourself. A deployment makes its own CODE_SECRET (openssl rand -base64 32).
dev: ## run the app at http://localhost:8080: Postgres and Mailpit (http://localhost:8025), the front end built once, the server
	docker compose up -d --wait postgres mailpit
	@test -f frontend/dist/index.html || $(MAKE) web
	CODE_SECRET="$${CODE_SECRET:-development-only-code-secret-do-not-deploy}" \
	DATABASE_URL="$${DATABASE_URL:-postgres://app:app@localhost:5432/app}" \
	OWNER_EMAIL="$${OWNER_EMAIL:-owner@example.com}" OWNER_NAME="$${OWNER_NAME:-Owner}" \
	FRONTEND_DIR=frontend/dist LOG_FORMAT=text go run ./cmd/server

up: ## the app in Docker at http://localhost:8080, as a deployment runs it: the image built, Postgres and Mailpit beside it
	docker compose --profile app up -d --build --wait
	@echo "Up at http://localhost:8080: sign in as $${OWNER_EMAIL:-owner@example.com}, the link is in Mailpit, http://localhost:8025. make down stops it."

down: ## stop everything docker compose started; the database keeps its data
	docker compose --profile app --profile oidc --profile otel stop

e2e: ## the Playwright suite against a fresh copy of the app on port 8099 (its own database); ARGS go to Playwright
	e2e/run.sh $(ARGS)

fmt:
	@out="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

lint:
	$(GOLANGCI_LINT) run ./...

build: web ## one self-contained binary (bin/roux-the-day): front end embedded, stripped
	go build -tags embedweb -ldflags='-s -w' -trimpath -o bin/roux-the-day ./cmd/server

web: ## build the front end into frontend/dist
	cd frontend && npm ci && npm run build

build-dev: ## the server alone (bin/roux-the-day-dev); serves FRONTEND_DIR or a stand-in page; needs no Node
	go build -o bin/roux-the-day-dev ./cmd/server

image: ## the container image (Dockerfile): roux-the-day, from a clean build of the front end and server
	docker build -t roux-the-day .

test: ## the Go tests; database tests use TEST_DATABASE_URL, or a Postgres container each (Docker)
	go test -coverpkg=./... -coverprofile=coverage.out ./...

vet:
	go vet ./...

clean:
	rm -rf bin frontend/dist
