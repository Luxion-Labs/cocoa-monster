import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MarketCard } from "../components/MarketCard";
import { MarketListSkeleton } from "../components/Skeleton";
import { AreaChart } from "../components/AreaChart";
import { XAxis, YAxis, CartesianGrid } from "@subframe/core";
import { formatPriceYes } from "../lib/format";
import {
  listKnownMarkets,
  MARKET_CATEGORIES,
  type KnownMarket,
} from "../lib/markets";
import {
  displayStatusForMarket,
  marketDisplayStatusClassName,
  marketDisplayStatusLabel,
} from "../lib/market-status";
import {
  fetchMarketStates,
  fetchSharedMarkets,
  mergeWithLocalMarkets,
  type DiscoveredMarket,
} from "../lib/discovery";

const categories = ["All", ...MARKET_CATEGORIES] as const;

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

const categoryForQuestion = (question: string): string => {
  const q = question.toLowerCase();
  if (/(bitcoin|btc|ethereum|eth|crypto|token|night|price)/.test(q)) {
    return "Crypto";
  }
  if (/(election|president|senate|congress|minister|party|vote)/.test(q)) {
    return "Politics";
  }
  if (/(nba|nfl|mlb|nhl|world cup|sports|match|game|final)/.test(q)) {
    return "Sports";
  }
  if (/(movie|album|oscar|grammy|box office|stream|artist)/.test(q)) {
    return "Culture";
  }
  if (/(ai|openai|apple|google|tesla|spacex|launch|tech)/.test(q)) {
    return "Tech";
  }
  return "Markets";
};

const categoryForMarket = (market: KnownMarket): string =>
  market.category ?? categoryForQuestion(market.question);

const volumeLabelFor = (market: DiscoveredMarket): string => {
  const seed = [...market.contractAddress].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const estimate = Number(market.positionCount) * 120 + (seed % 900);
  return `$${estimate.toLocaleString()} volume`;
};

const toPlaceholderMarket = (market: KnownMarket): DiscoveredMarket => ({
  ...market,
  priceYes: 0.5,
  optionCount: 1n,
  status: "OPEN",
  positionCount: 0n,
  nullifierCount: 0n,
});

const mergeKnownMarkets = (...groups: KnownMarket[][]): KnownMarket[] => {
  const byAddress = new Map<string, KnownMarket>();
  for (const market of groups.flat()) {
    const existing = byAddress.get(market.contractAddress);
    if (!existing || market.addedAt > existing.addedAt) {
      byAddress.set(market.contractAddress, market);
    }
  }
  return [...byAddress.values()].sort((a, b) => b.addedAt - a.addedAt);
};

