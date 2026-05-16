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

export const WalletConnect = ({ status, onConnect, onDisconnect }: Props) => {
  if (status.kind === "connected") {
    return (
      <div className="wallet wallet--connected" data-testid="wallet-connected">
        <span
          className="wallet__address"
          title={status.connection.shieldedAddress}
        >
          {truncateAddress(status.connection.shieldedAddress)}
        </span>
        <button type="button" onClick={onDisconnect} className="btn btn--ghost">
          Disconnect
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
