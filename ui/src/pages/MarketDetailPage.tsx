import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { Status } from "cocoa-contract";

import { BetForm } from "../components/BetForm";
import { ClaimPanel } from "../components/ClaimPanel";
import { MarketDetailPageSkeleton } from "../components/Skeleton";
import { AreaChart } from "../components/AreaChart";
import { XAxis, YAxis, CartesianGrid } from "@subframe/core";
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
  const connectedState = useCocoaState(api, address ?? null);
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

  const chartData = useMemo(() => {
    if (priceHistory.length === 0) return [];

    const mapped = priceHistory.map((tick) => {
      const yesPrice = tick.priceYes * 100;
      const noPrice = (1 - tick.priceYes) * 100;
      return {
        // Unique time index formatted nicely with raw tick timestamp suffix to prevent vertical line rendering issues
        time: new Date(tick.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + `_${tick.t}`,
        YES: yesPrice,
        NO: noPrice,
      };
    });

    if (mapped.length === 1) {
      const first = mapped[0];
      const firstTimeRaw = priceHistory[0].t;
      const prevT = firstTimeRaw - 300000; // 5 minutes earlier
      const prevTick = {
        time: new Date(prevT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + `_${prevT}`,
        YES: first.YES,
        NO: first.NO,
      };
      return [prevTick, first];
    }

    return mapped;
  }, [priceHistory]);

  return (
    <section className="page market-detail">
      <header className="page__header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
            <h2 data-testid="market-detail-question" style={{ margin: 0 }}>
              {state?.question ?? "Loading market…"}
            </h2>
            <span className="shielded-badge" title="Zero-knowledge private market position">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Shielded
            </span>
          </div>
          <code className="market-detail__address">
            {address ? truncateAddress(address, 8, 8) : ""}
          </code>
        </div>
        {address && (
          <Link
            to={`/oracle/${encodeURIComponent(address)}`}
            className="btn btn--secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              height: "38px",
              borderRadius: "6px",
              background: "rgba(228, 242, 34, 0.05)",
              borderColor: "rgba(228, 242, 34, 0.2)",
              color: "#e4f222",
              fontWeight: 510,
              boxShadow: "0 2px 8px rgba(228, 242, 34, 0.05)",
              transition: "all 150ms ease",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Oracle Panel
          </Link>
        )}
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
            <div className="price-chart" data-testid="price-chart">
              <div className="price-chart__header">
                <span className="price-chart__title">Price History</span>
                {state.priceYes !== null && (
                  <span className="price-chart__value" data-testid="price-chart-current" style={{ display: "none" }}>
                    {formatPriceYes(state.priceYes)}
                  </span>
                )}
              </div>
              {chartData.length === 0 ? (
                <div className="price-chart__empty">Waiting for first state update…</div>
              ) : (
                <AreaChart
                  data={chartData}
                  index="time"
                  categories={["YES", "NO"]}
                  colors={["#4d9a5f", "#e05252"]}
                  className="h-40 w-full"
                  xAxis={
                    <XAxis
                      dataKey="time"
                      tickFormatter={(val) => val.split("_")[0]}
                      tick={{ fill: "#647080", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  }
                  yAxis={
                    <YAxis
                      domain={[0, 100]}
                      ticks={[10, 30, 50, 70, 90]}
                      tickFormatter={(val) => `${val}%`}
                      tick={{ fill: "#647080", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  }
                  gridLines={
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(220, 200, 180, 0.05)"
                    />
                  }
                />
              )}
            </div>
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
              <BetForm
                api={api}
                state={state}
                wallet={wallet.connection ?? undefined}
              />
            )}
            {api && (
              <ClaimPanel
                api={api}
                state={state}
                wallet={wallet.connection ?? undefined}
              />
            )}
          </aside>
        </div>
      ) : (
        <div data-testid="market-detail-loading">
          <MarketDetailPageSkeleton />
        </div>
      )}
    </section>
  );
};
