import { describe, expect, it, vi } from "vitest";

import { CocoaApi, COCOA_PRIVATE_STATE_ID } from "../api.js";
import { Side } from "../managed/cocoa/contract/index.js";
import type { CocoaPosition, CocoaPrivateState } from "../witnesses.js";

const nonce = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => seed + i);

const position = (seed: number): CocoaPosition => ({
  optionId: 0n,
  side: Side.YES,
  amount: 10n,
  nonce: nonce(seed),
});

describe("CocoaApi private positions", () => {
  it("removes redeemed positions by nonce bytes, not Uint8Array identity", async () => {
    const redeemed = position(1);
    const remaining = position(9);
    const privateState: CocoaPrivateState = {
      secretKey: nonce(20),
      positionNonce: nonce(30),
      oracleSecret: nonce(40),
      ownedPositions: [
        { ...redeemed, nonce: nonce(1) },
        remaining,
      ],
    };
    const set = vi.fn();
    const api = Object.create(CocoaApi.prototype) as CocoaApi;
    Object.assign(api, {
      providers: {
        privateStateProvider: {
          get: vi.fn(async () => privateState),
          set,
        },
      },
    });

    await (api as never as {
      markPositionRedeemed(position: CocoaPosition): Promise<void>;
    }).markPositionRedeemed(redeemed);

    expect(set).toHaveBeenCalledWith(COCOA_PRIVATE_STATE_ID, {
      ...privateState,
      ownedPositions: [remaining],
    });
  });
});
