import {
  type Ledger,
  Side,
  Status,
} from "./managed/cocoa/contract/index.js";

/** UI-friendly snapshot of the public ledger. */
export type CocoaState = {
  question: string;
  closeTime: bigint;
  oraclePubKey: Uint8Array;
  reserveYes: bigint;
  reserveNo: bigint;
  status: Status;
  outcome: Side | null;
  positionCount: bigint;
  nullifierCount: bigint;
  /** YES probability implied by the CPMM: reserveNo / (reserveYes + reserveNo). */
  priceYes: number;
};

/** Project the on-chain ledger into a UI-friendly snapshot. */
export const decodeCocoaState = (l: Ledger): CocoaState => {
  const total = Number(l.reserveYes + l.reserveNo);
  return {
    question: l.question,
    closeTime: l.closeTime,
    oraclePubKey: l.oraclePubKey,
    reserveYes: l.reserveYes,
    reserveNo: l.reserveNo,
    status: l.status,
    outcome: l.status === Status.RESOLVED ? l.outcome : null,
    positionCount: l.positions.size(),
    nullifierCount: l.nullifiers.size(),
    priceYes: total === 0 ? 0.5 : Number(l.reserveNo) / total,
  };
};

/**
 * Compute the AMM amount-out a buyer would receive, given their collateral.
 *
 * The reserves move as `reserveYes * reserveNo = k`. After paying
 * `collateralIn` to the LP, the post-state for buying YES is:
 *   reserveNo' = reserveNo + collateralIn
 *   reserveYes' = k / reserveNo'
 *   amountOut = reserveYes - reserveYes'
 *
 * Computed in BigInt with floor division. The resulting `amountOut` is
 * always strictly less than the YES reserve, satisfying the contract's
 * `reserveYes > amountOut` assertion.
 */
export const quoteAmountOut = (
  reserveYes: bigint,
  reserveNo: bigint,
  side: Side,
  collateralIn: bigint,
): bigint => {
  if (collateralIn <= 0n) return 0n;
  const k = reserveYes * reserveNo;
  if (side === Side.YES) {
    const newReserveNo = reserveNo + collateralIn;
    const newReserveYes = k / newReserveNo;
    return reserveYes - newReserveYes;
  }
  const newReserveYes = reserveYes + collateralIn;
  const newReserveNo = k / newReserveYes;
  return reserveNo - newReserveNo;
};
