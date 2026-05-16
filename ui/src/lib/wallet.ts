import type {
  Configuration,
  ConnectedAPI,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";

export type LaceConnection = {
  /**
   * Connected API handle returned by Lace's `InitialAPI.connect()`. Used by
   * the wallet/midnight providers to balance + submit transactions.
   */
  readonly connected: ConnectedAPI;
  /** Bech32m shielded address. */
  readonly shieldedAddress: string;
  /** Bech32m shielded coin public key. */
  readonly coinPublicKey: string;
  /** Bech32m shielded encryption public key. */
  readonly encryptionPublicKey: string;
  /** Wallet-recommended indexer / proof server / node URIs. */
  readonly configuration: Configuration;
  readonly walletName: string;
  readonly walletApiVersion: string;
};

export class LaceNotInstalledError extends Error {
  constructor() {
    super(
      "Lace wallet was not detected. Install the Lace browser extension and refresh the page.",
    );
  }
}

const looksLikeInitialApi = (
  candidate: unknown,
): candidate is InitialAPI => {
  if (!candidate || typeof candidate !== "object") return false;
  const c = candidate as Record<string, unknown>;
  return (
    typeof c.connect === "function" &&
    typeof c.apiVersion === "string" &&
    typeof c.rdns === "string" &&
    typeof c.name === "string"
  );
};

const findInitialApi = (
  midnight: Record<string, unknown> | undefined,
): InitialAPI | undefined => {
  if (!midnight) return undefined;
  // Lace registers under a UUID key on `window.midnight`. Walk the values
  // and return the first one that looks like an InitialAPI.
  for (const value of Object.values(midnight)) {
    if (looksLikeInitialApi(value)) return value;
  }
  return undefined;
};

const describeMidnight = (
  midnight: Record<string, unknown> | undefined,
): string => {
  if (!midnight) return "<no window.midnight>";
  return Object.entries(midnight)
    .map(([key, value]) => {
      if (!value || typeof value !== "object") return `${key}=${typeof value}`;
      const inner = Object.keys(value as Record<string, unknown>);
      return `${key}={${inner.join(",")}}`;
    })
    .join(" | ");
};

const waitForInitialApi = async (
  timeoutMs: number,
): Promise<InitialAPI> => {
  const start = Date.now();
  let lastSnapshot: string | null = null;
  while (Date.now() - start < timeoutMs) {
    const midnight =
      typeof window === "undefined"
        ? undefined
        : (window.midnight as Record<string, unknown> | undefined);
    const api = findInitialApi(midnight);
    if (api) return api;
    const snapshot = describeMidnight(midnight);
    if (snapshot !== lastSnapshot) {
      // eslint-disable-next-line no-console
      console.debug(`[cocoa] waiting for Lace; window.midnight: ${snapshot}`);
      lastSnapshot = snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new LaceNotInstalledError();
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const shieldedAddressIsSyncing = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.toLowerCase().includes("syncing") ||
    message.toLowerCase().includes("shielded address not yet available")
  );
};

const getShieldedAddressesWhenReady = async (
  connected: ConnectedAPI,
  timeoutMs: number,
): ReturnType<ConnectedAPI["getShieldedAddresses"]> => {
  const start = Date.now();
  let lastError: unknown = null;
  let loggedSyncWait = false;

  while (Date.now() - start < timeoutMs) {
    try {
      return await connected.getShieldedAddresses();
    } catch (err) {
      lastError = err;
      if (!shieldedAddressIsSyncing(err)) throw err;
      if (!loggedSyncWait) {
        // eslint-disable-next-line no-console
        console.debug("[cocoa] wallet connected; waiting for shielded sync");
        loggedSyncWait = true;
      }
      await sleep(1_000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

/**
 * Connect to Lace via the 4.x InitialAPI: discover the connector under a
 * UUID-keyed entry on `window.midnight`, request a connection for the
 * given network, then resolve the wallet's shielded address + service
 * configuration so the providers can be wired up.
 */
export const connectLace = async (
  networkId: string,
  timeoutMs = 10_000,
): Promise<LaceConnection> => {
  const initial = await waitForInitialApi(timeoutMs);
  // eslint-disable-next-line no-console
  console.debug(`[cocoa] InitialAPI found:`, {
    name: initial.name,
    apiVersion: initial.apiVersion,
    rdns: initial.rdns,
  });
  const connected = await initial.connect(networkId);
  // eslint-disable-next-line no-console
  console.debug(
    `[cocoa] connect("${networkId}") succeeded; ConnectedAPI keys:`,
    Object.keys(connected as unknown as Record<string, unknown>),
  );
  const [addresses, configuration] = await Promise.all([
    getShieldedAddressesWhenReady(connected, 10 * 60_000),
    connected.getConfiguration(),
  ]);
  // eslint-disable-next-line no-console
  console.debug("[cocoa] wallet state retrieved", {
    addresses,
    configuration,
  });
  return {
    connected,
    shieldedAddress: addresses.shieldedAddress,
    coinPublicKey: addresses.shieldedCoinPublicKey,
    encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
    configuration,
    walletName: initial.name,
    walletApiVersion: initial.apiVersion,
  };
};

/**
 * Returns true if the wallet is reachable on this device. We can't check
 * "did the user pre-authorize this dapp" the way the 3.x `isEnabled()`
 * call did — Lace's 4.x model surfaces that via `getConnectionStatus()`
 * on the already-connected API. Calling `connect()` is now the way to
 * both check and acquire authorization.
 */
export const isLaceReachable = async (
  timeoutMs = 1_000,
): Promise<boolean> => {
  try {
    await waitForInitialApi(timeoutMs);
    return true;
  } catch {
    return false;
  }
};
