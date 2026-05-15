import { useMemo } from "react";

import { formatPriceYes } from "../lib/format";
import type { CocoaPriceTick } from "../hooks/useCocoaState";

type Props = {
  history: readonly CocoaPriceTick[];
  width?: number;
  height?: number;
};

/**
 * Hand-rolled SVG line chart for the YES probability over time. Avoids
 * pulling in a 100kB chart library for a single sparkline.
 */
export const PriceChart = ({ history, width = 480, height = 160 }: Props) => {
  const chart = useMemo(() => {
    if (history.length === 0) {
      return { path: "", current: null as number | null, min: 0, max: 1 };
    }
    if (history.length === 1) {
      const only = history[0];
      return {
        path: `M0,${height / 2} L${width},${height / 2}`,
        current: only.priceYes,
        min: 0,
        max: 1,
      };
    }
    const xs = history.map((p) => p.t);
    const minT = xs[0];
    const maxT = xs[xs.length - 1];
    const span = Math.max(maxT - minT, 1);
    const points = history.map((p, i) => {
      const x = ((p.t - minT) / span) * width;
      const y = (1 - p.priceYes) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return {
      path: points.join(" "),
      current: history[history.length - 1].priceYes,
      min: 0,
      max: 1,
    };
  }, [history, width, height]);

  return (
    <div className="price-chart" data-testid="price-chart">
      <div className="price-chart__header">
        <span className="price-chart__title">YES probability</span>
        {chart.current !== null && (
          <span className="price-chart__value" data-testid="price-chart-current">
            {formatPriceYes(chart.current)}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="YES probability over time"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeDasharray="4 4"
        />
        {chart.path && (
          <path
            d={chart.path}
            fill="none"
            stroke="#5b8def"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
      {history.length === 0 && (
        <div className="price-chart__empty">Waiting for first state update…</div>
      )}
    </div>
  );
};
