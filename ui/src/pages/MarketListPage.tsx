import { Link } from "react-router-dom";

import { MarketCard } from "../components/MarketCard";
import { listKnownMarkets } from "../lib/markets";

export const MarketListPage = () => {
  const markets = listKnownMarkets();

  return (
    <section className="page market-list">
      <header className="page__header">
        <h2>Markets</h2>
        <Link to="/create" className="btn btn--primary">
          New market
        </Link>
      </header>
      {markets.length === 0 ? (
        <div className="empty-state" data-testid="market-list-empty">
          <p>You haven't seen any markets on this device yet.</p>
          <p>
            <Link to="/create">Deploy a fresh one</Link> to get started, or
            paste an existing market address into the URL bar:{" "}
            <code>/m/&lt;contract-address&gt;</code>.
          </p>
        </div>
      ) : (
        <ul className="market-list__grid" data-testid="market-list-grid">
          {markets.map((m) => (
            <li key={m.contractAddress}>
              <MarketCard market={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
