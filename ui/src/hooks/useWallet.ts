import { useCallback, useEffect, useState } from "react";

import { cocoaConfig } from "../lib/network";
import {
  type LaceConnection,
  connectLace,
  isLaceReachable,
} from "../lib/wallet";

export type WalletStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "connecting" }
  | { kind: "connected"; connection: LaceConnection }
  | { kind: "error"; error: Error };

export type UseWallet = {
  readonly status: WalletStatus;
  readonly connection: LaceConnection | null;
  connect(): Promise<void>;
  disconnect(): void;
};

/**
 * Manages Lace 4.x InitialAPI connection state. On mount, only checks
 * reachability — Lace's 4.x model doesn't have a passive
 * `isAuthorized()` check, so the user explicitly clicks the connect
 * button to call `connect(networkId)`.
 */
export const useWallet = (): UseWallet => {
  const [status, setStatus] = useState<WalletStatus>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "checking" });
    void isLaceReachable(2_000)
      .then(() => {
        if (!cancelled) setStatus({ kind: "idle" });
      })
      .catch((err) => {
        if (!cancelled)
          setStatus({
            kind: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setStatus({ kind: "connecting" });
    try {
      const connection = await connectLace(cocoaConfig.networkId);
      setStatus({ kind: "connected", connection });
    } catch (err) {
      setStatus({
        kind: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  const disconnect = useCallback((): void => {
    // Lace doesn't expose a programmatic disconnect; the dapp simply
    // forgets the connection. Reconnecting won't show a permission
    // prompt while the user has the dapp authorized in Lace.
    setStatus({ kind: "idle" });
  }, []);

  return {
    status,
    connection: status.kind === "connected" ? status.connection : null,
    connect,
    disconnect,
  };
};
