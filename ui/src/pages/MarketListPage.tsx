import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { MarketCard } from "../components/MarketCard";
import { listKnownMarkets, type KnownMarket } from "../lib/markets";
import {
  fetchMarketStates,
  fetchSharedMarkets,
  mergeWithLocalMarkets,
  type DiscoveredMarket,
} from "../lib/discovery";

const categories = ["All", "Crypto", "Politics", "Sports", "Culture", "Tech"];

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

  const handleReload = () => {
    loadMarkets();
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMarkets = markets.filter((market) => {
    const category = categoryForQuestion(market.question);
    const matchesCategory =
      activeCategory === "All" || category === activeCategory;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      market.question.toLowerCase().includes(normalizedQuery) ||
      market.contractAddress.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  const openCount = markets.filter((m) => m.status === "OPEN").length;
  const totalPositions = markets.reduce(
    (sum, market) => sum + market.positionCount,
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
        <div className="market-list__loading" data-testid="market-list-loading">
          <p>Loading markets...</p>
        </div>
      ) : markets.length === 0 ? (
        <div className="empty-state" data-testid="market-list-empty">
          <h2>No markets found</h2>
          <p>
            Deploy a market or connect the shared oracle registry.
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
                  status={m.status}
                  category={categoryForQuestion(m.question)}
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
