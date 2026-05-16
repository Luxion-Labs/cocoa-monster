import {
  type CocoaApi,
  type CocoaPosition,
  type CocoaState,
  Side,
  Status,
} from "cocoa-contract";
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
      await api.redeem(position, recipient.unshieldedAddress);
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
          return (
            <li
              key={id}
              className="claim-panel__item"
              data-testid="claim-panel-item"
            >
              <span>
                {formatSide(p.side)} · {formatBigInt(p.amount)} NIGHT staked
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
