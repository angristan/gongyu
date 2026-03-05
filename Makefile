.PHONY: build run dev dev-down clean test lint generate sqlc

generate:
	go tool templ generate
	go tool sqlc generate

build: generate
	go build -o gongyu ./cmd/gongyu

run: build
	./gongyu

dev:
	docker compose -f docker-compose.dev.yml up --build

dev-down:
	docker compose -f docker-compose.dev.yml down -v

test: generate
	go test ./... -race

lint: generate
	golangci-lint run

clean:
	rm -rf gongyu tmp
