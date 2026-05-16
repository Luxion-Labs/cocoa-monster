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
              const merged = [...prev, tick];
              return merged.length > PRICE_HISTORY_LIMIT
                ? merged.slice(merged.length - PRICE_HISTORY_LIMIT)
                : merged;
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
