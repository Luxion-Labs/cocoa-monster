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

# Run the contract simulator tests + UI component tests
test:
    cd contract && npm test
    cd ui && npm test

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

# Build the cocoa-monster Docker image via nix (matches what CI ships)
# and load it into the local docker daemon as `cocoa-monster:latest`.
docker-image:
    nix build .#docker-image -o result
    docker load -i result

# Push the Concourse pipeline (set FLY_TARGET to override target name)
repipe:
    ./ci/repipe

# Lint the helm chart so a stray template syntax error doesn't slip
# through to the deployments-side tofu apply.
helm-lint:
    helm lint charts/cocoa-monster

# Render the chart with the testflight values for offline review.
helm-template:
    helm template cocoa-monster charts/cocoa-monster -f ci/testflight/values.yaml
