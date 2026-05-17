import type { CocoaApi, CocoaState } from "cocoa-contract";
import { useEffect, useState } from "react";

export type CocoaPriceTick = {
  readonly t: number;
  readonly priceYes: number;
  readonly optionPrices?: Record<string, number>;
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
export const useCocoaState = (
  api: CocoaApi | null,
  contractAddress: string | null,
): UseCocoaStateResult => {
  const [state, setState] = useState<CocoaState | null>(null);
  const [priceHistory, setPriceHistory] = useState<CocoaPriceTick[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!api || !contractAddress) {
      setState(null);
      setPriceHistory([]);
      setError(null);
      return;
    }
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

    const sub = api.state$.subscribe({
      next: (next) => {
        setState(next);
        setPriceHistory((prev) => {
          const optionPrices = Object.fromEntries(
            next.options.map((option) => [option.optionId.toString(), option.priceYes]),
          );
          const tick: CocoaPriceTick = { t: Date.now(), priceYes: next.priceYes, optionPrices };
          let merged = prev;
          const last = prev[prev.length - 1];

          if (!last) {
            merged = [tick];
          } else if (JSON.stringify(last.optionPrices) !== JSON.stringify(tick.optionPrices)) {
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
      },
    });

    return () => sub.unsubscribe();
  }, [api, contractAddress]);

  return { state, priceHistory, error };
};
