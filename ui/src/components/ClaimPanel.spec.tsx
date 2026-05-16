// See note in format.spec.ts — mocking cocoa-contract avoids the
// onchain-runtime-v3 WASM init crash under vitest's jsdom loader.
import { vi } from "vitest";

vi.mock("cocoa-contract", () => ({
  Side: { YES: 0, NO: 1 },
  Status: { OPEN: 0, CLOSED: 1, RESOLVED: 2 },
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Side, Status, type CocoaApi, type CocoaPosition, type CocoaState } from "cocoa-contract";
import { ClaimPanel } from "./ClaimPanel";

const position = (
  side = Side.YES,
  amount = 10n,
  nonce = 1,
): CocoaPosition => ({
  side,
  amount,
  nonce: Uint8Array.from({ length: 32 }, (_, i) => nonce + i),
});

const fakeApi = (positions: CocoaPosition[], impl: Partial<CocoaApi> = {}) =>
  ({
    ownedPositions: vi.fn(async () => positions),
    redeem: vi.fn(),
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
  positionCount: 1n,
  nullifierCount: 0n,
  priceYes: 0.5,
};

describe("ClaimPanel", () => {
  it("renders owned positions after loading them from private state", async () => {
    render(<ClaimPanel api={fakeApi([position()])} state={baseState} />);

    expect(await screen.findByTestId("claim-panel-item")).toHaveTextContent(
      /YES .* 10 NIGHT staked/,
    );
  });

  it("claims winning resolved positions to the wallet unshielded address", async () => {
    const owned = position(Side.YES, 25n);
    const api = fakeApi([owned]);
    const wallet = {
      connected: {
        getUnshieldedAddress: vi.fn(async () => ({
          unshieldedAddress: "addr_test",
        })),
      },
    };

    render(
      <ClaimPanel
        api={api}
        state={{ ...baseState, status: Status.RESOLVED, outcome: Side.YES }}
        wallet={wallet as never}
      />,
    );

    fireEvent.click(await screen.findByTestId("claim-panel-redeem"));

    await waitFor(() => {
      expect(api.redeem).toHaveBeenCalledWith(owned, "addr_test");
    });
  });

  it("marks losing resolved positions without rendering a claim action", async () => {
    render(
      <ClaimPanel
        api={fakeApi([position(Side.NO, 15n)])}
        state={{ ...baseState, status: Status.RESOLVED, outcome: Side.YES }}
      />,
    );

    expect(await screen.findByText("Lost")).toBeInTheDocument();
    expect(screen.queryByTestId("claim-panel-redeem")).toBeNull();
  });
});
