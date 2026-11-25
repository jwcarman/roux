# The checks, fastest first; the first failure stops the run.
# Database tests use TEST_DATABASE_URL when set, otherwise a Postgres container each (needs Docker).

GOLANGCI_LINT ?= golangci-lint

.PHONY: check fmt vet lint test

check: fmt vet lint test

fmt: ## only the module's packages: gofmt alone would walk into node_modules
	@out="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

vet:
	go vet ./...

lint:
	$(GOLANGCI_LINT) run ./...

test: ## writes coverage.out (SonarCloud reads it)
	go test -coverprofile=coverage.out ./...
