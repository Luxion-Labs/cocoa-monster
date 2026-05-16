// See note in format.spec.ts — mocking cocoa-contract avoids the
// onchain-runtime-v3 WASM init crash under vitest's jsdom loader.
import { vi } from "vitest";

vi.mock("cocoa-contract", () => ({
  Side: { YES: 0, NO: 1 },
  Status: { OPEN: 0, RESOLVED: 1 },
  // Recompute YES quote with the same CPMM math as quote.ts so the form
  // still produces realistic numbers without the heavy import chain.
  quoteAmountOut: (
    reserveYes: bigint,
    reserveNo: bigint,
    side: number,
    stakeIn: bigint,
  ): bigint => {
    if (stakeIn <= 0n) return 0n;
    const k = reserveYes * reserveNo;
    const divCeil = (n: bigint, d: bigint): bigint => (n + d - 1n) / d;
    if (side === 0) {
      const newReserveNo = reserveNo + stakeIn;
      const newReserveYes = divCeil(k, newReserveNo);
      return reserveYes - newReserveYes;
    }
    const newReserveYes = reserveYes + stakeIn;
    const newReserveNo = divCeil(k, newReserveYes);
    return reserveNo - newReserveNo;
  },
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Side, Status, type CocoaApi, type CocoaState } from "cocoa-contract";
import { BetForm } from "./BetForm";

const fakeApi = (impl: Partial<CocoaApi> = {}) =>
  ({
    buy: vi.fn(),
    resolve: vi.fn(),
    redeem: vi.fn(),
    ownedPositions: vi.fn(async () => []),
    ...impl,
  }) as unknown as CocoaApi;

const baseState: CocoaState = {
  question: "Will it rain?",
  closeTime: 999_999n,
  oraclePubKey: new Uint8Array(32),
  reserveYes: 1000n,
  reserveNo: 1000n,
  status: Status.OPEN,
  outcome: null,
  positionCount: 0n,
  nullifierCount: 0n,
  priceYes: 0.5,
};

describe("BetForm", () => {
  it("computes a non-zero quote for valid stake", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "200" },
    });
    expect(screen.getByTestId("bet-form-quote").textContent).toMatch(
      /Market exposure\s*\d+\s*YES units/,
    );
  });

  it("disables the submit button when stake is invalid", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "abc" },
    });
    expect(
      (screen.getByTestId("bet-form-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("toggles between YES and NO and updates the quote shape", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    expect(screen.getByTestId("bet-form-quote").textContent).toMatch(
      /YES units/,
    );

    fireEvent.click(screen.getByTestId("bet-form-side-no"));
    expect(screen.getByTestId("bet-form-quote").textContent).toMatch(
      /NO units/,
    );
  });

  it("calls api.buy with the computed amountOut on submit", async () => {
    const api = fakeApi();
    render(<BetForm api={api} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    fireEvent.submit(screen.getByTestId("bet-form"));

    expect(api.buy).toHaveBeenCalledTimes(1);
    const [side, stake, amountOut] = (
      api.buy as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(side).toBe(Side.YES);
    expect(stake).toBe(100n);
    expect(amountOut).toBeGreaterThan(0n);
  });

  it("renders the buy error to the user", async () => {
    const api = fakeApi({
      buy: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    render(<BetForm api={api} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    fireEvent.submit(screen.getByTestId("bet-form"));
    await screen.findByTestId("bet-form-error");
    expect(screen.getByTestId("bet-form-error").textContent).toMatch(/nope/);
  });
});
