# cocoa.monster — Setup

This guide gets you from a clean machine to a running local dev environment,
and covers tests, factory deployment, and production builds.

Everything except Nix, Docker, and a browser wallet is provided by the **Nix
dev shell** — you do **not** install `just`, `overmind`, the Compact compiler,
Helm, etc. by hand.

- [Prerequisites](#prerequisites)
- [1. Install Nix](#1-install-nix-with-flakes)
- [2. Install direnv](#2-install-direnv)
- [3. Install Docker](#3-install-docker)
- [4. Install a Midnight wallet](#4-install-a-midnight-wallet)
- [5. Enter the dev shell](#5-enter-the-dev-shell)
- [6. Run the app](#6-run-the-app)
- [Just task reference](#just-task-reference)
- [Running without direnv / just](#running-without-direnv--just)
- [Configuration](#configuration)
- [Factory deployment](#factory-deployment)
- [Market discussion (Pinata)](#market-discussion-pinata)
- [Tests](#tests)
- [Production build & deploy](#production-build--deploy)
- [Continuous integration](#continuous-integration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Why | Installed by hand? |
| --- | --- | --- |
| [Nix](https://nixos.org/download) (flakes) | Provides the entire toolchain reproducibly | **Yes** |
| [direnv](https://direnv.net) | Auto-loads the dev shell + `.env` | **Yes** (recommended) |
| Docker | Runs the local proof-server | **Yes** |
| A Midnight-compatible browser wallet (Lace) | Sign/balance transactions | **Yes** |
| `just`, `overmind`, `compact`, Node 22, Helm, … | Build/run tasks | No — from the Nix shell |

Supported host platforms: Linux and macOS (x86_64 / aarch64). The reproducible
Docker image build (`nix build .#docker-image`) targets `x86_64-linux`.

---

## 1. Install Nix (with flakes)

The recommended installer is the [Determinate Systems Nix
installer](https://github.com/DeterminateSystems/nix-installer), which enables
flakes by default (this is the same installer CI uses):

```sh
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

Restart your shell, then verify:

```sh
nix --version
```

If you used the **official** installer instead, enable flakes manually by
adding this to `~/.config/nix/nix.conf` (or `/etc/nix/nix.conf`):

```
experimental-features = nix-command flakes
```

## 2. Install direnv

`direnv` loads the Nix dev shell and `.env` automatically whenever you `cd`
into the repo (see `.envrc`, which contains `use flake .` + `dotenv_if_exists`).

```sh
# macOS
brew install direnv

# Debian/Ubuntu
sudo apt install direnv

# Nix (any OS)
nix profile install nixpkgs#direnv
```

Then hook it into your shell (add to `~/.bashrc` / `~/.zshrc`):

```sh
eval "$(direnv hook bash)"   # or: zsh, fish, etc.
```

> Prefer not to use direnv? See [Running without direnv / just](#running-without-direnv--just).

## 3. Install Docker

Install [Docker Engine](https://docs.docker.com/engine/install/) (Linux) or
[Docker Desktop](https://docs.docker.com/desktop/) (macOS/Windows). The local
proof-server runs as a container (`midnightntwrk/proof-server:8.0.3`, port
`6300`) via `docker-compose.yml`. Confirm the daemon is running:

```sh
docker info
```

## 4. Install a Midnight wallet

Install the **Lace** browser extension with Midnight support and create/restore
a wallet on the **preview** testnet (the default network for local dev). Fund it
from the Midnight testnet faucet if you want to place real testnet bets.

You can browse markets read-only without a wallet; creating markets, betting,
and redeeming require one.

---

## 5. Enter the dev shell

With direnv:

```sh
cd cocoa-monster
direnv allow          # one-time approval; loads the flake + .env
```

The first load compiles/downloads the toolchain and can take several minutes.
Subsequent loads are instant (cached). The shell provides, among others:

`node` (22) · `pnpm` · `typescript` · `just` · `overmind` · `docker-compose` ·
`compact` (bundled CLI + compiler, no `compact update` needed) · `kubectl` ·
`kubernetes-helm` · `ytt` · `fly` · `git-cliff` · `jq` · `yq` · `alejandra`.

Verify:

```sh
just --list
compact --version
```

---

## 6. Run the app

Create your environment file (optional — defaults to the `preview` testnet):

```sh
cp .env.example .env
```

Then start everything with one command:

```sh
just dev
```

`just dev` will:

1. `npm install --legacy-peer-deps` (workspace deps for `contract` + `ui`),
2. compile the Compact contracts and build the contract bindings **if sources
   changed** (idempotent — skips when artifacts are up to date),
3. sync the compiled ZK artifacts into `ui/public/{keys,zkir}`,
4. start `overmind` (daemonized) running the proof-server (Docker) and the
   Vite dev server.

Open **<http://localhost:5173>**.

Stop and clean up:

```sh
just down            # stops overmind + docker compose, removes the socket
```

> `just dev` forces `VITE_NETWORK_ID=preview` and clears any `VITE_*` endpoint
> overrides so local runs always target the preview testnet with a same-origin
> proxied proof-server.

---

## Just task reference

| Task | Description |
| --- | --- |
| `just` / `just --list` | List available tasks |
| `just install` | `npm install --legacy-peer-deps` |
| `just compact` | Compile Compact + build contract bindings (only if stale) |
| `just dev` | Install, compile, and start proof-server + UI (daemonized) |
| `just down` | Stop overmind + `docker compose down`, remove `.overmind.sock` |
| `just test` | Compile, then run contract + UI unit tests |
| `just clean` | Remove build artifacts (`dist`, `.vite` caches) |

Overmind tip: with services running, `overmind connect ui` (or `proof`)
attaches to a process's logs; `overmind status` shows process state.

---

## Running without direnv / just

Everything still works through Nix directly.

```sh
# Open the dev shell manually (instead of direnv)
nix develop

# Inside the shell — equivalent to `just dev` steps:
npm install --legacy-peer-deps
npm --workspace contract run compact     # compile cocoa.compact + factory.compact
npm --workspace contract run build       # tsc + bundle managed artifacts
npm --workspace ui run dev               # Vite dev server on :5173 (auto-syncs ZK config)

# Local proof-server in another shell:
docker compose up proof-server           # listens on :6300
```

`VITE_NETWORK_ID` **must** be set (`preview`, `preprod`, or `mainnet`) or the
Vite dev server refuses to start. Build/lint/test also have first-class Nix
apps that mirror CI exactly:

```sh
nix run .#compact      # compile contracts
nix run .#typecheck    # tsc --noEmit (contract + ui)
nix run .#build        # full production build
nix run .#cypress      # e2e against the built bundle
nix flake check        # evaluate the flake
```

---

## Configuration

Runtime config is read by the browser from `window.__COCOA_MONSTER_CONFIG__`
(served as `/env.js`). For local dev, values come from `.env`
(see `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_NETWORK_ID` | Yes | `preview` (default), `preprod`, or `mainnet`; selects a preset from `midnight-networks.json` |
| `VITE_MARKET_FACTORY_ADDRESS` | No | Shared factory address so every browser sees the same markets |
| `VITE_PINATA_JWT` | No | Enables the IPFS comment panel (omit to disable) |
| `VITE_PINATA_GATEWAY` | No | Dedicated Pinata gateway host |
| `VITE_PINATA_GATEWAY_KEY` | No | Access token for a restricted gateway |

`midnight-networks.json` defines the indexer (HTTP + WS), proof-server, and
relay/RPC endpoints for each network. In local dev the proof-server URI is
overridden to the SPA origin and proxied by Vite to the Docker proof-server
on `:6300`.

---

## Factory deployment

Each environment should use its own `MarketFactory`. The headless deployer is
**idempotent**: if an address already exists (in `COCOA_FACTORY_ADDRESS` or the
env state file) it prints it and submits no transaction; otherwise it derives a
wallet, deploys the factory, and records the address.

```sh
VITE_NETWORK_ID=preview npm run deploy:factory
```

To deploy a *missing* factory you must provide a funded wallet seed:

| Variable | Purpose |
| --- | --- |
| `COCOA_FACTORY_MNEMONIC` | BIP-39 English seed phrase (preferred) |
| `COCOA_FACTORY_SEED_HEX` | Raw seed hex (e.g. for generated CI wallets) |
| `COCOA_FACTORY_MNEMONIC_PASSPHRASE` | Optional BIP-39 passphrase |
| `COCOA_FACTORY_ENV` | Logical env name (default `local`) |
| `COCOA_FACTORY_STATE_FILE` | State path (default `.cocoa/factory-<env>.json`) |
| `COCOA_FACTORY_ADDRESS` | Reuse a known address; skips deployment |
| `COCOA_FACTORY_PRIVATE_STATE_PASSWORD` | Encrypts the deployer's private-state store |
| `COCOA_FACTORY_ACCOUNT_INDEX` | HD account index (default `0`) |

After deploying, set `VITE_MARKET_FACTORY_ADDRESS` (runtime config) for shared
deployments, or paste the address into `/oracle` for a browser-local override.

---

## Market discussion (Pinata)

The per-market comment thread is stored on IPFS via Pinata — there is no
backend. To enable it, set `VITE_PINATA_JWT` (scope the Pinata key to pinning
only) and optionally `VITE_PINATA_GATEWAY` / `VITE_PINATA_GATEWAY_KEY`. Omit
`VITE_PINATA_JWT` to hide the discussion panel entirely. Comment authenticity
comes from per-comment P-256 signatures, not from trusting the embedded key.

---

## Tests

```sh
just test
```

This compiles the contracts, then runs:

- contract unit tests — `cd contract && npm test` (Vitest; CPMM math,
  circuit simulator, client API),
- UI unit tests — `npm --workspace ui test` (Vitest + Testing Library).

End-to-end (Cypress) tests run against a built bundle, exactly as in CI:

```sh
nix run .#cypress
```

---

## Production build & deploy

Production serves a **static** SPA from nginx on Kubernetes — `VITE_NETWORK_ID`
and the factory address are loaded by the browser at runtime from `/env.js`,
not baked at build time.

```sh
# Reproducible OCI image (bundles compiled Compact bindings + Vite dist)
nix build .#docker-image
```

Deploy with the Helm chart in `charts/cocoa-monster`:

- runtime config is rendered into a ConfigMap and mounted at
  `/usr/share/nginx/html/env.js` (`runtimeConfig.values`, e.g.
  `VITE_NETWORK_ID`, `VITE_MARKET_FACTORY_ADDRESS`),
- nginx serves the SPA with an `index.html` fallback and a cheap `/healthz`
  endpoint for liveness/readiness probes,
- `/keys` and `/zkir` are served directly; requests for builtin Zswap circuits
  intentionally 404 so midnight-js falls back to the proof-server's builtin keys,
- a self-hosted proof-server (own Deployment + CORS ingress) is available but
  off by default — browsers can use the selected network's public preset.

Lint/preview the chart:

```sh
helm lint charts/cocoa-monster
helm template charts/cocoa-monster
```

---

## Continuous integration

`.github/workflows/ci.yml` runs one sequential job that installs Nix + the
Compact compiler and executes the same flake apps you can run locally:

```
nix flake check
npm ci --legacy-peer-deps
nix run .#compact
nix run .#typecheck
nix run .#build
nix run .#cypress
```

Image build/publish and chart deploy are handled by the Concourse pipeline in
`ci/` (`fly`, `ytt`, and `ci/repipe` are all in the Nix dev shell).

---

## Troubleshooting

**`VITE_NETWORK_ID is required to start the web app`** — set it in `.env`
(`preview`/`preprod`/`mainnet`), or use `just dev` which sets it for you.

**Proof errors / "bad input" from the proof-server** — ensure the Docker
proof-server is up (`docker compose up proof-server`, port `6300`) and that ZK
artifacts are synced. `just dev` re-runs the sync; otherwise run
`npm --workspace ui run sync-zk-config`. Stale `ui/public/{keys,zkir}` are a
common cause — `just clean` and rebuild.

**Lace not detected** — install the Lace extension with Midnight support,
unlock it, reload the page, and confirm the wallet network matches
`VITE_NETWORK_ID` (default `preview`).

**`overmind is already running` / stale `.overmind.sock`** — run `just down`,
then `just dev` again.

**Compact compile fails outside Nix** — the compiler is provided by the Nix
dev shell (no `compact update` needed there). Run inside `nix develop` or via
`nix run .#compact`.

**`direnv: error .envrc is blocked`** — run `direnv allow` in the repo root.

**Markets don't appear across browsers** — set a shared
`VITE_MARKET_FACTORY_ADDRESS` (runtime config) so all clients read the same
on-chain registry; local-only `cocoa.knownMarkets` is per-browser.

For the system design behind all of this, see [Architecture.md](Architecture.md).
