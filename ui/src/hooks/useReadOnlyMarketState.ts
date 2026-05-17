import type { CocoaState } from "cocoa-contract";
import { decodeCocoaState, ledger as readLedger } from "cocoa-contract";
import { useEffect, useState } from "react";
import { map } from "rxjs/operators";

import { buildReadOnlyProviders } from "../lib/providers";
import type { CocoaPriceTick } from "./useCocoaState";

const PRICE_HISTORY_LIMIT = 200;

export type UseReadOnlyMarketStateResult = {
  readonly state: CocoaState | null;
  readonly priceHistory: readonly CocoaPriceTick[];
  readonly error: Error | null;
  readonly isLoading: boolean;
};

/**
 * Subscribe to a market's live state via the indexer's websocket stream
 * WITHOUT requiring a wallet connection. This allows users to view market
 * details before connecting their wallet.
 */
export const useReadOnlyMarketState = (
  contractAddress: string | null,
): UseReadOnlyMarketStateResult => {
  const [state, setState] = useState<CocoaState | null>(null);
  const [priceHistory, setPriceHistory] = useState<CocoaPriceTick[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!contractAddress) {
      setState(null);
      setPriceHistory([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const localKey = `cocoa_price_history_${contractAddress}`;

    // Load initial price history from localStorage if available
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPriceHistory(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load price history from localStorage", e);
    }

    try {
      const providers = buildReadOnlyProviders();
      
      const sub = providers.publicDataProvider!
        .contractStateObservable(contractAddress as never, { type: "latest" })
        .pipe(map((cs) => decodeCocoaState(readLedger(cs.data))))
        .subscribe({
          next: (next) => {
            setState(next);
            setIsLoading(false);
            
            setPriceHistory((prev) => {
              const tick: CocoaPriceTick = { t: Date.now(), priceYes: next.priceYes };
              let merged = prev;
              const last = prev[prev.length - 1];

              if (!last) {
                merged = [tick];
              } else if (last.priceYes !== tick.priceYes) {
                // Price updated on chain! Record it as a new data point
                merged = [...prev, tick];
              } else {
                // Price is identical. Update the timestamp of the last tick to reflect active duration
                merged = [...prev.slice(0, -1), { ...last, t: tick.t }];
              }

              const limited = merged.length > PRICE_HISTORY_LIMIT
                ? merged.slice(merged.length - PRICE_HISTORY_LIMIT)
                : merged;

              try {
                localStorage.setItem(localKey, JSON.stringify(limited));
              } catch (e) {
                console.error("Failed to save price history to localStorage", e);
              }
              return limited;
            });
          },
          error: (err) => {
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
          },
        });

      return () => sub.unsubscribe();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
  }, [contractAddress]);

  return { state, priceHistory, error, isLoading };
};
