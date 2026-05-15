# cocoa.monster

A privacy-first prediction market built on **Midnight**.

Bet on real-world events — elections, crypto prices, sports — using **$NIGHT**. Individual positions, amounts, and identities stay private through zero-knowledge proofs, while market prices and resolutions remain publicly verifiable.

- **Pricing.** Each market is a constant-product market maker (CPMM): `reserveYes * reserveNo = k`. Buying YES burns YES reserve and grows NO reserve in proportion to the collateral deposited; price floats accordingly, and a live chart can be derived from on-chain pool deltas.
- **Privacy.** Positions are committed on-chain as `H(secret, nonce, side, amount)`. Identity, side, and size are hidden; redemption reveals only a one-shot nullifier.
- **Resolution.** An optimistic oracle: anyone can propose an outcome after `closeTime`; if no dispute lands within `disputeWindow`, the market settles to that outcome and winners can redeem.

Sweet name, sharp odds.

## Layout

```
cocoa-monster/
├── contract/           Compact smart contract + witnesses
├── ui/                 React + Vite client (with Dockerfile)
├── flake.nix           Nix dev shell
├── justfile            Task runner
├── Procfile            Overmind process file
└── docker-compose.yml  Local proof server
```

## Quickstart

Prerequisites: [Nix](https://nixos.org/download) with flakes, [direnv](https://direnv.net/), [Docker](https://www.docker.com/), the [Compact compiler](https://github.com/midnightntwrk/compact/releases), and the [Lace wallet](https://chromewebstore.google.com/detail/lace-beta/hgeekaiplokcnmakghbdfbgnlfheichg) for testnet. Get test tokens from the [Midnight faucet](https://midnight.network/test-faucet/).

```sh
direnv allow             # loads flake + .env
just install             # install workspace deps
just compact             # compile the Compact contract
just up                  # start the local proof server
overmind start           # boot UI + watchers
```

The UI is served at `http://localhost:5173`.

## License

Apache-2.0 — see [LICENSE](LICENSE).
