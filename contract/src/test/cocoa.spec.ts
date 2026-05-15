import { describe, expect, it } from "vitest";

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

    sim.buy(Side.YES, 100n, 50n);

    const after = sim.ledger();
    expect(after.reserveYes).toBe(before.reserveYes - 50n);
    expect(after.reserveNo).toBe(before.reserveNo + 100n);
    expect(after.positions.size()).toBe(1n);
    expect(after.nullifiers.isEmpty()).toBe(true);
  });

  it("burns NO reserve and grows YES reserve when buying NO", () => {
    const sim = initial();
    sim.buy(Side.NO, 200n, 80n);

    const after = sim.ledger();
    expect(after.reserveYes).toBe(1000n + 200n);
    expect(after.reserveNo).toBe(1000n - 80n);
    expect(after.positions.size()).toBe(1n);
  });

  it("returns a 32-byte commitment per position", () => {
    const sim = initial();
    const commitment = sim.buy(Side.YES, 100n, 50n);
    expect(commitment).toBeInstanceOf(Uint8Array);
    expect(commitment.byteLength).toBe(32);
  });

  it("rejects a buy that would drain the YES reserve", () => {
    const sim = initial();
    expect(() => sim.buy(Side.YES, 5_000n, 1_000n)).toThrow(/insufficient YES liquidity/);
  });

  it("rejects a buy that would drain the NO reserve", () => {
    const sim = initial();
    expect(() => sim.buy(Side.NO, 5_000n, 1_000n)).toThrow(/insufficient NO liquidity/);
  });

  it("supports many sequential buys with monotonic price drift", () => {
    const sim = initial({ initialLiquidity: 10_000n });

    let priceYesPrev = 0.5;
    // Vary amount each iteration so commitments differ — H(sk, nonce, side,
    // amount) is deterministic, so identical buys would collide in the
    // positions set and accidentally hide a real position.
    for (let i = 0; i < 5; i++) {
      sim.buy(Side.YES, 100n, BigInt(50 + i));
      const l = sim.ledger();
      const priceYes =
        Number(l.reserveNo) / Number(l.reserveYes + l.reserveNo);
      expect(priceYes).toBeGreaterThan(priceYesPrev);
      priceYesPrev = priceYes;
    }

    expect(sim.ledger().positions.size()).toBe(5n);
  });

  it("collapses identical (side, amount) buys into one commitment", () => {
    // Sanity: H(sk, nonce, side, amount) is deterministic, so a buyer who
    // buys the same shape twice with the same private state produces a
    // single commitment. The privacy model requires nonce rotation per
    // position to avoid this collision; this test pins that contract.
    const sim = initial({ initialLiquidity: 10_000n });
    sim.buy(Side.YES, 100n, 50n);
    sim.buy(Side.YES, 100n, 50n);
    expect(sim.ledger().positions.size()).toBe(1n);
  });
});

describe("Cocoa contract — oracle resolution", () => {
  it("rejects resolve before closeTime", () => {
    const sim = initial({ closeTime: 1_000n });
    expect(() => sim.resolve(Side.YES, 500n)).toThrow(/market still open/);
  });

  it("resolves directly when called by the trusted oracle", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.resolve(Side.YES, 1_000n);

    const l = sim.ledger();
    expect(l.status).toBe(Status.RESOLVED);
    expect(l.outcome).toBe(Side.YES);
  });

  it("rejects resolve from a non-oracle caller", () => {
    const sim = initial({ closeTime: 1_000n });
    // A non-oracle has no witness for `oracleSecret` — feed in a wrong
    // value and the contract recomputes a different pubKey, fails assert.
    sim.setOracleSecret(new Uint8Array(32).fill(0xee));
    expect(() => sim.resolve(Side.YES, 1_000n)).toThrow(/not the oracle/);
  });

  it("rejects double-resolve", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.resolve(Side.YES, 1_000n);
    expect(() => sim.resolve(Side.NO, 1_500n)).toThrow(/market not open/);
  });

  it("rejects buy after resolve", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.resolve(Side.YES, 1_000n);
    expect(() => sim.buy(Side.YES, 100n, 50n)).toThrow(/market not open/);
  });
});

describe("Cocoa contract — redeem circuit", () => {
  it("rejects redeem before resolution", () => {
    const sim = initial();
    sim.buy(Side.YES, 100n, 50n);
    expect(() => sim.redeem(Side.YES, 50n)).toThrow(/market not resolved/);
  });

  it("rejects redeem on the losing side", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.buy(Side.YES, 100n, 50n);
    sim.resolve(Side.NO, 1_000n);

    expect(() => sim.redeem(Side.YES, 50n)).toThrow(/wrong side/);
  });

  it("rejects redeem when the buyer has no matching position", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.buy(Side.YES, 100n, 50n);
    sim.resolve(Side.YES, 1_000n);

    // Wrong amount → commitment mismatch.
    expect(() => sim.redeem(Side.YES, 999n)).toThrow(/no such position/);
  });

  it("redeems a winning position once and emits a nullifier", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.buy(Side.YES, 100n, 50n);
    sim.resolve(Side.YES, 1_000n);

    const payout = sim.redeem(Side.YES, 50n);
    expect(payout).toBe(50n);
    expect(sim.ledger().nullifiers.size()).toBe(1n);
  });

  it("blocks double-redeem via the nullifier set", () => {
    const sim = initial({ closeTime: 1_000n });
    sim.buy(Side.YES, 100n, 50n);
    sim.resolve(Side.YES, 1_000n);
    sim.redeem(Side.YES, 50n);

    expect(() => sim.redeem(Side.YES, 50n)).toThrow(/already redeemed/);
  });
});

describe("Cocoa contract — privacy invariants", () => {
  it("does not record buyer identity on the public ledger", () => {
    const sim = initial();
    sim.buy(Side.YES, 100n, 50n);

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
