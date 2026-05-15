_default:
    @just --list

# Install all workspace dependencies
install:
    npm install --legacy-peer-deps

# Compile the Compact contract to ZK circuits + TS bindings
compact:
    cd contract && npm run compact

# Build contract TS package after compilation
build-contract: compact
    cd contract && npm run build

# Build the production UI bundle
build-ui:
    cd ui && npm run build

# Build everything end-to-end
build: build-contract build-ui

# Run the UI dev server (Vite)
ui:
    cd ui && npm run dev

# Bring up local infra (proof server, etc.)
up:
    docker compose up -d

# Tear down local infra
down:
    docker compose down -v

# Boot every dev process (UI, proof server, ...) under one roof
dev:
    overmind start

# Build the UI Docker image
docker-ui:
    docker build -f ui/Dockerfile -t cocoa-monster-ui .
