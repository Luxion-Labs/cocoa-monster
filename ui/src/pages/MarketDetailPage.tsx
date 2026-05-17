import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Status, type CocoaOptionState } from "cocoa-contract";

import { BetForm } from "../components/BetForm";
import { ClaimPanel } from "../components/ClaimPanel";
import { MarketDetailPageSkeleton } from "../components/Skeleton";
import { AreaChart } from "../components/AreaChart";
import { OptionLineChart } from "../components/OptionLineChart";
import { XAxis, YAxis, CartesianGrid } from "@subframe/core";
import { useCocoaApi } from "../hooks/useCocoaApi";
import { useCocoaState } from "../hooks/useCocoaState";
import { useReadOnlyMarketState } from "../hooks/useReadOnlyMarketState";
import { useWallet } from "../hooks/useWallet";
import {
  formatBigInt,
  formatPriceYes,
  formatSide,
  formatStatus,
  formatUnixSeconds,
  truncateAddress,
} from "../lib/format";
import { rememberMarket } from "../lib/markets";
import { buildCocoaProviders } from "../lib/providers";

const resolutionStatusFor = (option: CocoaOptionState): string => {
  if (option.status === Status.RESOLVED && option.outcome !== null) {
    return `Final ${formatSide(option.outcome)}`;
  }
  if (option.proposedOutcome !== null) {
    return `Proposed ${formatSide(option.proposedOutcome)}`;
  }
  return formatStatus(option.status);
};

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const MarketDetailPage = () => {
  const { address } = useParams<{ address: string }>();
  const wallet = useWallet();
  const [currentTime, setCurrentTime] = useState(nowSeconds);

  const providers = useMemo(
    () => (wallet.connection ? buildCocoaProviders(wallet.connection) : null),
    [wallet.connection],
  );
  const apiState = useCocoaApi(providers, address ?? null);
  const api = apiState.kind === "ready" ? apiState.api : null;
  const [selectedOptionId, setSelectedOptionId] = useState<bigint>(0n);

  // Use connected API state if available, otherwise use read-only state
  const connectedState = useCocoaState(api, address ?? null);
  const readOnlyState = useReadOnlyMarketState(wallet.connection ? null : address ?? null);

  const { state, priceHistory, error: streamError } = wallet.connection
    ? connectedState
    : readOnlyState;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(nowSeconds());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeOption = useMemo(() => {
    if (!state) return null;
    return (
      state.options.find((option) => option.optionId === selectedOptionId) ??
      state.options[0] ??
      null
    );
  }, [state, selectedOptionId]);

  const bettingClosedByDeadline = state
    ? currentTime >= state.closeTime
    : false;
  const bettingClosedReason =
    state && state.status === Status.OPEN && bettingClosedByDeadline
      ? `Betting closed at ${formatUnixSeconds(state.closeTime)}.`
      : undefined;

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
    if (priceHistory.length === 0 || !activeOption) return [];
    const activeOptionKey = activeOption.optionId.toString();

    const mapped = priceHistory.map((tick) => {
      const activePrice =
        tick.optionPrices?.[activeOptionKey] ??
        (activeOption.optionId === 0n ? tick.priceYes : activeOption.priceYes);
      const yesPrice = activePrice * 100;
      const noPrice = (1 - activePrice) * 100;
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
  }, [priceHistory, activeOption]);

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
            {state.options.length > 1 && (
              <div className="market-detail__options-wrap">
                <div className="market-detail__section-label">Option markets</div>
                <div className="market-detail__options" data-testid="market-detail-options">
                  {state.options.map((option) => (
                    <button
                      key={option.optionId.toString()}
                      type="button"
                      className={`market-detail__option ${
                        activeOption?.optionId === option.optionId ? "market-detail__option--active" : ""
                      }`}
                      onClick={() => setSelectedOptionId(option.optionId)}
                    >
                      <span className="market-detail__option-name">{option.label}</span>
                      <span className="market-detail__option-prices">
                        <span>YES {formatPriceYes(option.priceYes)}</span>
                        <span>NO {formatPriceYes(1 - option.priceYes)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="price-chart" data-testid="price-chart">
              <div className="price-chart__header">
                <span className="price-chart__title">
                  {state.options.length > 1
                    ? "Option price history"
                    : activeOption
                      ? `${activeOption.label} price history`
                      : "Price History"}
                </span>
                {activeOption && (
                  <span className="price-chart__value" data-testid="price-chart-current" style={{ display: "none" }}>
                    {formatPriceYes(activeOption.priceYes)}
                  </span>
                )}
              </div>
              {state.options.length > 1 ? (
                <OptionLineChart
                  options={state.options}
                  priceHistory={priceHistory}
                />
              ) : chartData.length === 0 ? (
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
                <dt>YES price</dt>
                <dd data-testid="market-detail-price-yes">
                  {activeOption ? formatPriceYes(activeOption.priceYes) : formatPriceYes(state.priceYes)}
                </dd>
              </div>
              <div>
                <dt>YES reserve</dt>
                <dd>{formatBigInt(activeOption?.reserveYes ?? state.reserveYes)}</dd>
              </div>
              <div>
                <dt>NO reserve</dt>
                <dd>{formatBigInt(activeOption?.reserveNo ?? state.reserveNo)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd data-testid="market-detail-status">
                  {formatStatus(activeOption?.status ?? state.status)}
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
            <section className="market-detail__resolution" data-testid="market-detail-resolution">
              <div className="market-detail__section-label">Resolution</div>
              {state.resolutionSource && (
                <div className="market-detail__resolution-source">
                  <span>Source</span>
                  <strong>{state.resolutionSource}</strong>
                </div>
              )}
              {state.resolutionRules && (
                <p className="market-detail__resolution-rules">
                  {state.resolutionRules}
                </p>
              )}
              <ul className="market-detail__resolution-options">
                {state.options.map((option) => (
                  <li key={option.optionId.toString()}>
                    <div>
                      <strong>{option.label}</strong>
                      {option.proposedOutcome !== null &&
                        option.proposalDeadline > 0n &&
                        option.status !== Status.RESOLVED && (
                          <span>
                            Dispute until {formatUnixSeconds(option.proposalDeadline)}
                          </span>
                        )}
                    </div>
                    <span
                      className={`market-detail__resolution-badge market-detail__resolution-badge--${option.status === Status.RESOLVED ? "resolved" : option.proposedOutcome !== null ? "proposed" : "pending"}`}
                    >
                      {resolutionStatusFor(option)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <aside className="market-detail__side">
            {!wallet.connection && state?.status === Status.OPEN && (
              <div className="market-detail__connect-prompt">
                <p>
                  {bettingClosedReason ??
                    "Connect wallet from the top bar to place bets."}
                </p>
              </div>
            )}
            {api && state.status === Status.OPEN && activeOption && (
              <BetForm
                api={api}
                option={activeOption}
                disabledReason={bettingClosedReason}
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
