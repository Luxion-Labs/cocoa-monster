# cocoa.monster

A privacy-first prediction market built on **Midnight**.

Bet on real-world events — elections, crypto prices, sports — on **Midnight**. Individual positions, amounts, and identities stay private through zero-knowledge proofs, while market prices and resolutions remain publicly verifiable.

- **Pricing.** Each market is a constant-product market maker (CPMM): `reserveYes * reserveNo = k`. Buying YES burns YES reserve and grows NO reserve in proportion to the stake units entered; price floats accordingly, and a live chart can be derived from on-chain reserve deltas.
- **Privacy.** Positions are committed on-chain as `H(secret, nonce, side, amount)`. Identity, side, and size are hidden; redemption reveals only a one-shot nullifier.
- **Resolution.** The deployer is the trusted oracle. After `closeTime`, the oracle can resolve the market and winning positions can be marked claimed once.

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

Prerequisites: [Nix](https://nixos.org/download) with flakes, [direnv](https://direnv.net/), Docker, and a Midnight-compatible browser wallet for testnet.

```sh
direnv allow             # loads flake + .env
just dev                 # install deps, compile Compact, boot proof server + UI
```

The UI is served at `http://localhost:5173`.

## License

Apache-2.0 — see [LICENSE](LICENSE).
