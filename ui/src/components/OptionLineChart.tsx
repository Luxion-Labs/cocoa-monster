import type { CocoaOptionState } from "cocoa-contract";

import type { CocoaPriceTick } from "../hooks/useCocoaState";
import { formatPriceYes } from "../lib/format";

type Props = {
  options: readonly CocoaOptionState[];
  priceHistory: readonly CocoaPriceTick[];
};

type ChartRow = {
  readonly t: number;
  readonly prices: readonly number[];
};

const COLORS = [
  "#4d9a5f",
  "#5e6ad2",
  "#e4f222",
  "#e05252",
  "#a06cd5",
  "#2aa7a2",
  "#f0a030",
  "#8a8f98",
];

const WIDTH = 640;
const HEIGHT = 220;
const TOP = 12;
const RIGHT = 16;
const BOTTOM = 28;
const LEFT = 36;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

const buildRows = (
  options: readonly CocoaOptionState[],
  priceHistory: readonly CocoaPriceTick[],
): ChartRow[] => {
  const ticks =
    priceHistory.length > 0
      ? priceHistory
      : [{ t: Date.now(), priceYes: options[0]?.priceYes ?? 0.5 }];

  const rows = ticks.map((tick) => ({
    t: tick.t,
    prices: options.map(
      (option) =>
        (tick.optionPrices?.[option.optionId.toString()] ??
          option.priceYes) * 100,
    ),
  }));

  if (rows.length !== 1) return rows;
  return [{ ...rows[0], t: rows[0].t - 300000 }, rows[0]];
};

const xFor = (index: number, total: number): number =>
  LEFT + (total <= 1 ? 0 : (index / (total - 1)) * PLOT_WIDTH);

const yFor = (value: number): number =>
  TOP + ((100 - Math.max(0, Math.min(100, value))) / 100) * PLOT_HEIGHT;

const linePath = (
  rows: readonly ChartRow[],
  optionIndex: number,
): string =>
  rows
    .map((row, rowIndex) => {
      const command = rowIndex === 0 ? "M" : "L";
      return `${command} ${xFor(rowIndex, rows.length)} ${yFor(row.prices[optionIndex] ?? 0)}`;
    })
    .join(" ");

export const OptionLineChart = ({ options, priceHistory }: Props) => {
  const rows = buildRows(options, priceHistory);
  const lastRow = rows[rows.length - 1];

  return (
    <div className="option-line-chart" data-testid="option-line-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Option YES prices over time"
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="option-line-chart__grid"
            />
            <text
              x={LEFT - 8}
              y={yFor(tick) + 4}
              className="option-line-chart__axis"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}
        {options.map((option, index) => {
          const color = COLORS[index % COLORS.length];
          const currentPrice = lastRow?.prices[index] ?? option.priceYes * 100;
          return (
            <g key={option.optionId.toString()}>
              <path
                d={linePath(rows, index)}
                fill="none"
                stroke={color}
                className="option-line-chart__line"
              />
              <circle
                cx={xFor(rows.length - 1, rows.length)}
                cy={yFor(currentPrice)}
                r="3"
                fill={color}
                className="option-line-chart__point"
              />
            </g>
          );
        })}
      </svg>
      <div className="option-line-chart__legend">
        {options.map((option, index) => (
          <div
            key={option.optionId.toString()}
            className="option-line-chart__legend-item"
          >
            <span
              className="option-line-chart__swatch"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span>{option.label}</span>
            <strong>{formatPriceYes(option.priceYes)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};
