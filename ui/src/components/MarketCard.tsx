import { Link } from "react-router-dom";

import { formatPriceYes, formatStatus, truncateAddress } from "../lib/format";
import type { KnownMarket } from "../lib/markets";

type Props = {
  market: KnownMarket;
  priceYes?: number;
  status?: import("cocoa-contract").Status;
};

export const MarketCard = ({ market, priceYes, status }: Props) => (
  <Link
    to={`/m/${market.contractAddress}`}
    className="market-card"
    data-testid={`market-card-${market.contractAddress}`}
  >
    <div className="market-card__question">{market.question}</div>
    <div className="market-card__meta">
      <code title={market.contractAddress}>
        {truncateAddress(market.contractAddress)}
      </code>
      {status !== undefined && (
        <span className="market-card__status">{formatStatus(status)}</span>
      )}
    </div>
    {priceYes !== undefined && (
      <div className="market-card__price" data-testid="market-card-price-yes">
        YES {formatPriceYes(priceYes)}
      </div>
    )}
  </Link>
);
