import { describe, expect, it } from "vitest";

import { quoteAmountOut } from "../quote.js";
import { CocoaSimulator, Side, Status } from "./cocoa-simulator.js";

const initial = (
  overrides: Partial<ConstructorParameters<typeof CocoaSimulator>[0]> = {},
) =>
  new CocoaSimulator({
    question: "Will it rain tomorrow?",
    initialLiquidity: 1000n,
    closeTime: 1_000n,
    ...overrides,
  });

describe("Cocoa contract — initial state", () => {
  it("seeds public state from constructor arguments", () => {
    const sim = initial();
    const ledger = sim.ledger();

    expect(ledger.question).toBe("Will it rain tomorrow?");
    expect(ledger.resolutionRules).toBe("Resolve according to the source.");
    expect(ledger.resolutionSource).toBe("https://example.com");
    expect(ledger.reserveYes).toBe(1000n);
    expect(ledger.reserveNo).toBe(1000n);
    expect(ledger.closeTime).toBe(1_000n);
    expect(ledger.oraclePubKey).toEqual(sim.oraclePubKey);
    expect(ledger.status).toBe(Status.OPEN);
    expect(ledger.positions.isEmpty()).toBe(true);
    expect(ledger.nullifiers.isEmpty()).toBe(true);
  });
});

describe("Cocoa contract — buy circuit", () => {
  it("burns YES reserve and grows NO reserve when buying YES", () => {
    const sim = initial();
    const before = sim.ledger();

    const quote = 90n;
    const stake = sim.buy(Side.YES, 100n, quote);

    const after = sim.ledger();
    expect(stake).toBe(100n);
    expect(after.reserveYes).toBe(before.reserveYes - quote);
    expect(after.reserveNo).toBe(before.reserveNo + 100n);
    expect(after.pool).toBe(before.pool + 100n);
    expect(after.volume).toBe(before.volume + 100n);
    expect(after.totalYesStake).toBe(before.totalYesStake + 100n);
    expect(after.totalNoStake).toBe(before.totalNoStake);
    expect(after.positions.size()).toBe(1n);
    expect(after.nullifiers.isEmpty()).toBe(true);
  });

  it("burns NO reserve and grows YES reserve when buying NO", () => {
    const sim = initial();
    const quote = 166n;
    const stake = sim.buy(Side.NO, 200n, quote);

    const after = sim.ledger();
    expect(stake).toBe(200n);
    expect(after.reserveYes).toBe(1000n + 200n);
    expect(after.reserveNo).toBe(1000n - quote);
    expect(after.totalNoStake).toBe(200n);
    expect(after.totalYesStake).toBe(0n);
    expect(after.positions.size()).toBe(1n);
  });

  it("returns the paid stake amount", () => {
    const sim = initial();
    expect(sim.buy(Side.YES, 100n, 90n)).toBe(100n);
  });

  it("rejects a buy when the UI quote is too optimistic", () => {
    const sim = initial();
    expect(() => sim.buy(Side.YES, 100n, 91n)).toThrow(/amount exceeds CPMM quote/);
  });

  it("rejects a buy when stake is not positive", () => {
    const sim = initial();
    expect(() => sim.buy(Side.NO, 0n, 0n)).toThrow(/stake must be positive/);
  });

  it("supports many sequential buys with monotonic price drift", () => {
    const sim = initial({ initialLiquidity: 10_000n });

    let priceYesPrev = 0.5;
    // Vary amount each iteration so commitments differ — H(sk, nonce, side,
    // amount) is deterministic, so identical buys would collide in the
    // positions set and accidentally hide a real position.
    for (let i = 0; i < 5; i++) {
      const before = sim.ledger();
      sim.buy(
        Side.YES,
        100n,
        quoteAmountOut(before.reserveYes, before.reserveNo, Side.YES, 100n),
      );
      const l = sim.ledger();
      const priceYes =
        Number(l.reserveNo) / Number(l.reserveYes + l.reserveNo);
      expect(priceYes).toBeGreaterThan(priceYesPrev);
      priceYesPrev = priceYes;
    }

    expect(sim.ledger().positions.size()).toBe(5n);
  });

  it("records sequential buys when the resulting positions differ", () => {
    const sim = initial({ initialLiquidity: 10_000n });
    let l = sim.ledger();
    sim.buy(Side.YES, 100n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.YES, 100n));
    l = sim.ledger();
    sim.buy(Side.NO, 101n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.NO, 101n));
    expect(sim.ledger().positions.size()).toBe(2n);
  });
});

