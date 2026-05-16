import { Side, Status } from "cocoa-contract";

export const formatBigInt = (n: bigint): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const formatPriceYes = (priceYes: number): string =>
  `${(priceYes * 100).toFixed(1)}¢`;

export const formatSide = (side: Side): string =>
  side === Side.YES ? "YES" : "NO";

export const formatStatus = (status: Status): string => {
  switch (status) {
    case Status.OPEN:
      return "Open";
    case Status.CLOSED:
      return "Closed";
    case Status.RESOLVED:
      return "Resolved";
    default:
      return "Unknown";
  }
};

export const formatUnixSeconds = (ts: bigint): string =>
  new Date(Number(ts) * 1000).toLocaleString();

export const truncateAddress = (addr: string, head = 6, tail = 4): string =>
  addr.length > head + tail + 2
    ? `${addr.slice(0, head)}…${addr.slice(-tail)}`
    : addr;

/**
 * Format a bigint token amount for display.
 * 
 * @param amount - Raw token amount in smallest unit
 * @param decimals - Number of decimal places (default: 18)
 * @param maxDecimals - Maximum decimal places to show (default: 4)
 * @returns Formatted string like "1,234.5678"
 */
export const formatTokenAmount = (
  amount: bigint,
  decimals = 18,
  maxDecimals = 4,
): string => {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  // Format integer part with thousands separators
  const integerStr = integerPart.toLocaleString("en-US");

  // Format fractional part
  if (fractionalPart === 0n || maxDecimals === 0) {
    return integerStr;
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmed = fractionalStr.slice(0, maxDecimals).replace(/0+$/, "");

  return trimmed ? `${integerStr}.${trimmed}` : integerStr;
};

/**
 * Format tNight balance for display.
 * NIGHT is divided into 10^6 STAR (1,000,000 atomic units).
 * @param amount - Raw tNight amount in STAR
 * @returns Formatted string like "1,234.5678 tNight"
 */
export const formatNightBalance = (amount: bigint): string => {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  // Trim trailing zeros from fraction
  const trimmedFraction = fraction.replace(/0+$/, "");
  const formatted = trimmedFraction
    ? `${whole.toLocaleString("en-US")}.${trimmedFraction}`
    : whole.toLocaleString("en-US");
  return `${formatted} tNight`;
};

/**
 * Format tDUST balance for display.
 * DUST is divided into 10^15 SPECK (1,000,000,000,000,000 atomic units).
 * @param amount - Raw tDUST amount in SPECK
 * @returns Formatted string like "1,234.5678 tDUST"
 */
export const formatDustBalance = (amount: bigint): string => {
  const whole = amount / 1_000_000_000_000_000n;
  const fraction = (amount % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, "0");
  // Show only first 6 decimals and trim trailing zeros
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  const formatted = trimmedFraction
    ? `${whole.toLocaleString("en-US")}.${trimmedFraction}`
    : whole.toLocaleString("en-US");
  return `${formatted} tDUST`;
};
