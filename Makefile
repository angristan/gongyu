.PHONY: build run dev clean

build:
	go build -o gongyu ./cmd/gongyu

run: build
	./gongyu

dev:
	go run ./cmd/gongyu

clean:
	rm -f gongyu