describe("Cocoa contract — oracle resolution", () => {
  it("rejects buys at or after closeTime", () => {
    const sim = initial({ closeTime: 1_000n });
    expect(() => sim.buy(Side.YES, 100n, 90n, 1_000n)).toThrow(/market closed/);
  });

  it("rejects close before closeTime", () => {
    const sim = initial({ closeTime: 1_000n });
    expect(() => sim.close(500n)).toThrow(/market still open/);
  });

  it("closes after closeTime", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);

    expect(sim.ledger().status).toBe(Status.CLOSED);
  });

  it("rejects resolve before close", () => {
    const sim = initial({ closeTime: 1_000n });
    expect(() => sim.resolve(Side.YES, 1_000n)).toThrow(/market not closed/);
  });

  it("resolves directly when called by the trusted oracle", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);

    const l = sim.ledger();
    expect(l.status).toBe(Status.RESOLVED);
    expect(l.outcome).toBe(Side.YES);
  });

  it("rejects resolve from a non-oracle caller", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    // A non-oracle has no witness for `oracleSecret` — feed in a wrong
    // value and the contract recomputes a different pubKey, fails assert.
    sim.setOracleSecret(new Uint8Array(32).fill(0xee));
    expect(() => sim.resolve(Side.YES, 1_000n)).toThrow(/not the oracle/);
  });

  it("rejects double-resolve", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);
    expect(() => sim.resolve(Side.NO, 1_500n)).toThrow(/market not closed/);
  });

  it("rejects buy after close", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    expect(() => sim.buy(Side.YES, 100n, 90n, 1_001n)).toThrow(/market not open/);
  });

  it("records optimistic oracle proposals on-chain", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    sim.proposeOutcome(Side.YES, 1_100n, 300n);

    const l = sim.ledger();
    expect(l.proposedOutcome).toBe(Side.YES);
    expect(l.proposedAt).toBe(1_100n);
    expect(l.proposalDeadline).toBe(1_400n);
    expect(l.oracleDisputed).toBe(0n);
  });

  it("finalizes an undisputed optimistic oracle proposal", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    sim.proposeOutcome(Side.NO, 1_100n, 300n);
    expect(() => sim.finalizeOutcome(1_200n)).toThrow(/dispute window is still open/);
    sim.finalizeOutcome(1_400n);

    const l = sim.ledger();
    expect(l.status).toBe(Status.RESOLVED);
    expect(l.outcome).toBe(Side.NO);
    expect(l.oracleFinalized).toBe(1n);
  });

  it("blocks finalization after an optimistic oracle dispute", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.close(1_000n);
    sim.proposeOutcome(Side.YES, 1_100n, 300n);
    sim.disputeOutcome(1_200n);

    expect(sim.ledger().oracleDisputed).toBe(1n);
    expect(() => sim.finalizeOutcome(1_400n)).toThrow(/market is disputed/);
  });
});

describe("Cocoa contract — redeem circuit", () => {
  it("rejects redeem before resolution", () => {
    const sim = initial();
    const amountOut = sim.buy(Side.YES, 100n, 90n);
    expect(() => sim.redeem(Side.YES, amountOut)).toThrow(/market not resolved/);
  });

  it("rejects redeem on the losing side", () => {
    const sim = initial({ closeTime: 1_000n });
    const amountOut = sim.buy(Side.YES, 100n, 90n);
    sim.close(1_000n);
    sim.resolve(Side.NO, 1_000n);

    expect(() => sim.redeem(Side.YES, amountOut)).toThrow(/wrong side/);
  });

  it("rejects redeem when the buyer has no matching position", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.buy(Side.YES, 100n, 90n);
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);

    // Wrong amount → commitment mismatch.
    expect(() => sim.redeem(Side.YES, 999n)).toThrow(/no such position/);
  });

  it("redeems a winning position for its pro-rata share of the pool", () => {
    const sim = initial({ closeTime: 1_000n });
    const amountOut = sim.buy(Side.YES, 100n, 90n);
    let l = sim.ledger();
    sim.buy(Side.NO, 700n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.NO, 700n));
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);

    const payout = sim.redeem(Side.YES, amountOut);
    expect(payout).toBe(800n);
    expect(sim.ledger().pool).toBe(0n);
    expect(sim.ledger().nullifiers.size()).toBe(1n);
  });

  it("splits the pool pro-rata across multiple winners", () => {
    const sim = initial({ closeTime: 1_000n });
    const firstYes = sim.buy(Side.YES, 100n, 90n);
    let l = sim.ledger();
    const secondYes = sim.buy(Side.YES, 300n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.YES, 300n));
    l = sim.ledger();
    sim.buy(Side.NO, 600n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.NO, 600n));
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);

    expect(sim.redeem(Side.YES, firstYes)).toBe(250n);
    expect(sim.redeem(Side.YES, secondYes)).toBe(750n);
    expect(sim.ledger().pool).toBe(0n);
  });

  it("rejects caller-supplied payouts that are not the exact floor share", () => {
    const sim = initial({ closeTime: 1_000n });
    const amountOut = sim.buy(Side.YES, 100n, 90n);
    let l = sim.ledger();
    sim.buy(Side.NO, 700n, quoteAmountOut(l.reserveYes, l.reserveNo, Side.NO, 700n));
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);

    expect(() => sim.redeem(Side.YES, amountOut, 799n)).toThrow(/payout too low/);
    expect(() => sim.redeem(Side.YES, amountOut, 801n)).toThrow(/payout too high/);
  });

  it("blocks double-redeem via the nullifier set", () => {
    const sim = initial({ closeTime: 1_000n });
    const amountOut = sim.buy(Side.YES, 100n, 90n);
    sim.close(1_000n);
    sim.resolve(Side.YES, 1_000n);
    sim.redeem(Side.YES, amountOut);

    expect(() => sim.redeem(Side.YES, amountOut)).toThrow(/already redeemed/);
  });
});

describe("Cocoa contract — privacy invariants", () => {
  it("does not record buyer identity on the public ledger", () => {
    const sim = initial();
    sim.buy(Side.YES, 100n, 90n);

    const l = sim.ledger();
    // The only public artifact of the buy is a 32-byte opaque commitment.
    const commitments = [...l.positions];
    expect(commitments).toHaveLength(1);
    expect(commitments[0].byteLength).toBe(32);
    // The commitment has no relation to the secret key or nonce that any
    // observer can derive without those private values.
    expect(commitments[0]).not.toEqual(sim.secretKey);
    expect(commitments[0]).not.toEqual(sim.positionNonce);
  });

  it("does not record the oracle secret on the public ledger", () => {
    const sim = initial();
    const l = sim.ledger();
    expect(l.oraclePubKey).not.toEqual(sim.oracleSecret);
    // The on-chain commitment is the hash, not the secret itself.
    expect(l.oraclePubKey).toEqual(sim.oraclePubKey);
  });
});
