# The app as one small image: the front end built, then embedded in the server, which runs alone
# on a distroless base (CA certificates and time zones included; no shell; not root).
#   make image
#   docker run -p 8080:8080 -e DATABASE_URL=... -e CODE_SECRET=... -e PUBLIC_URL=https://... roux-app
# Settings are environment variables; probes are /api/roux/healthz and /api/roux/readyz.

FROM node:26.13.1-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM golang:1.27.4 AS server
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /app/frontend/dist frontend/dist
RUN CGO_ENABLED=0 go build -tags embedweb -ldflags='-s -w' -trimpath -o /server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
