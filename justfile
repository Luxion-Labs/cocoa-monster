_default:
    @just --list

install:
    npm install --legacy-peer-deps

clean:
    rm -rf contract/dist contract/node_modules/.vite ui/dist ui/.vite ui/node_modules/.vite

compact:
    @if [ ! -f contract/src/managed/cocoa/compiler/contract-info.json ] || [ ! -f contract/src/managed/factory/compiler/contract-info.json ] || [ contract/src/cocoa.compact -nt contract/src/managed/cocoa/compiler/contract-info.json ] || [ contract/src/factory.compact -nt contract/src/managed/factory/compiler/contract-info.json ]; then \
        nix develop -c sh -c 'cd contract && npm run compact'; \
    else \
        echo "compact artifacts are up to date"; \
    fi
    @if [ ! -f contract/dist/index.js ] || find contract/src -name '*.ts' -newer contract/dist/index.js | grep -q . || [ contract/src/managed/cocoa/compiler/contract-info.json -nt contract/dist/index.js ] || [ contract/src/managed/factory/compiler/contract-info.json -nt contract/dist/index.js ]; then \
        nix develop -c sh -c 'cd contract && npm run build'; \
    else \
        echo "contract build is up to date"; \
    fi

# Compile the contract, then start proof and UI services.
dev: install compact
    @if [ -S .overmind.sock ]; then \
        if overmind status >/dev/null 2>&1; then \
            echo "overmind is already running"; \
            overmind status; \
            exit 0; \
        fi; \
        echo "removing stale .overmind.sock"; \
        rm -f .overmind.sock; \
    fi; \
    env -u VITE_MARKET_FACTORY_ADDRESS -u VITE_MARKET_REGISTRY_URL -u VITE_INDEXER_URI -u VITE_INDEXER_WS_URI -u VITE_PROOF_SERVER_URI -u VITE_ZK_CONFIG_URI VITE_NETWORK_ID=preview overmind start --daemonize

down:
    @if [ -S .overmind.sock ]; then \
        if overmind status >/dev/null 2>&1; then \
            overmind quit; \
        else \
            echo "removing stale .overmind.sock"; \
            rm -f .overmind.sock; \
        fi; \
    fi
    @docker compose down --remove-orphans
    @rm -f .overmind.sock

test: compact
    cd contract && npm test
    env -u VITE_MARKET_FACTORY_ADDRESS -u VITE_MARKET_REGISTRY_URL -u VITE_INDEXER_URI -u VITE_INDEXER_WS_URI -u VITE_PROOF_SERVER_URI -u VITE_ZK_CONFIG_URI VITE_NETWORK_ID=preview npm --workspace ui test
