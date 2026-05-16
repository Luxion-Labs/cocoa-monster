import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

const DISCONNECT_SESSION_KEY = "cocoa.wallet.disconnected";

const safeSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const wasDisconnectedThisSession = (): boolean =>
  safeSessionStorage()?.getItem(DISCONNECT_SESSION_KEY) === "1";

const rememberSessionDisconnect = (): void => {
  safeSessionStorage()?.setItem(DISCONNECT_SESSION_KEY, "1");
};

const clearSessionDisconnect = (): void => {
  safeSessionStorage()?.removeItem(DISCONNECT_SESSION_KEY);
};

let autoConnectPromise: Promise<LaceConnection> | null = null;

const autoConnect = (): Promise<LaceConnection> => {
  autoConnectPromise ??= connectLace(cocoaConfig.networkId).finally(() => {
    autoConnectPromise = null;
  });
  return autoConnectPromise;
};

const WalletContext = createContext<UseWallet | null>(null);

const useWalletState = (): UseWallet => {
  const [status, setStatus] = useState<WalletStatus>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    const autoReconnect = !wasDisconnectedThisSession();
    setStatus({ kind: autoReconnect ? "connecting" : "checking" });

    void isLaceReachable(2_000)
      .then(async (reachable) => {
        if (cancelled) return;
        if (!reachable) {
          setStatus({ kind: "idle" });
          return;
        }
        if (!autoReconnect) {
          setStatus({ kind: "idle" });
          return;
        }
        try {
          const connection = await autoConnect();
          if (!cancelled) {
            setStatus({ kind: "connected", connection });
          }
        } catch {
          if (!cancelled) setStatus({ kind: "idle" });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "idle" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setStatus({ kind: "connecting" });
    try {
      clearSessionDisconnect();
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
    // The wallet doesn't expose a programmatic disconnect; the dapp simply
    // forgets the connection. Reconnecting won't show a permission
    // prompt while the user has the dapp authorized.
    rememberSessionDisconnect();
    setStatus({ kind: "idle" });
  }, []);

  return useMemo(
    () => ({
      status,
      connection: status.kind === "connected" ? status.connection : null,
      connect,
      disconnect,
    }),
    [connect, disconnect, status],
  );
};

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const wallet = useWalletState();
  return createElement(WalletContext.Provider, { value: wallet }, children);
};

export const useWallet = (): UseWallet => {
  const wallet = useContext(WalletContext);
  if (!wallet) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return wallet;
};
