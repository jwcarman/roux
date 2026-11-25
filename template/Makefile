# Everyday targets. `make check` runs the Go checks, fastest first, stopping at the first
# failure; `make build` makes the release binary: one file, with the front end inside.

GOLANGCI_LINT ?= golangci-lint

.PHONY: check fmt lint build web build-dev image test vet clean

check: fmt vet lint test

fmt:
	@out="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

lint:
	$(GOLANGCI_LINT) run ./...

build: web ## one self-contained binary (bin/roux-app): front end embedded, stripped
	go build -tags embedweb -ldflags='-s -w' -trimpath -o bin/roux-app ./cmd/server

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
