import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Status } from "cocoa-contract";

import { OptimisticOraclePanel } from "../components/OptimisticOraclePanel";
import { useCocoaApi } from "../hooks/useCocoaApi";
import { useCocoaState } from "../hooks/useCocoaState";
import { useWallet } from "../hooks/useWallet";
import { formatStatus, formatUnixSeconds, truncateAddress } from "../lib/format";
import { buildCocoaProviders } from "../lib/providers";

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const OracleMarketPage = () => {
  const { address } = useParams<{ address: string }>();
  const wallet = useWallet();
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const providers = useMemo(
    () => (wallet.connection ? buildCocoaProviders(wallet.connection) : null),
    [wallet.connection],
  );
  const apiState = useCocoaApi(providers, address ?? null);
  const api = apiState.kind === "ready" ? apiState.api : null;
  const { state, error: stateError } = useCocoaState(api);
  const closeReady = state ? nowSeconds() >= state.closeTime : false;

  const closeMarket = async (): Promise<void> => {
    if (!api) return;
    setClosing(true);
    setCloseError(null);
    try {
      await api.close(nowSeconds());
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : String(err));
    } finally {
      setClosing(false);
    }
  };

  return (
    <section className="page factory-admin">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Oracle</p>
          <h2>Market Oracle</h2>
          {address && (
            <code className="market-detail__address">
              {truncateAddress(address, 8, 8)}
            </code>
          )}
        </div>
        {address && (
          <Link to={`/m/${address}`} className="btn btn--ghost">
            Market
          </Link>
        )}
      </header>

      {!wallet.connection ? (
        <div className="empty-state">
          <p>Connect wallet to manage oracle operations for this market.</p>
        </div>
      ) : (
        <div className="factory-admin__panel">
          {apiState.kind === "loading" && (
            <p className="factory-admin__hint">Loading market state...</p>
          )}
          {apiState.kind === "error" && (
            <p className="create-market__error" role="alert">
              Failed to load market: {apiState.error.message}
            </p>
          )}
          {stateError && (
            <p className="create-market__error" role="alert">
              Live state stream error: {stateError.message}
            </p>
          )}
          {state && (
            <div className="oracle-panel">
              <h3>Market lifecycle</h3>
              <p>
                Contract status: <strong>{formatStatus(state.status)}</strong>
              </p>
              <p>
                Betting deadline:{" "}
                <strong>{formatUnixSeconds(state.closeTime)}</strong>
              </p>
              {state.status === Status.OPEN && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void closeMarket()}
                  disabled={!api || !closeReady || closing}
                >
                  {closing
                    ? "Closing..."
                    : closeReady
                      ? "Close market"
                      : "Close after deadline"}
                </button>
              )}
              {closeError && (
                <p className="oracle-panel__error" role="alert">
                  {closeError}
                </p>
              )}
            </div>
          )}
          {address && api && state && (
            <OptimisticOraclePanel
              contractAddress={address}
              state={state}
              api={api}
            />
          )}
        </div>
      )}
    </section>
  );
};
