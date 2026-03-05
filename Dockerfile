FROM golang:1.26-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o gongyu ./cmd/gongyu

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D -u 1000 gongyu
COPY --from=builder /build/gongyu /usr/local/bin/gongyu
USER gongyu

ENV LISTEN_ADDR=:8080

EXPOSE 8080
ENTRYPOINT ["gongyu"]
