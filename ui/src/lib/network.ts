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
  /** Local proof server URL — `just dev` brings this up at this address. */
  readonly proofServerUri: string;
  /**
   * Where the contract's verifier keys, prover keys, and ZK IR live.
   * Must be an absolute URL — FetchZkConfigProvider does `new URL(...)`
   * on it at construction time. Defaults to `${origin}/zk-config`.
   */
  readonly zkConfigBaseUri: string;
  /** Optional canonical market factory/registry contract address. */
  readonly marketFactoryAddress?: string;
};

const fromEnv = (key: string, fallback: string): string =>
  (import.meta.env?.[key] as string | undefined) ?? fallback;

const appOrigin = (): string =>
  typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;

export const cocoaConfig: CocoaConfig = {
  // Midnight's networkId enum values in 4.x: "undeployed" | "mainnet"
  // | "preview" | "preprod". Default to `preprod` since that's where the
  // current TestNet wallet tooling targets preprod for this dapp.
  networkId: fromEnv("VITE_NETWORK_ID", "preprod"),
  indexerUri: fromEnv(
    "VITE_INDEXER_URI",
    "https://indexer.preprod.midnight.network/api/v4/graphql",
  ),
  indexerWsUri: fromEnv(
    "VITE_INDEXER_WS_URI",
    "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  ),
  // Same-origin Vite proxy to the local proof server started by `just dev`.
  // This avoids browser CORS failures and keeps proving on the same LAN
  // origin used to load the app.
  proofServerUri: fromEnv(
    "VITE_PROOF_SERVER_URI",
    `${appOrigin()}/proof-server`,
  ),
  // FetchZkConfigProvider serves keys at `${baseURL}/keys/{circuit}.prover`
  // and zkir at `${baseURL}/zkir/{circuit}.bzkir`. We symlink the
  // contract's managed/ output into ui/public/{keys,zkir} so vite serves
  // them at the web origin's root.
  zkConfigBaseUri: fromEnv(
    "VITE_ZK_CONFIG_URI",
    appOrigin(),
  ),
  marketFactoryAddress:
    (import.meta.env?.VITE_MARKET_FACTORY_ADDRESS as string | undefined) ||
    undefined,
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
