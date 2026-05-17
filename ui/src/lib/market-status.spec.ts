import { describe, expect, it } from "vitest";

import {
  displayStatusForMarket,
  marketDisplayStatusClassName,
  marketDisplayStatusLabel,
} from "./market-status";

describe("displayStatusForMarket", () => {
  it("shows betting closed for open markets after their deadline", () => {
    expect(
      displayStatusForMarket(
        { status: "OPEN", closeTime: 1_000n },
        1_000n,
      ),
    ).toBe("BETTING_CLOSED");
  });

  it("keeps open markets open before their deadline", () => {
    expect(
      displayStatusForMarket(
        { status: "OPEN", closeTime: 1_001n },
        1_000n,
      ),
    ).toBe("OPEN");
  });

  it("does not override contract lifecycle statuses", () => {
    expect(
      displayStatusForMarket(
        { status: "CLOSED", closeTime: 1_000n },
        1_100n,
      ),
    ).toBe("CLOSED");
    expect(
      displayStatusForMarket(
        { status: "RESOLVED", closeTime: 1_000n },
        1_100n,
      ),
    ).toBe("RESOLVED");
  });
});

describe("marketDisplayStatusLabel", () => {
  it("labels the betting deadline state clearly", () => {
    expect(marketDisplayStatusLabel("BETTING_CLOSED")).toBe("Betting closed");
  });
});

describe("marketDisplayStatusClassName", () => {
  it("normalizes derived status names for CSS classes", () => {
    expect(marketDisplayStatusClassName("BETTING_CLOSED")).toBe(
      "betting-closed",
    );
  });
});
