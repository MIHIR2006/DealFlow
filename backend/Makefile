# DealFlow360 backend
#
# `make ci` is what the pipeline runs. Keep it green locally before pushing.

SHELL := /bin/bash
.DEFAULT_GOAL := help

GOOSE   := go run github.com/pressly/goose/v3/cmd/goose@v3.24.1
MIGRATIONS := internal/db/migrations
PKG     := ./...

.PHONY: help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: run
run: ## Run the API server
	go run ./cmd/server

.PHONY: build
build: ## Compile all packages
	go build $(PKG)

.PHONY: fmt
fmt: ## Format all Go source
	gofmt -w .

.PHONY: fmt-check
fmt-check: ## Fail if any file is unformatted
	@out=$$(gofmt -l .); \
	if [ -n "$$out" ]; then echo "unformatted files:"; echo "$$out"; exit 1; fi

.PHONY: vet
vet: ## Run go vet
	go vet $(PKG)

.PHONY: lint
lint: ## Run golangci-lint
	golangci-lint run

.PHONY: test
test: ## Run tests with the race detector
	go test $(PKG) -race -count=1

.PHONY: arch
arch: ## Fail if internal/domain imports infrastructure
	@if grep -rEn '"(github.com/jackc/pgx|github.com/gin-gonic|github.com/gin-contrib|dealflow360/backend/internal/(db|service|transport|platform))' \
		internal/domain --include='*.go' 2>/dev/null; then \
		echo ""; \
		echo "ARCH VIOLATION: internal/domain must stay pure."; \
		echo "It may import only the stdlib and shopspring/decimal."; \
		exit 1; \
	fi
	@echo "arch: domain is pure"

.PHONY: ci
ci: fmt-check vet lint arch test build ## Everything the pipeline runs

.PHONY: sqlc
sqlc: ## Regenerate typed query code from internal/db/queries
	sqlc generate

.PHONY: sqlc-check
sqlc-check: ## Fail if generated code is stale
	sqlc diff

.PHONY: migrate-up
migrate-up: ## Apply all migrations
	$(GOOSE) -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" up

.PHONY: migrate-down
migrate-down: ## Roll back the last migration
	$(GOOSE) -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" down

.PHONY: migrate-status
migrate-status: ## Show migration status
	$(GOOSE) -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" status

.PHONY: seed
seed: ## Load the demo dataset
	go run ./cmd/seed

.PHONY: tidy
tidy: ## Tidy module dependencies
	go mod tidy
