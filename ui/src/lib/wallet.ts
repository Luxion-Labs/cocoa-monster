import type {
  DAppConnectorAPI,
  DAppConnectorWalletAPI,
  DAppConnectorWalletState,
  ServiceUriConfig,
} from "@midnight-ntwrk/dapp-connector-api";

const LACE_KEY = "mnLace" as const;

export type LaceConnection = {
  readonly api: DAppConnectorWalletAPI;
  readonly walletState: DAppConnectorWalletState;
  readonly serviceUriConfig: ServiceUriConfig;
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

const findLace = (): DAppConnectorAPI | undefined =>
  typeof window === "undefined" ? undefined : window.midnight?.[LACE_KEY];

/**
 * Wait briefly for the Lace extension to inject `window.midnight.mnLace` —
 * the script can run after page load on slower machines.
 */
const waitForLace = async (timeoutMs: number): Promise<DAppConnectorAPI> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const lace = findLace();
    if (lace) return lace;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new LaceNotInstalledError();
};

/**
 * Request authorization from Lace and return everything the dapp needs to
 * spin up midnight-js providers: the API handle, the user's wallet state
 * (address, coin public key), and the service URIs the wallet recommends.
 */
export const connectLace = async (
  timeoutMs = 5_000,
): Promise<LaceConnection> => {
  const lace = await waitForLace(timeoutMs);
  const api = await lace.enable();
  const [walletState, serviceUriConfig] = await Promise.all([
    api.state(),
    lace.serviceUriConfig(),
  ]);
  return {
    api,
    walletState,
    serviceUriConfig,
    walletName: lace.name,
    walletApiVersion: lace.apiVersion,
  };
};

/** Returns true if the user has previously authorized this origin. */
export const isLaceAuthorized = async (): Promise<boolean> => {
  const lace = findLace();
  if (!lace) return false;
  return lace.isEnabled();
};
