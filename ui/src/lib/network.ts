import {
  setNetworkId,
  type NetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";

import midnightNetworks from "../../../midnight-networks.json";
import { getRuntimeConfig } from "./runtime-config";

export type CocoaConfig = {
  /** Midnight network identifier. */
  readonly networkId: NetworkId;
  /** Indexer GraphQL HTTP endpoint. */
  readonly indexerUri: string;
  /** Indexer GraphQL WebSocket endpoint for live state subscriptions. */
  readonly indexerWsUri: string;
  /** Proof server URL. Local dev defaults to Vite's same-origin proxy. */
  readonly proofServerUri: string;
  /**
   * Where the contract's verifier keys, prover keys, and ZK IR live.
   * Must be an absolute URL — FetchZkConfigProvider does `new URL(...)`
   * on it at construction time. Defaults to `${origin}/zk-config`.
   */
  readonly zkConfigBaseUri: string;
};

const appOrigin = (): string =>
  typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;

type ConfiguredNetworkId = keyof typeof midnightNetworks;

const configuredNetworkIds = Object.keys(midnightNetworks) as ConfiguredNetworkId[];

const isConfiguredNetworkId = (value: string): value is ConfiguredNetworkId =>
  Object.hasOwn(midnightNetworks, value);

const configuredNetworkId = (): ConfiguredNetworkId => {
  const value =
    getRuntimeConfig().VITE_NETWORK_ID ??
    (import.meta.env.DEV ? import.meta.env.VITE_NETWORK_ID : undefined);
  if (!value) {
    throw new Error(
      `VITE_NETWORK_ID is required. Expected one of: ${configuredNetworkIds.join(", ")}`,
    );
  }
  if (isConfiguredNetworkId(value)) return value;

  throw new Error(
    `Unsupported VITE_NETWORK_ID ${JSON.stringify(value)}. Expected one of: ${configuredNetworkIds.join(", ")}`,
  );
};

const networkId = configuredNetworkId();
const networkDefaults = midnightNetworks[networkId];

export const cocoaConfig: CocoaConfig = {
  networkId: networkId as NetworkId,
  indexerUri: networkDefaults.indexerUri,
  indexerWsUri: networkDefaults.indexerWsUri,
  // Same-origin Vite proxy to the local proof server started by `just dev`.
  // This avoids browser CORS failures and keeps proving on the same LAN
  // origin used to load the app. Production runtime config points at the
  // selected network's public proof server.
  proofServerUri: import.meta.env.DEV
    ? `${appOrigin()}/proof-server`
    : networkDefaults.proofServerUri,
  // FetchZkConfigProvider serves keys at `${baseURL}/keys/{circuit}.prover`
  // and zkir at `${baseURL}/zkir/{circuit}.bzkir`. We symlink the
  // contract's managed/ output into ui/public/{keys,zkir} so vite serves
  // them at the web origin's root.
  zkConfigBaseUri: appOrigin(),
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
