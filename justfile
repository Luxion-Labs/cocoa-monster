_default:
    @just --list

install:
    npm install --legacy-peer-deps

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

# Compile the contract, then start proof, oracle, and UI services.
dev: install compact
    overmind start

test: compact
    cd contract && npm test
    cd ui && npm test
