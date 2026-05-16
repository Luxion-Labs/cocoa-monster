import { useEffect, useState } from "react";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

export type WalletBalances = {
  readonly shieldedBalances: Record<string, bigint>;
  readonly unshieldedBalances: Record<string, bigint>;
  readonly dustBalance: bigint;
  readonly dustCap: bigint;
};

export type UseWalletBalancesResult = {
  readonly balances: WalletBalances | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  refresh(): Promise<void>;
};

/**
 * Monitor wallet balances (tNight and tDUST) via Lace ConnectedAPI.
 * Polls balances every 10 seconds and provides a manual refresh function.
 * 
 * Based on Midnight DApp Connector API:
 * - Uses ConnectedAPI.getShieldedBalances()
 * - Uses ConnectedAPI.getUnshieldedBalances()
 * - Uses ConnectedAPI.getDustBalance()
 */
export const useWalletBalances = (
  connectedApi: ConnectedAPI | null,
  pollIntervalMs = 10_000,
): UseWalletBalancesResult => {
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalances = async (api: ConnectedAPI): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log("[useWalletBalances] Fetching balances...");

      const [shieldedBalances, unshieldedBalances, dustResult] =
        await Promise.all([
          api.getShieldedBalances(),
          api.getUnshieldedBalances(),
          api.getDustBalance(),
        ]);

      console.log("[useWalletBalances] Shielded balances:", shieldedBalances);
      console.log("[useWalletBalances] Unshielded balances:", unshieldedBalances);
      console.log("[useWalletBalances] DUST balance:", dustResult);

      // Log all token types found
      console.log("[useWalletBalances] Shielded token types:", Object.keys(shieldedBalances));
      console.log("[useWalletBalances] Unshielded token types:", Object.keys(unshieldedBalances));

      setBalances({
        shieldedBalances,
        unshieldedBalances,
        dustBalance: dustResult.balance,
        dustCap: dustResult.cap,
      });
    } catch (err) {
      console.error("[useWalletBalances] Error fetching balances:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async (): Promise<void> => {
    if (connectedApi) {
      await fetchBalances(connectedApi);
    }
  };

  useEffect(() => {
    if (!connectedApi) {
      setBalances(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    console.log("[useWalletBalances] Wallet connected, starting balance monitoring");

    // Initial fetch
    void fetchBalances(connectedApi);

    // Poll for updates
    const intervalId = setInterval(() => {
      console.log("[useWalletBalances] Polling for balance updates...");
      void fetchBalances(connectedApi);
    }, pollIntervalMs);

    return () => {
      console.log("[useWalletBalances] Stopping balance monitoring");
      clearInterval(intervalId);
    };
  }, [connectedApi, pollIntervalMs]);

  return { balances, isLoading, error, refresh };
};