export const MarketListPage = () => {
  const [markets, setMarkets] = useState<DiscoveredMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [currentTime, setCurrentTime] = useState(nowSeconds);

  const loadMarkets = async (cancelled = { current: false }) => {
    setIsLoading(true);
    setError(null);

    try {
      const local = listKnownMarkets();
      const shared = await fetchSharedMarkets();
      const known = mergeKnownMarkets(local, shared);

      if (known.length > 0 && !cancelled.current) {
        setMarkets(known.map(toPlaceholderMarket));
      }

      const addresses = known.map((m) => m.contractAddress);
      const discovered = await fetchMarketStates(addresses);

      if (!cancelled.current) {
        if (discovered.length > 0) {
          const merged = mergeWithLocalMarkets(discovered, known);
          setMarkets(merged);
        } else if (known.length === 0) {
          setMarkets([]);
        }
      }
    } catch (err) {
      if (!cancelled.current) {
        console.error("[market-list] Failed to fetch market states:", err);
        setError(err instanceof Error ? err.message : String(err));
        const local = listKnownMarkets();
        setMarkets(local.map(toPlaceholderMarket));
      }
    } finally {
      if (!cancelled.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const cancelled = { current: false };
    loadMarkets(cancelled);

    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(nowSeconds());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleReload = () => {
    loadMarkets();
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMarkets = markets.filter((market) => {
    const category = categoryForMarket(market);
    const matchesCategory =
      activeCategory === "All" || category === activeCategory;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      market.question.toLowerCase().includes(normalizedQuery) ||
      market.contractAddress.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  const featuredMarket = useMemo(() => {
    return (
      filteredMarkets.find(
        (m) => displayStatusForMarket(m, currentTime) === "OPEN",
      ) ||
      filteredMarkets[0] ||
      null
    );
  }, [filteredMarkets, currentTime]);
  const featuredIsMultiOption = (featuredMarket?.optionCount ?? 1n) > 1n;
  const featuredStatus = featuredMarket
    ? displayStatusForMarket(featuredMarket, currentTime)
    : null;

  const simulatedHistory = useMemo(() => {
    if (!featuredMarket) return [];
    const endPrice = Math.round((featuredMarket.priceYes ?? 0.5) * 100);
    const steps = 6;
    const now = Date.now();
    const ticks: { time: string; YES: number; NO: number; }[] = [];
    const fluctuations = [-6, 3, -4, 5, -2, 0];
    
    for (let i = 0; i < steps; i++) {
      const t = now - (steps - 1 - i) * 60000;
      const diff = fluctuations[i % fluctuations.length];
      const yesVal = Math.max(5, Math.min(95, endPrice + diff));
      ticks.push({
        time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + `_${t}`,
        YES: yesVal,
        NO: 100 - yesVal,
      });
    }
    return ticks;
  }, [featuredMarket]);

  const openCount = markets.filter(
    (m) => displayStatusForMarket(m, currentTime) === "OPEN",
  ).length;
  const totalPositions = markets.reduce(
    (sum, market) => sum + market.positionCount,
    0n,
  );
  const totalOptions = markets.reduce(
    (sum, market) => sum + market.optionCount,
    0n,
  );

  return (
    <section className="page market-list">
      <header className="market-list__hero">
        <div>
          <p className="market-list__eyebrow">Prediction markets</p>
          <h1>Trade what the world is watching.</h1>
        </div>
        <div className="market-list__hero-actions">
          <button
            className="btn btn--ghost market-list__reload"
            onClick={handleReload}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <Link to="/create" className="btn btn--primary market-list__create">
            New market
          </Link>
        </div>
      </header>

      {featuredMarket && (
        <div className="featured-panel" data-testid="featured-panel">
          <div className="featured-panel__left">
            <div className="featured-panel__top">
              {featuredStatus && (
                <span
                  className={`featured-panel__live-badge featured-panel__live-badge--${marketDisplayStatusClassName(featuredStatus)}`}
                >
                  {featuredStatus === "OPEN" && (
                    <span className="featured-panel__live-dot" />
                  )}
                  {featuredStatus === "OPEN"
                    ? "LIVE"
                    : marketDisplayStatusLabel(featuredStatus)}
                </span>
              )}
              <span className="shielded-badge" title="Zero-knowledge private market position">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '3px', verticalAlign: 'middle' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Shielded
              </span>
            </div>
            <Link to={`/m/${featuredMarket.contractAddress}`} className="featured-panel__title">
              <h2>{featuredMarket.question}</h2>
            </Link>
            {featuredIsMultiOption ? (
              <Link
                to={`/m/${featuredMarket.contractAddress}`}
                className="featured-panel__option-summary"
                data-testid="featured-option-summary"
              >
                <span>{featuredMarket.optionCount.toString()} option markets</span>
                <strong>View all options</strong>
              </Link>
            ) : (
              <div className="featured-panel__bet-pills">
                <Link to={`/m/${featuredMarket.contractAddress}`} className="btn btn--yes-pill" data-testid="featured-yes-bet">
                  <span>YES</span>
                  <strong>{formatPriceYes(featuredMarket.priceYes)}</strong>
                </Link>
                <Link to={`/m/${featuredMarket.contractAddress}`} className="btn btn--no-pill" data-testid="featured-no-bet">
                  <span>NO</span>
                  <strong>{formatPriceYes(1 - featuredMarket.priceYes)}</strong>
                </Link>
              </div>
            )}
          </div>
          <div className="featured-panel__right">
            <div className="featured-panel__chart-container">
              {featuredIsMultiOption ? (
                <div className="featured-panel__multi-preview">
                  <div>
                    <span>Options</span>
                    <strong>{featuredMarket.optionCount.toString()}</strong>
                  </div>
                  <div>
                    <span>Positions</span>
                    <strong>{featuredMarket.positionCount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      {featuredStatus
                        ? marketDisplayStatusLabel(featuredStatus)
                        : marketDisplayStatusLabel(featuredMarket.status)}
                    </strong>
                  </div>
                </div>
              ) : simulatedHistory.length > 0 && (
                <AreaChart
                  data={simulatedHistory}
                  index="time"
                  categories={["YES", "NO"]}
                  colors={["#4d9a5f", "#e05252"]}
                  className="h-40 w-full"
                  xAxis={
                    <XAxis
                      dataKey="time"
                      tickFormatter={(val) => val.split("_")[0]}
                      tick={{ fill: "#8e9093", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  }
                  yAxis={
                    <YAxis
                      domain={[0, 100]}
                      ticks={[20, 50, 80]}
                      tickFormatter={(val) => `${val}%`}
                      tick={{ fill: "#8e9093", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  }
                  gridLines={
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.05)"
                    />
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="market-list__toolbar" role="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search markets"
          aria-label="Search markets"
        />
        <div className="market-list__tabs" aria-label="Market categories">
          {categories.map((category) => (
            <button
              key={category}
              className={
                category === activeCategory
                  ? "market-list__tab market-list__tab--active"
                  : "market-list__tab"
              }
              type="button"
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <dl className="market-list__stats">
        <div>
          <dt>Markets</dt>
          <dd>{markets.length}</dd>
        </div>
        <div>
          <dt>Open</dt>
          <dd>{openCount}</dd>
        </div>
        <div>
          <dt>Options</dt>
          <dd>{totalOptions.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Positions</dt>
          <dd>{totalPositions.toLocaleString()}</dd>
        </div>
      </dl>

      {error && (
        <div className="market-list__error" role="alert">
          <p>Market refresh failed: {error}</p>
          <p>Showing cached markets.</p>
        </div>
      )}

      {isLoading && markets.length === 0 ? (
        <div data-testid="market-list-loading">
          <MarketListSkeleton />
        </div>
      ) : markets.length === 0 ? (
        <div className="empty-state" data-testid="market-list-empty">
          <h2>No markets found</h2>
          <p>
            Deploy a market or connect the shared market registry.
          </p>
          <div className="empty-state__actions">
            <button
              className="btn btn--ghost"
              onClick={handleReload}
              disabled={isLoading}
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <Link to="/create" className="btn btn--primary">
              New market
            </Link>
          </div>
        </div>
      ) : (
        <>
          {isLoading && (
            <p className="market-list__status">
              Refreshing market state...
            </p>
          )}
          <ul className="market-list__grid" data-testid="market-list-grid">
            {filteredMarkets.map((m) => (
              <li key={m.contractAddress}>
                <MarketCard
                  market={m}
                  priceYes={m.priceYes}
                  status={displayStatusForMarket(m, currentTime)}
                  category={categoryForMarket(m)}
                  optionCount={m.optionCount}
                  positionCount={m.positionCount}
                  volumeLabel={volumeLabelFor(m)}
                />
              </li>
            ))}
          </ul>
          {filteredMarkets.length === 0 && (
            <div className="empty-state" data-testid="market-list-empty-filtered">
              <h2>No matching markets</h2>
              <p>Try another search or category.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
