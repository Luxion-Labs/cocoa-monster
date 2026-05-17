import {
  type Ledger,
  Side,
  Status,
} from "./managed/cocoa/contract/index.js";

/** UI-friendly snapshot of the public ledger. */
export type CocoaState = {
  question: string;
  resolutionRules: string;
  resolutionSource: string;
  closeTime: bigint;
  oraclePubKey: Uint8Array;
  reserveYes: bigint;
  reserveNo: bigint;
  pool: bigint;
  volume: bigint;
  totalYesStake: bigint;
  totalNoStake: bigint;
  status: Status;
  outcome: Side | null;
  proposedOutcome: Side | null;
  proposedAt: bigint;
  proposalDeadline: bigint;
  oracleDisputed: boolean;
  oracleFinalized: boolean;
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
    resolutionRules: l.resolutionRules,
    resolutionSource: l.resolutionSource,
    closeTime: l.closeTime,
    oraclePubKey: l.oraclePubKey,
    reserveYes: l.reserveYes,
    reserveNo: l.reserveNo,
    pool: l.pool,
    volume: l.volume,
    totalYesStake: l.totalYesStake,
    totalNoStake: l.totalNoStake,
    status: l.status,
    outcome: l.status === Status.RESOLVED ? l.outcome : null,
    proposedOutcome: l.proposedAt > 0n ? l.proposedOutcome : null,
    proposedAt: l.proposedAt,
    proposalDeadline: l.proposalDeadline,
    oracleDisputed: l.oracleDisputed !== 0n,
    oracleFinalized: l.oracleFinalized !== 0n,
    positionCount: l.positions.size(),
    nullifierCount: l.nullifiers.size(),
    priceYes: total === 0 ? 0.5 : Number(l.reserveNo) / total,
  };
};

/**
 * Compute the AMM amount-out a buyer would receive, given their stake.
 *
 * The reserves move as `reserveYes * reserveNo = k`. After paying
 * `stakeIn` to the opposite reserve, the post-state for buying YES is:
 *   reserveNo' = reserveNo + stakeIn
 *   reserveYes' = ceil(k / reserveNo')
 *   amountOut = reserveYes - reserveYes'
 *
 * Computed in BigInt with ceiling division for the post-trade reserve.
 * That keeps the contract-side invariant check conservative:
 * `reserveYes' * reserveNo' >= k`.
 */
const divCeil = (n: bigint, d: bigint): bigint => (n + d - 1n) / d;

export const quoteAmountOut = (
  reserveYes: bigint,
  reserveNo: bigint,
  side: Side,
  stakeIn: bigint,
): bigint => {
  if (stakeIn <= 0n) return 0n;
  const k = reserveYes * reserveNo;
  if (side === Side.YES) {
    const newReserveNo = reserveNo + stakeIn;
    const newReserveYes = divCeil(k, newReserveNo);
    return reserveYes - newReserveYes;
  }
  const newReserveYes = reserveYes + stakeIn;
  const newReserveNo = divCeil(k, newReserveYes);
  return reserveNo - newReserveNo;
};
