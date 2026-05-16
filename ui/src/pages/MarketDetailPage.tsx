import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";

import { Status } from "cocoa-contract";

import { BetForm } from "../components/BetForm";
import { ClaimPanel } from "../components/ClaimPanel";
import { PriceChart } from "../components/PriceChart";
import { ResolvePanel } from "../components/ResolvePanel";
import { useCocoaApi } from "../hooks/useCocoaApi";
import { useCocoaState } from "../hooks/useCocoaState";
import { useReadOnlyMarketState } from "../hooks/useReadOnlyMarketState";
import { useWallet } from "../hooks/useWallet";
import { formatBigInt, formatPriceYes, formatStatus, truncateAddress } from "../lib/format";
import { rememberMarket } from "../lib/markets";
import { buildCocoaProviders } from "../lib/providers";

export const MarketDetailPage = () => {
  const { address } = useParams<{ address: string }>();
  const wallet = useWallet();

  const providers = useMemo(
    () => (wallet.connection ? buildCocoaProviders(wallet.connection) : null),
    [wallet.connection],
  );
  const apiState = useCocoaApi(providers, address ?? null);
  const api = apiState.kind === "ready" ? apiState.api : null;
  
  // Use connected API state if available, otherwise use read-only state
  const connectedState = useCocoaState(api);
  const readOnlyState = useReadOnlyMarketState(wallet.connection ? null : address ?? null);
  
  const { state, priceHistory, error: streamError } = wallet.connection 
    ? connectedState 
    : readOnlyState;

  // Once we know the question, persist this market in the local address book
  // so MarketListPage can show it.
  useEffect(() => {
    if (state && address) {
      rememberMarket({
        contractAddress: address,
        question: state.question,
        addedAt: Date.now(),
      });
    }
  }, [state?.question, address]);

  return (
    <section className="page market-detail">
      <header className="page__header">
        <div>
          <h2 data-testid="market-detail-question">
            {state?.question ?? "Loading market…"}
          </h2>
          <code className="market-detail__address">
            {address ? truncateAddress(address, 8, 8) : ""}
          </code>
        </div>
      </header>

      {apiState.kind === "error" && (
        <p className="market-detail__error" role="alert" data-testid="market-detail-error">
          Failed to load market: {apiState.error.message}
        </p>
      )}
      {streamError && (
        <p className="market-detail__error" role="alert" data-testid="market-detail-stream-error">
          Live state stream error: {streamError.message}
        </p>
      )}

      {state ? (
        <div className="market-detail__grid">
          <div className="market-detail__main">
            <PriceChart history={priceHistory} />
            <dl className="market-detail__stats">
              <div>
                <dt>YES</dt>
                <dd data-testid="market-detail-price-yes">
                  {formatPriceYes(state.priceYes)}
                </dd>
              </div>
              <div>
                <dt>YES reserve</dt>
                <dd>{formatBigInt(state.reserveYes)}</dd>
              </div>
              <div>
                <dt>NO reserve</dt>
                <dd>{formatBigInt(state.reserveNo)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd data-testid="market-detail-status">
                  {formatStatus(state.status)}
                </dd>
              </div>
              <div>
                <dt>Positions</dt>
                <dd>{formatBigInt(state.positionCount)}</dd>
              </div>
              <div>
                <dt>Redeemed</dt>
                <dd>{formatBigInt(state.nullifierCount)}</dd>
              </div>
            </dl>
          </div>
          <aside className="market-detail__side">
            {!wallet.connection && state?.status === Status.OPEN && (
              <div className="market-detail__connect-prompt">
                <p>Connect wallet from the top bar to place bets.</p>
              </div>
            )}
            {api && state.status === Status.OPEN && (
              <BetForm api={api} state={state} />
            )}
            {api && <ClaimPanel api={api} state={state} />}
            {api && <ResolvePanel api={api} state={state} />}
          </aside>
        </div>
      ) : (
        <p data-testid="market-detail-loading">Connecting to indexer…</p>
      )}
    </section>
  );
};
