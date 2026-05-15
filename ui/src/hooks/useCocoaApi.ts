import { type CocoaApi, type CocoaProviders, joinCocoaMarket } from "cocoa-contract";
import { useEffect, useState } from "react";

export type CocoaApiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; api: CocoaApi }
  | { kind: "error"; error: Error };

/**
 * Joins a deployed Cocoa market and resolves to a {@link CocoaApi}. The
 * underlying private state is loaded from LevelDB if available, otherwise
 * a fresh secret/nonce pair is generated.
 */
export const useCocoaApi = (
  providers: CocoaProviders | null,
  contractAddress: string | null,
): CocoaApiState => {
  const [state, setState] = useState<CocoaApiState>({ kind: "idle" });

  useEffect(() => {
    if (!providers || !contractAddress) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const api = await joinCocoaMarket(providers, contractAddress);
        if (!cancelled) setState({ kind: "ready", api });
      } catch (err) {
        if (!cancelled)
          setState({
            kind: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providers, contractAddress]);

  return state;
};
