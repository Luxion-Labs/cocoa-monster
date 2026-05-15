import {
  NetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";

export type CocoaConfig = {
  /** The Midnight network the dapp targets — TestNet by default. */
  readonly networkId: NetworkId;
  /**
   * Indexer GraphQL endpoint (HTTP). Most users get this from Lace's
   * `serviceUriConfig()`, but this default is useful for local dev.
   */
  readonly indexerUri: string;
  /** Indexer GraphQL endpoint (WebSocket) for live state subscriptions. */
  readonly indexerWsUri: string;
  /** Local proof server URL — `just up` brings this up at this address. */
  readonly proofServerUri: string;
  /**
   * Where the contract's verifier keys, prover keys, and ZK IR live. The
   * UI bundles them under `/zk-config/cocoa/...`.
   */
  readonly zkConfigBaseUri: string;
};

const fromEnv = (key: string, fallback: string): string =>
  (import.meta.env?.[key] as string | undefined) ?? fallback;

export const cocoaConfig: CocoaConfig = {
  networkId: NetworkId.TestNet,
  indexerUri: fromEnv(
    "VITE_INDEXER_URI",
    "https://indexer.testnet-02.midnight.network/api/v1/graphql",
  ),
  indexerWsUri: fromEnv(
    "VITE_INDEXER_WS_URI",
    "wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws",
  ),
  proofServerUri: fromEnv("VITE_PROOF_SERVER_URI", "http://localhost:6300"),
  zkConfigBaseUri: fromEnv("VITE_ZK_CONFIG_URI", "/zk-config"),
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
