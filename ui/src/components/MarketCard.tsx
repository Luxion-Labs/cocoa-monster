import { Link } from "react-router-dom";

import { formatPriceYes, truncateAddress } from "../lib/format";
import {
  marketDisplayStatusClassName,
  marketDisplayStatusLabel,
  type MarketDisplayStatus,
} from "../lib/market-status";
import type { KnownMarket } from "../lib/markets";

type Props = {
  market: KnownMarket;
  priceYes?: number;
  status?: MarketDisplayStatus;
  category?: string;
  optionCount?: bigint;
  positionCount?: bigint;
  volumeLabel?: string;
};

export const MarketCard = ({
  market,
  priceYes,
  status,
  category,
  optionCount,
  positionCount,
  volumeLabel,
}: Props) => (
  <Link
    to={`/m/${market.contractAddress}`}
    className="market-card"
    data-testid={`market-card-${market.contractAddress}`}
  >
    <div className="market-card__topline">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span>{category ?? "Market"}</span>
        <span className="shielded-badge" title="Zero-knowledge private market position">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Shielded
        </span>
      </div>
      {status !== undefined && (
        <span
          className={`market-card__status market-card__status--${marketDisplayStatusClassName(status)}`}
        >
          {marketDisplayStatusLabel(status)}
        </span>
      )}
    </div>
    <div className="market-card__question">{market.question}</div>
    {optionCount !== undefined && (
      <div className="market-card__options-count">
        {optionCount.toString()} {optionCount === 1n ? "option" : "options"}
      </div>
    )}
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
