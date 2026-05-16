import { Link } from "react-router-dom";

import { formatPriceYes, truncateAddress } from "../lib/format";
import type { KnownMarket } from "../lib/markets";

type Props = {
  market: KnownMarket;
  priceYes?: number;
  status?: "OPEN" | "RESOLVED";
  category?: string;
  positionCount?: bigint;
  volumeLabel?: string;
};

export const MarketCard = ({
  market,
  priceYes,
  status,
  category,
  positionCount,
  volumeLabel,
}: Props) => (
  <Link
    to={`/m/${market.contractAddress}`}
    className="market-card"
    data-testid={`market-card-${market.contractAddress}`}
  >
    <div className="market-card__topline">
      <span>{category ?? "Market"}</span>
      {status !== undefined && (
        <span
          className={`market-card__status market-card__status--${status.toLowerCase()}`}
        >
          {status === "OPEN" ? "Open" : "Resolved"}
        </span>
      )}
    </div>
    <div className="market-card__question">{market.question}</div>
    {priceYes !== undefined && (
      <div
        className="market-card__outcomes"
        data-testid="market-card-price-yes"
      >
        <div className="market-card__outcome market-card__outcome--yes">
          <span>Yes</span>
          <strong>{formatPriceYes(priceYes)}</strong>
        </div>
        <div className="market-card__outcome market-card__outcome--no">
          <span>No</span>
          <strong>{formatPriceYes(1 - priceYes)}</strong>
        </div>
      </div>
    )}
    <div className="market-card__meta">
      <code title={market.contractAddress}>
        {truncateAddress(market.contractAddress)}
      </code>
      <span>{positionCount ?? 0n} positions</span>
    </div>
    {volumeLabel && <div className="market-card__volume">{volumeLabel}</div>}
  </Link>
);
