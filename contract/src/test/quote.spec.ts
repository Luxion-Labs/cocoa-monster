import { describe, expect, it } from "vitest";

import { Side } from "../managed/cocoa/contract/index.js";
import { quoteAmountOut } from "../quote.js";
import { CocoaSimulator } from "./cocoa-simulator.js";

describe("quoteAmountOut", () => {
  it("returns 0 for zero stake", () => {
    expect(quoteAmountOut(1000n, 1000n, Side.YES, 0n)).toBe(0n);
    expect(quoteAmountOut(1000n, 1000n, Side.NO, 0n)).toBe(0n);
  });

  it("matches the contract's reserve update for a YES buy", () => {
    const reserveYes = 1000n;
    const reserveNo = 1000n;
    const stake = 100n;
    const amountOut = quoteAmountOut(reserveYes, reserveNo, Side.YES, stake);

    // Plug into the simulator: this exact (stake, amountOut) must
    // satisfy the contract's CPMM invariant `reserveYes > amountOut`.
    expect(amountOut).toBeGreaterThan(0n);

    const sim = new CocoaSimulator({
      question: "q",
      initialLiquidity: reserveYes,
      closeTime: 1000n,
    });
    sim.buy(Side.YES, stake, amountOut);
    const after = sim.ledger();
    expect(after.reserveYes).toBe(reserveYes - amountOut);
    expect(after.reserveNo).toBe(reserveNo + stake);
  });

  it("matches for a NO buy", () => {
    const sim = new CocoaSimulator({
      question: "q",
      initialLiquidity: 1000n,
      closeTime: 1000n,
    });
    const stake = 250n;
    const amountOut = quoteAmountOut(1000n, 1000n, Side.NO, stake);
    sim.buy(Side.NO, stake, amountOut);
    const l = sim.ledger();
    expect(l.reserveYes).toBe(1000n + stake);
    expect(l.reserveNo).toBe(1000n - amountOut);
  });

  it("scales monotonically with stake", () => {
    const a = quoteAmountOut(1000n, 1000n, Side.YES, 50n);
    const b = quoteAmountOut(1000n, 1000n, Side.YES, 100n);
    const c = quoteAmountOut(1000n, 1000n, Side.YES, 200n);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
