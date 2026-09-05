# Stage 1: Build the Go binary
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the binary as a statically linked executable
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /dealflow-server ./cmd/server

# Stage 2: Minimal runtime image
FROM alpine:3.20

WORKDIR /app

# The backend expects the migrations folder if we want to run migrations, but
# usually migrations are run via an init container or script. We'll copy them just in case.
COPY --from=builder /app/internal/db/migrations ./internal/db/migrations

# Copy the statically compiled binary
COPY --from=builder /dealflow-server /app/dealflow-server

EXPOSE 8080

CMD ["/app/dealflow-server"]
