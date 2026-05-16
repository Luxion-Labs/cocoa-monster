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
