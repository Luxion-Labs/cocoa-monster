import { fireEvent, render, screen } from "@testing-library/react";
import { type CocoaApi, type CocoaState, Side, Status } from "cocoa-contract";
import { describe, expect, it, vi } from "vitest";

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
  it("computes a non-zero quote for valid collateral", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "200" },
    });
    expect(screen.getByTestId("bet-form-quote").textContent).toMatch(
      /You receive\s*\d+\s*YES shares/,
    );
  });

  it("disables the submit button when collateral is invalid", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "abc" },
    });
    expect(
      (screen.getByTestId("bet-form-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("toggles between YES and NO and updates the implied price", () => {
    render(<BetForm api={fakeApi()} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    const yesQuote = screen.getByTestId("bet-form-quote").textContent ?? "";
    expect(yesQuote).toMatch(/YES shares/);

    fireEvent.click(screen.getByTestId("bet-form-side-no"));
    const noQuote = screen.getByTestId("bet-form-quote").textContent ?? "";
    expect(noQuote).toMatch(/NO shares/);
  });

  it("calls api.buy with the computed amountOut on submit", async () => {
    const api = fakeApi();
    render(<BetForm api={api} state={baseState} />);
    fireEvent.change(screen.getByTestId("bet-form-collateral"), {
      target: { value: "100" },
    });
    const form = screen.getByTestId("bet-form");
    fireEvent.submit(form);

    expect(api.buy).toHaveBeenCalledTimes(1);
    const [side, collateral, amountOut] = (api.buy as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(side).toBe(Side.YES);
    expect(collateral).toBe(100n);
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
