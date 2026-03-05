.PHONY: run build test fmt templ

run:
	go run ./cmd/server

build:
	go build ./...

test:
	go test ./...

fmt:
	gofmt -w $$(rg --files -g '*.go')

templ:
	$$(go env GOPATH)/bin/templ generate ./internal/view
