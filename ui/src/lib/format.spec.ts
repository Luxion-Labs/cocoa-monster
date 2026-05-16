// We mock cocoa-contract here because importing it pulls in the
// midnight-js / onchain-runtime-v3 WASM chain, which loads via
// fs.readFileSync at module init — fine in the production browser
// bundle (vite handles WASM differently) but breaks in vitest's jsdom
// loader. Side/Status are simple numeric enums in the contract bindings,
// so an inline shim is enough for these unit tests.
import { vi, describe, expect, it } from "vitest";

vi.mock("cocoa-contract", () => ({
  Side: { YES: 0, NO: 1 },
  Status: { OPEN: 0, RESOLVED: 1 },
}));

const { Side, Status } = await import("cocoa-contract");
const {
  formatBigInt,
  formatPriceYes,
  formatSide,
  formatStatus,
  truncateAddress,
} = await import("./format");

describe("formatBigInt", () => {
  it("formats with thousands separators", () => {
    expect(formatBigInt(0n)).toBe("0");
    expect(formatBigInt(1000n)).toMatch(/1[,.   ]?000/);
  });
});

describe("formatPriceYes", () => {
  it("renders 0.5 as 50.0¢", () => {
    expect(formatPriceYes(0.5)).toBe("50.0¢");
  });
  it("renders 0 as 0.0¢", () => {
    expect(formatPriceYes(0)).toBe("0.0¢");
  });
  it("renders 1 as 100.0¢", () => {
    expect(formatPriceYes(1)).toBe("100.0¢");
  });
});

describe("formatSide", () => {
  it("YES → YES", () => {
    expect(formatSide(Side.YES)).toBe("YES");
  });
  it("NO → NO", () => {
    expect(formatSide(Side.NO)).toBe("NO");
  });
});

describe("formatStatus", () => {
  it("OPEN → Open", () => {
    expect(formatStatus(Status.OPEN)).toBe("Open");
  });
  it("RESOLVED → Resolved", () => {
    expect(formatStatus(Status.RESOLVED)).toBe("Resolved");
  });
});

describe("truncateAddress", () => {
  it("leaves short addresses untouched", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });
  it("truncates long addresses with an ellipsis", () => {
    expect(truncateAddress("0x" + "a".repeat(40), 4, 4)).toBe(
      "0x" + "aa…aaaa",
    );
  });
});

const {
  formatTokenAmount,
  formatNightBalance,
  formatDustBalance,
} = await import("./format");

describe("formatTokenAmount", () => {
  it("formats whole numbers", () => {
    // 1 token = 1 * 10^18
    expect(formatTokenAmount(1000000000000000000n)).toBe("1");
  });

  it("formats decimal amounts", () => {
    // 1.5 tokens = 1.5 * 10^18
    expect(formatTokenAmount(1500000000000000000n)).toBe("1.5");
  });

  it("formats with thousands separators", () => {
    // 1,234.5678 tokens
    const result = formatTokenAmount(1234567800000000000000n);
    expect(result).toMatch(/1[,. ]234\.5678/);
  });

  it("limits decimal places", () => {
    // 1.123456789 tokens, should show max 4 decimals
    expect(formatTokenAmount(1123456789000000000n)).toBe("1.1234");
  });

  it("trims trailing zeros", () => {
    // 1.5000 should display as 1.5
    expect(formatTokenAmount(1500000000000000000n)).toBe("1.5");
  });

  it("handles zero", () => {
    expect(formatTokenAmount(0n)).toBe("0");
  });

  it("handles very small amounts", () => {
    // 0.0001 tokens
    expect(formatTokenAmount(100000000000000n)).toBe("0.0001");
  });

  it("respects custom decimals", () => {
    // 1 token with 6 decimals = 1,000,000
    expect(formatTokenAmount(1000000n, 6, 2)).toBe("1");
  });
});

describe("formatNightBalance", () => {
  it("formats tNight with label (10^6 STAR)", () => {
    // 1,000 tNight = 1,000,000,000 STAR
    expect(formatNightBalance(1_000_000_000n)).toBe("1,000 tNight");
  });

  it("formats zero tNight", () => {
    expect(formatNightBalance(0n)).toBe("0 tNight");
  });

  it("formats tNight with decimals", () => {
    // 1,234.567890 tNight = 1,234,567,890 STAR
    expect(formatNightBalance(1_234_567_890n)).toBe("1,234.56789 tNight");
  });

  it("trims trailing zeros", () => {
    // 1,000.500000 tNight = 1,000,500,000 STAR
    expect(formatNightBalance(1_000_500_000n)).toBe("1,000.5 tNight");
  });

  it("formats whole tNight without decimals", () => {
    // 500.000000 tNight = 500,000,000 STAR
    expect(formatNightBalance(500_000_000n)).toBe("500 tNight");
  });
});

describe("formatDustBalance", () => {
  it("formats tDUST with label (10^15 SPECK)", () => {
    // 33.167203 tDUST = 33,167,203,000,000,000 SPECK
    expect(formatDustBalance(33_167_203_000_000_000n)).toBe("33.167203 tDUST");
  });

  it("formats zero tDUST", () => {
    expect(formatDustBalance(0n)).toBe("0 tDUST");
  });

  it("formats large tDUST amounts", () => {
    // 5,000 tDUST = 5,000,000,000,000,000,000 SPECK
    expect(formatDustBalance(5_000_000_000_000_000_000n)).toBe("5,000 tDUST");
  });

  it("trims trailing zeros", () => {
    // 1.5 tDUST = 1,500,000,000,000,000 SPECK
    expect(formatDustBalance(1_500_000_000_000_000n)).toBe("1.5 tDUST");
  });

  it("formats actual DUST balance correctly", () => {
    // ~33.167204 tDUST
    const result = formatDustBalance(33_167_203_999_999_999n);
    expect(result).toBe("33.167203 tDUST");
  });
});
