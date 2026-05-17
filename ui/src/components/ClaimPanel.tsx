import {
  type CocoaApi,
  type CocoaPosition,
  type CocoaState,
  Side,
  Status,
} from "cocoa-contract";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { useEffect, useState } from "react";

import { formatBigInt, formatSide } from "../lib/format";
import type { LaceConnection } from "../lib/wallet";

type Props = {
  api: CocoaApi;
  state: CocoaState;
  wallet?: LaceConnection;
};

const positionId = (position: CocoaPosition): string =>
  Array.from(position.nonce, (byte) => byte.toString(16).padStart(2, "0")).join("");

const readUnshieldedAddress = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { unshieldedAddress?: unknown }).unshieldedAddress === "string" &&
    (value as { unshieldedAddress: string }).unshieldedAddress.trim()
  ) {
    return (value as { unshieldedAddress: string }).unshieldedAddress;
  }
  throw new Error("Wallet did not return an unshielded address.");
};

const toLedgerUserAddress = (address: string, networkId: string): string => {
  if (!address.startsWith("mn_")) return address;
  return MidnightBech32m.parse(address)
    .decode(UnshieldedAddress, networkId)
    .hexString;
};

const payoutFor = (position: CocoaPosition, state: CocoaState): bigint | null => {
  if (state.status !== Status.RESOLVED || state.outcome !== position.side) return null;
  const winningStake =
    state.outcome === Side.YES ? state.totalYesStake : state.totalNoStake;
  if (winningStake <= 0n) return null;
  return (position.amount * state.volume) / winningStake;
};

export const ClaimPanel = ({ api, state, wallet }: Props) => {
  const [positions, setPositions] = useState<readonly CocoaPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingPositionId, setLoadingPositionId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      setPositions(await api.ownedPositions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
    // Re-poll whenever the contract state changes — a successful claim
    // updates `nullifiers`, which fires a new state tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, state.nullifierCount]);

  const claim = async (position: CocoaPosition): Promise<void> => {
    setLoadingPositionId(positionId(position));
    setError(null);
    try {
      if (!wallet) {
        throw new Error("Connect wallet to claim payouts.");
      }
      const recipient = await wallet.connected.getUnshieldedAddress();
      const recipientAddress = toLedgerUserAddress(
        readUnshieldedAddress(recipient),
        wallet.configuration.networkId,
      );
      await api.redeem(position, recipientAddress);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPositionId(null);
    }
  };

  if (positions.length === 0) {
    return (
      <div className="claim-panel claim-panel--empty" data-testid="claim-panel">
        <h3>Your positions</h3>
        <p>No positions on this market yet. Place a bet above.</p>
      </div>
    );
  }

  const winnerSide = state.status === Status.RESOLVED ? state.outcome : null;

  return (
    <div className="claim-panel" data-testid="claim-panel">
      <h3>Your positions</h3>
      <ul className="claim-panel__list">
        {positions.map((p) => {
          const id = positionId(p);
          const isWinner =
            winnerSide !== null &&
            ((winnerSide === Side.YES && p.side === Side.YES) ||
              (winnerSide === Side.NO && p.side === Side.NO));
          const canClaim = state.status === Status.RESOLVED && isWinner;
          const payout = payoutFor(p, state);
          return (
            <li
              key={id}
              className="claim-panel__item"
              data-testid="claim-panel-item"
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="shielded-badge" title="Zero-knowledge private market position">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  Shielded
                </span>
                <span>
                  {formatSide(p.side)} · {formatBigInt(p.amount)} NIGHT staked
                  {payout !== null && (
                    <> · {formatBigInt(payout)} NIGHT payout</>
                  )}
                </span>
              </span>
              {canClaim ? (
                <button
                  type="button"
                  onClick={() => claim(p)}
                  disabled={loadingPositionId === id}
                  className="btn btn--primary"
                  data-testid="claim-panel-redeem"
                >
                  {loadingPositionId === id ? "Claiming..." : "Claim payout"}
                </button>
              ) : state.status === Status.RESOLVED ? (
                <span className="claim-panel__status">Lost</span>
              ) : (
                <span className="claim-panel__status">Pending resolution</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="claim-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
