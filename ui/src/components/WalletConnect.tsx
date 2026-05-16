import type { LaceConnection } from "../lib/wallet";
import { truncateAddress } from "../lib/format";
import { formatNightBalance, formatDustBalance } from "../lib/format";
import { nativeToken } from "@midnight-ntwrk/ledger-v8";
import type { WalletBalances } from "../hooks/useWalletBalances";

type Props = {
  status:
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "connecting" }
    | { kind: "connected"; connection: LaceConnection }
    | { kind: "error"; error: Error };
  balances: WalletBalances | null;
  isLoadingBalances: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefreshBalances?: () => void;
};

export const WalletConnect = ({
  status,
  balances,
  isLoadingBalances,
  onConnect,
  onDisconnect,
  onRefreshBalances,
}: Props) => {
  if (status.kind === "connected") {
    const nativeTokenRaw = nativeToken().raw;

    console.log("[WalletConnect] Native token raw:", nativeTokenRaw);
    console.log("[WalletConnect] Balances:", balances);

    if (balances) {
      console.log("[WalletConnect] All shielded balance keys:", Object.keys(balances.shieldedBalances));
      console.log("[WalletConnect] All unshielded balance keys:", Object.keys(balances.unshieldedBalances));
      
      // Log all balances with their keys
      Object.entries(balances.shieldedBalances).forEach(([key, value]) => {
        console.log(`[WalletConnect] Shielded[${key}] = ${value}`);
      });
      Object.entries(balances.unshieldedBalances).forEach(([key, value]) => {
        console.log(`[WalletConnect] Unshielded[${key}] = ${value}`);
      });
    }

    // Calculate total tNight from shielded + unshielded
    // Try to get balance using nativeToken().raw first
    let shieldedNight = balances?.shieldedBalances[nativeTokenRaw] ?? 0n;
    let unshieldedNight = balances?.unshieldedBalances[nativeTokenRaw] ?? 0n;

    // If not found, try to sum all balances (fallback)
    if (balances && shieldedNight === 0n && unshieldedNight === 0n) {
      console.log("[WalletConnect] Native token key not found, summing all balances");
      shieldedNight = Object.values(balances.shieldedBalances).reduce((sum, val) => sum + val, 0n);
      unshieldedNight = Object.values(balances.unshieldedBalances).reduce((sum, val) => sum + val, 0n);
    }

    const totalNight = shieldedNight + unshieldedNight;
    const dust = balances?.dustBalance ?? 0n;

    console.log("[WalletConnect] Shielded tNight:", shieldedNight);
    console.log("[WalletConnect] Unshielded tNight:", unshieldedNight);
    console.log("[WalletConnect] Total tNight:", totalNight);
    console.log("[WalletConnect] DUST:", dust);

    return (
      <div className="wallet wallet--connected" data-testid="wallet-connected">
        <div className="wallet__info">
          <span
            className="wallet__address"
            title={status.connection.shieldedAddress}
          >
            {truncateAddress(status.connection.shieldedAddress)}
          </span>

          {balances && !isLoadingBalances && (
            <div className="wallet__balances">
              <span className="wallet__balance" title="Total tNight balance">
                {formatNightBalance(totalNight)}
              </span>
              <span className="wallet__balance" title="tDUST balance">
                {formatDustBalance(dust)}
              </span>
            </div>
          )}

          {isLoadingBalances && (
            <span className="wallet__loading">Loading balances…</span>
          )}
        </div>

        <div className="wallet__actions">
          {onRefreshBalances && (
            <button
              type="button"
              onClick={onRefreshBalances}
              className="btn btn--ghost btn--sm"
              title="Refresh balances"
              disabled={isLoadingBalances}
            >
              ↻
            </button>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            className="btn btn--ghost"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  const busy = status.kind === "checking" || status.kind === "connecting";
  return (
    <div className="wallet" data-testid="wallet-disconnected">
      <button
        type="button"
        onClick={onConnect}
        disabled={busy}
        className="btn btn--primary"
        data-testid="wallet-connect-button"
      >
        {busy ? "Connecting…" : "Connect Lace"}
      </button>
      {status.kind === "error" && (
        <span className="wallet__error" role="alert">
          {status.error.message}
        </span>
      )}
    </div>
  );
};
