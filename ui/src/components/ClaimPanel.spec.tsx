// See note in format.spec.ts — mocking cocoa-contract avoids the
// onchain-runtime-v3 WASM init crash under vitest's jsdom loader.
import { vi } from "vitest";

vi.mock("cocoa-contract", () => ({
  Side: { YES: 0, NO: 1 },
  Status: { OPEN: 0, CLOSED: 1, RESOLVED: 2 },
}));

vi.mock("@midnight-ntwrk/wallet-sdk-address-format", () => {
  class UnshieldedAddress {}
  return {
    UnshieldedAddress,
    MidnightBech32m: {
      parse: vi.fn((address: string) => ({
        decode: vi.fn((_addressType: unknown, networkId: string) => ({
          hexString: `${networkId}:${address}:hex`,
        })),
      })),
    },
  };
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Side, Status, type CocoaApi, type CocoaPosition, type CocoaState } from "cocoa-contract";
import { ClaimPanel } from "./ClaimPanel";

const position = (
  side = Side.YES,
  amount = 10n,
  nonce = 1,
): CocoaPosition => ({
  optionId: 0n,
  side,
  amount,
  nonce: Uint8Array.from({ length: 32 }, (_, i) => nonce + i),
});

const option = (overrides: Partial<CocoaState["options"][number]> = {}) => ({
  optionId: 0n,
  label: "Outcome",
  reserveYes: 1000n,
  reserveNo: 1000n,
  pool: 25n,
  volume: 25n,
  totalYesStake: 25n,
  totalNoStake: 0n,
  status: Status.OPEN,
  outcome: null,
  proposedOutcome: null,
  proposedAt: 0n,
  proposalDeadline: 0n,
  oracleDisputed: false,
  oracleFinalized: false,
  priceYes: 0.5,
  ...overrides,
});

const fakeApi = (positions: CocoaPosition[], impl: Partial<CocoaApi> = {}) =>
  ({
    ownedPositions: vi.fn(async () => positions),
    redeem: vi.fn(),
    ...impl,
  }) as unknown as CocoaApi;

const fakeWallet = (getUnshieldedAddress: () => unknown) =>
  ({
    connected: {
      getUnshieldedAddress: vi.fn(getUnshieldedAddress),
    },
    configuration: {
      networkId: "preprod",
    },
  }) as never;

const baseState: CocoaState = {
  question: "Will it rain?",
  resolutionRules: "Resolve from the stated source.",
  resolutionSource: "https://example.com/result",
  closeTime: 999_999n,
  oraclePubKey: new Uint8Array(32),
  optionCount: 1n,
  unresolvedOptionCount: 1n,
  options: [option()],
  reserveYes: 1000n,
  reserveNo: 1000n,
  pool: 25n,
  volume: 25n,
  totalYesStake: 25n,
  totalNoStake: 0n,
  status: Status.OPEN,
  outcome: null,
  proposedOutcome: null,
  proposedAt: 0n,
  proposalDeadline: 0n,
  oracleDisputed: false,
  oracleFinalized: false,
  positionCount: 1n,
  nullifierCount: 0n,
  priceYes: 0.5,
};

const withOption = (
  state: CocoaState,
  overrides: Partial<CocoaState["options"][number]>,
): CocoaState => {
  const nextOption = option(overrides);
  return {
    ...state,
    options: [nextOption],
    reserveYes: nextOption.reserveYes,
    reserveNo: nextOption.reserveNo,
    pool: nextOption.pool,
    volume: nextOption.volume,
    totalYesStake: nextOption.totalYesStake,
    totalNoStake: nextOption.totalNoStake,
    outcome: nextOption.outcome,
    proposedOutcome: nextOption.proposedOutcome,
    proposedAt: nextOption.proposedAt,
    proposalDeadline: nextOption.proposalDeadline,
    oracleDisputed: nextOption.oracleDisputed,
    oracleFinalized: nextOption.oracleFinalized,
    priceYes: nextOption.priceYes,
  };
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
    const wallet = fakeWallet(async () => ({
      unshieldedAddress: "addr_test",
    }));

    render(
      <ClaimPanel
        api={api}
        state={withOption(baseState, { status: Status.RESOLVED, outcome: Side.YES })}
        wallet={wallet}
      />,
    );

    fireEvent.click(await screen.findByTestId("claim-panel-redeem"));

    await waitFor(() => {
      expect(api.redeem).toHaveBeenCalledWith(owned, "addr_test");
    });
  });

  it("shows the pro-rata payout for winning positions", async () => {
    render(
      <ClaimPanel
        api={fakeApi([position(Side.YES, 100n)])}
        state={{
          ...withOption(baseState, {
            status: Status.RESOLVED,
            outcome: Side.YES,
            volume: 800n,
            totalYesStake: 100n,
            totalNoStake: 700n,
          }),
        }}
      />,
    );

    expect(await screen.findByTestId("claim-panel-item")).toHaveTextContent(
      /100 NIGHT staked.*800 NIGHT payout/,
    );
  });

  it("also accepts wallets that return the unshielded address directly", async () => {
    const owned = position(Side.YES, 25n);
    const api = fakeApi([owned]);
    const wallet = fakeWallet(async () => "addr_direct");

    render(
      <ClaimPanel
        api={api}
        state={withOption(baseState, { status: Status.RESOLVED, outcome: Side.YES })}
        wallet={wallet}
      />,
    );

    fireEvent.click(await screen.findByTestId("claim-panel-redeem"));

    await waitFor(() => {
      expect(api.redeem).toHaveBeenCalledWith(owned, "addr_direct");
    });
  });

  it("decodes Midnight Bech32m wallet addresses before redeeming", async () => {
    const owned = position(Side.YES, 25n);
    const api = fakeApi([owned]);
    const wallet = fakeWallet(async () => ({
      unshieldedAddress: "mn_addr_preprod1abc",
    }));

    render(
      <ClaimPanel
        api={api}
        state={withOption(baseState, { status: Status.RESOLVED, outcome: Side.YES })}
        wallet={wallet}
      />,
    );

    fireEvent.click(await screen.findByTestId("claim-panel-redeem"));

    await waitFor(() => {
      expect(api.redeem).toHaveBeenCalledWith(
        owned,
        "preprod:mn_addr_preprod1abc:hex",
      );
    });
  });

  it("shows a clear error when the wallet returns no unshielded address", async () => {
    const api = fakeApi([position(Side.YES, 25n)]);
    const wallet = fakeWallet(async () => ({}));

    render(
      <ClaimPanel
        api={api}
        state={withOption(baseState, { status: Status.RESOLVED, outcome: Side.YES })}
        wallet={wallet}
      />,
    );

    fireEvent.click(await screen.findByTestId("claim-panel-redeem"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wallet did not return an unshielded address.",
    );
    expect(api.redeem).not.toHaveBeenCalled();
  });

  it("marks losing resolved positions without rendering a claim action", async () => {
    render(
      <ClaimPanel
        api={fakeApi([position(Side.NO, 15n)])}
        state={withOption(baseState, { status: Status.RESOLVED, outcome: Side.YES })}
      />,
    );

    expect(await screen.findByText("Lost")).toBeInTheDocument();
    expect(screen.queryByTestId("claim-panel-redeem")).toBeNull();
  });
});
