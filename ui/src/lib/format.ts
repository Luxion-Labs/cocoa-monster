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
