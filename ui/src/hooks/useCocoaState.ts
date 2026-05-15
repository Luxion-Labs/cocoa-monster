import type { CocoaApi, CocoaState } from "cocoa-contract";
import { useEffect, useState } from "react";

export type CocoaPriceTick = {
  readonly t: number;
  readonly priceYes: number;
};

const PRICE_HISTORY_LIMIT = 200;

export type UseCocoaStateResult = {
  readonly state: CocoaState | null;
  readonly priceHistory: readonly CocoaPriceTick[];
  readonly error: Error | null;
};

/**
 * Subscribe to a market's live state via the indexer's websocket stream.
 * Builds a sliding-window price history that powers the price chart.
 */
export const useCocoaState = (api: CocoaApi | null): UseCocoaStateResult => {
  const [state, setState] = useState<CocoaState | null>(null);
  const [priceHistory, setPriceHistory] = useState<CocoaPriceTick[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!api) {
      setState(null);
      setPriceHistory([]);
      setError(null);
      return;
    }
    setError(null);
    const sub = api.state$.subscribe({
      next: (next) => {
        setState(next);
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
      },
    });
    return () => sub.unsubscribe();
  }, [api]);

  return { state, priceHistory, error };
};
