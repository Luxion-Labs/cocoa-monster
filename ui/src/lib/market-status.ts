export type ContractMarketStatus = "OPEN" | "CLOSED" | "RESOLVED";

export type MarketDisplayStatus =
  | ContractMarketStatus
  | "BETTING_CLOSED";

type MarketStatusSource = {
  readonly status: ContractMarketStatus;
  readonly closeTime?: bigint;
};

export const displayStatusForMarket = (
  market: MarketStatusSource,
  currentTime: bigint,
): MarketDisplayStatus => {
  if (
    market.status === "OPEN" &&
    market.closeTime !== undefined &&
    currentTime >= market.closeTime
  ) {
    return "BETTING_CLOSED";
  }

  return market.status;
};

export const marketDisplayStatusLabel = (
  status: MarketDisplayStatus,
): string => {
  switch (status) {
    case "OPEN":
      return "Open";
    case "BETTING_CLOSED":
      return "Betting closed";
    case "CLOSED":
      return "Closed";
    case "RESOLVED":
      return "Resolved";
  }
};

export const marketDisplayStatusClassName = (
  status: MarketDisplayStatus,
): string => status.toLowerCase().replaceAll("_", "-");
