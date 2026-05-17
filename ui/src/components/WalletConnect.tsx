import type { LaceConnection } from "../lib/wallet";
import { truncateAddress } from "../lib/format";

type Props = {
  status:
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "connecting" }
    | { kind: "connected"; connection: LaceConnection }
    | { kind: "error"; error: Error };
  onConnect: () => void;
  onDisconnect: () => void;
};

export const WalletConnect = ({
  status,
  onConnect,
  onDisconnect,
}: Props) => {
  if (status.kind === "connected") {
    return (
      <div className="wallet wallet--connected" data-testid="wallet-connected">
        <div className="wallet__badge">
          <span className="wallet__pulse-dot" title="Live synchronized" />
          <svg
            className="wallet__shield-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span
            className="wallet__address"
            title={status.connection.shieldedAddress}
          >
            {truncateAddress(status.connection.shieldedAddress, 6, 6)}
          </span>
        </div>

        <button
          type="button"
          onClick={onDisconnect}
          className="wallet__disconnect-btn"
          title="Disconnect Wallet"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
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
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {status.kind === "error" && (
        <span className="wallet__error" role="alert">
          {status.error.message}
        </span>
      )}
    </div>
  );
};
