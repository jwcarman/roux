# The checks, fastest first; the first failure stops the run.
# Database tests use TEST_DATABASE_URL when set, otherwise a Postgres container each (needs Docker).

# golangci-lint, exactly this version, built into bin/ the first time `make lint` needs it, so the
# lint never depends on what a machine has installed. Raise the version here.
GOLANGCI_LINT_VERSION := v2.15.0
GOLANGCI_LINT := bin/golangci-lint-$(GOLANGCI_LINT_VERSION)

.PHONY: check fmt vet lint test

check: fmt vet lint test

fmt: ## only the module's packages: gofmt alone would walk into node_modules
	@out="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

vet:
	go vet ./...

lint: $(GOLANGCI_LINT)
	$(GOLANGCI_LINT) run ./...

$(GOLANGCI_LINT):
	GOBIN=$(CURDIR)/bin go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)
	mv bin/golangci-lint $@

test: ## writes coverage.out (SonarCloud reads it); a package is covered by any test that runs it
	go test -coverpkg=./... -coverprofile=coverage.out ./...
