// See note in format.spec.ts — mocking cocoa-contract avoids the
// onchain-runtime-v3 WASM init crash under vitest's jsdom loader.
import { vi } from "vitest";

vi.mock("cocoa-contract", () => ({
  Side: { YES: 0, NO: 1 },
  Status: { OPEN: 0, CLOSED: 1, RESOLVED: 2 },
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

import {
  Side,
  Status,
  type CocoaApi,
  type CocoaOptionState,
  type CocoaState,
} from "cocoa-contract";
import { BetForm } from "./BetForm";

const fakeApi = (impl: Partial<CocoaApi> = {}) =>
  ({
    buy: vi.fn(async (side: Side, _stake: bigint, _amountOut: bigint, optionId = 0n) => ({
      optionId,
      side,
      amount: 10n,
      nonce: new Uint8Array(32),
    })),
    close: vi.fn(),
    resolve: vi.fn(),
    redeem: vi.fn(),
    ownedPositions: vi.fn(async () => []),
    ...impl,
  }) as unknown as CocoaApi;

const baseState: CocoaState = {
  question: "Will it rain?",
  resolutionRules: "Resolve from the stated source.",
  resolutionSource: "https://example.com/result",
  closeTime: 999_999n,
  oraclePubKey: new Uint8Array(32),
  optionCount: 1n,
  unresolvedOptionCount: 1n,
  options: [],
  reserveYes: 1000n,
  reserveNo: 1000n,
  pool: 0n,
  volume: 0n,
  totalYesStake: 0n,
  totalNoStake: 0n,
  status: Status.OPEN,
  outcome: null,
  proposedOutcome: null,
  proposedAt: 0n,
  proposalDeadline: 0n,
  oracleDisputed: false,
  oracleFinalized: false,
  positionCount: 0n,
  nullifierCount: 0n,
  priceYes: 0.5,
};

const baseOption: CocoaOptionState = {
  optionId: 0n,
  label: "Outcome",
  reserveYes: 1000n,
  reserveNo: 1000n,
  pool: 0n,
  volume: 0n,
  totalYesStake: 0n,
  totalNoStake: 0n,
  status: Status.OPEN,
  outcome: null,
  proposedOutcome: null,
  proposedAt: 0n,
  proposalDeadline: 0n,
  oracleDisputed: false,
  oracleFinalized: false,
  priceYes: 0.5,
};

baseState.options = [baseOption];

describe("BetForm", () => {
  it("computes a non-zero quote for valid stake", () => {
    render(<BetForm api={fakeApi()} option={baseOption} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "200" },
    });
    expect(screen.getByTestId("bet-form-quote").textContent).toMatch(
      /YES exposure\s*\d+\s*YES units/,
    );
  });

  it("disables the submit button when stake is invalid", () => {
    render(<BetForm api={fakeApi()} option={baseOption} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "abc" },
    });
    expect(
      (screen.getByTestId("bet-form-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows a closed betting state and does not submit", () => {
    const api = fakeApi();
    render(
      <BetForm
        api={api}
        option={baseOption}
        disabledReason="Betting closed at 5/17/2026, 12:00:00 PM."
      />,
    );

    expect(screen.getByTestId("bet-form-disabled-reason").textContent).toMatch(
      /Betting closed/,
    );
    expect(screen.getByTestId("bet-form-submit").textContent).toBe(
      "Betting closed",
    );
    expect(
      (screen.getByTestId("bet-form-submit") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.submit(screen.getByTestId("bet-form"));
    expect(api.buy).not.toHaveBeenCalled();
  });

  it("toggles between YES and NO and updates the quote shape", () => {
    render(<BetForm api={fakeApi()} option={baseOption} />);
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
    render(<BetForm api={api} option={baseOption} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    fireEvent.submit(screen.getByTestId("bet-form"));

    expect(api.buy).toHaveBeenCalledTimes(1);
    const [side, stake, amountOut, optionId] = (
      api.buy as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(side).toBe(Side.YES);
    expect(stake).toBe(100n);
    expect(amountOut).toBeGreaterThan(0n);
    expect(optionId).toBe(0n);
  });

  it("renders the buy error to the user", async () => {
    const api = fakeApi({
      buy: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    render(<BetForm api={api} option={baseOption} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    fireEvent.submit(screen.getByTestId("bet-form"));
    await screen.findByTestId("bet-form-error");
    expect(screen.getByTestId("bet-form-error").textContent).toMatch(/nope/);
  });

  it("checks unshielded NIGHT before submitting when wallet is available", async () => {
    const api = fakeApi();
    const wallet = {
      connected: {
        getUnshieldedBalances: vi.fn(async () => ({})),
      },
    };
    render(
      <BetForm
        api={api}
        option={baseOption}
        wallet={wallet as never}
      />,
    );

    fireEvent.submit(screen.getByTestId("bet-form"));

    await screen.findByTestId("bet-form-error");
    expect(api.buy).not.toHaveBeenCalled();
    expect(screen.getByTestId("bet-form-error").textContent).toMatch(
      /Insufficient unshielded NIGHT/,
    );
  });
});
