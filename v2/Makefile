.PHONY: dev build clean test lint sqlc frontend-install frontend-build frontend-typecheck go-build go-test go-lint ci

# Development
dev:
	wails dev

# Production build
build:
	wails build -clean

# Frontend
frontend-install:
	cd frontend && pnpm install

frontend-build:
	cd frontend && pnpm build

frontend-typecheck:
	cd frontend && pnpm typecheck

# Go
go-build:
	go build -o build/bin/phantomos .

go-test:
	go test ./... -v -race

go-lint:
	golangci-lint run ./...

# sqlc (Phase 1+)
sqlc:
	sqlc generate

# Clean
clean:
	rm -rf build/bin
	rm -rf build/frontend
	rm -rf frontend/node_modules

# All tests
test: go-test frontend-typecheck

# CI
ci: frontend-install frontend-build go-build
