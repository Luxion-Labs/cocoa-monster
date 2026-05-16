import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { MarketCard } from "../components/MarketCard";
import { listKnownMarkets, rememberMarket } from "../lib/markets";
import { discoverMarkets, mergeWithLocalMarkets, type DiscoveredMarket } from "../lib/discovery";

export const MarketListPage = () => {
  const [markets, setMarkets] = useState<DiscoveredMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMarkets = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // First, show local markets immediately
        const local = listKnownMarkets();
        if (local.length > 0 && !cancelled) {
          setMarkets(local.map(m => ({
            ...m,
            priceYes: 0.5,
            status: "OPEN",
            positionCount: 0n,
          })));
        }

        // Then discover all markets from the indexer
        const discovered = await discoverMarkets();
        
        if (!cancelled) {
          // Merge with local markets and remember new ones
          const merged = mergeWithLocalMarkets(discovered, local);
          
          // Remember newly discovered markets
          for (const market of discovered) {
            if (!local.find(m => m.contractAddress === market.contractAddress)) {
              rememberMarket({
                contractAddress: market.contractAddress,
                question: market.question,
                addedAt: market.addedAt,
              });
            }
          }
          
          setMarkets(merged);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[market-list] Discovery failed:", err);
          setError(err instanceof Error ? err.message : String(err));
          // Fall back to local markets on error
          const local = listKnownMarkets();
          setMarkets(local.map(m => ({
            ...m,
            priceYes: 0.5,
            status: "OPEN",
            positionCount: 0n,
          })));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadMarkets();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page market-list">
      <header className="page__header">
        <h2>Markets</h2>
        <Link to="/create" className="btn btn--primary">
          New market
        </Link>
      </header>
      
      {error && (
        <div className="market-list__error" role="alert">
          <p>⚠️ Failed to discover markets from indexer: {error}</p>
          <p>Showing locally cached markets only.</p>
        </div>
      )}

      {isLoading && markets.length === 0 ? (
        <div className="market-list__loading" data-testid="market-list-loading">
          <p>🔍 Discovering markets on Midnight...</p>
        </div>
      ) : markets.length === 0 ? (
        <div className="empty-state" data-testid="market-list-empty">
          <p>No markets found on the network yet.</p>
          <p>
            <Link to="/create">Deploy the first one</Link> to get started, or
            paste an existing market address into the URL bar:{" "}
            <code>/m/&lt;contract-address&gt;</code>.
          </p>
        </div>
      ) : (
        <>
          {isLoading && (
            <p className="market-list__status">
              🔄 Refreshing from indexer...
            </p>
          )}
          <ul className="market-list__grid" data-testid="market-list-grid">
            {markets.map((m) => (
              <li key={m.contractAddress}>
                <MarketCard 
                  market={m} 
                  priceYes={m.priceYes}
                  status={m.status === "OPEN" ? 0 : 1}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
