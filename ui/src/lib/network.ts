import {
  setNetworkId,
  type NetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";

export type CocoaConfig = {
  /** Midnight network identifier — TestNet by default. */
  readonly networkId: NetworkId;
  /** Indexer GraphQL HTTP endpoint (overridden by Lace's recommendation). */
  readonly indexerUri: string;
  /** Indexer GraphQL WebSocket endpoint for live state subscriptions. */
  readonly indexerWsUri: string;
  /** Local proof server URL — `just up` brings this up at this address. */
  readonly proofServerUri: string;
  /**
   * Where the contract's verifier keys, prover keys, and ZK IR live.
   * Must be an absolute URL — FetchZkConfigProvider does `new URL(...)`
   * on it at construction time. Defaults to `${origin}/zk-config`.
   */
  readonly zkConfigBaseUri: string;
};

const fromEnv = (key: string, fallback: string): string =>
  (import.meta.env?.[key] as string | undefined) ?? fallback;

export const cocoaConfig: CocoaConfig = {
  // Midnight's networkId enum values in 4.x: "undeployed" | "mainnet"
  // | "preview" | "preprod". Default to `preprod` since that's where the
  // current TestNet faucet is dropping tNIGHT for this dapp.
  networkId: fromEnv("VITE_NETWORK_ID", "preprod"),
  indexerUri: fromEnv(
    "VITE_INDEXER_URI",
    "https://indexer.preprod.midnight.network/api/v4/graphql",
  ),
  indexerWsUri: fromEnv(
    "VITE_INDEXER_WS_URI",
    "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  ),
  // Midnight Foundation's public preprod proof-server. Returns CORS
  // headers for arbitrary browser origins and tracks the ledger-v8
  // wire format (it reports version 8.0.3, matching our ledger-v8
  // dependency). We used to self-host an older `midnightnetwork/
  // proof-server:latest` (stuck at 7.0.0-rc.1, no published 8.x image),
  // but that introduced wire-format skew with ledger-v8. Override with
  // VITE_PROOF_SERVER_URI for local dev against `just up`'s docker
  // proof-server.
  proofServerUri: fromEnv(
    "VITE_PROOF_SERVER_URI",
    "https://proof-server.preprod.midnight.network",
  ),
  // FetchZkConfigProvider serves keys at `${baseURL}/keys/{circuit}.prover`
  // and zkir at `${baseURL}/zkir/{circuit}.bzkir`. We symlink the
  // contract's managed/ output into ui/public/{keys,zkir} so vite serves
  // them at the web origin's root.
  zkConfigBaseUri: fromEnv(
    "VITE_ZK_CONFIG_URI",
    typeof window === "undefined"
      ? "http://localhost:5173"
      : window.location.origin,
  ),
};

let networkConfigured = false;

/**
 * Activate the configured network. Idempotent — safe to call from multiple
 * UI entry points. Must be invoked before using any midnight-js APIs.
 */
export const ensureNetwork = (): void => {
  if (networkConfigured) return;
  setNetworkId(cocoaConfig.networkId);
  networkConfigured = true;
};
