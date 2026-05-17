import {
  type Ledger,
  type OptionState,
  Side,
  Status,
} from "./managed/cocoa/contract/index.js";

export type CocoaOptionState = {
  optionId: bigint;
  label: string;
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
  /** YES probability implied by the CPMM: reserveNo / (reserveYes + reserveNo). */
  priceYes: number;
};

/** UI-friendly snapshot of the public ledger. */
export type CocoaState = {
  question: string;
  resolutionRules: string;
  resolutionSource: string;
  closeTime: bigint;
  oraclePubKey: Uint8Array;
  optionCount: bigint;
  unresolvedOptionCount: bigint;
  options: CocoaOptionState[];
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

const decodeOptionState = (
  optionId: bigint,
  option: OptionState,
): CocoaOptionState => {
  const total = Number(option.reserveYes + option.reserveNo);
  return {
    optionId,
    label: option.label,
    reserveYes: option.reserveYes,
    reserveNo: option.reserveNo,
    pool: option.pool,
    volume: option.volume,
    totalYesStake: option.totalYesStake,
    totalNoStake: option.totalNoStake,
    status: option.status,
    outcome: option.status === Status.RESOLVED ? option.outcome : null,
    proposedOutcome: option.proposedAt > 0n ? option.proposedOutcome : null,
    proposedAt: option.proposedAt,
    proposalDeadline: option.proposalDeadline,
    oracleDisputed: option.oracleDisputed !== 0n,
    oracleFinalized: option.oracleFinalized !== 0n,
    priceYes: total === 0 ? 0.5 : Number(option.reserveNo) / total,
  };
};

/** Project the on-chain ledger into a UI-friendly snapshot. */
export const decodeCocoaState = (l: Ledger): CocoaState => {
  const options = [...l.options]
    .map(([optionId, option]) => decodeOptionState(optionId, option))
    .sort((a, b) => Number(a.optionId - b.optionId));
  const primary =
    options[0] ??
    decodeOptionState(0n, {
      label: "Outcome",
      reserveYes: 0n,
      reserveNo: 0n,
      pool: 0n,
      volume: 0n,
      totalYesStake: 0n,
      totalNoStake: 0n,
      status: l.status,
      outcome: Side.NO,
      proposedOutcome: Side.NO,
      proposedAt: 0n,
      proposalDeadline: 0n,
      oracleDisputed: 0n,
      oracleFinalized: 0n,
    });
  return {
    question: l.question,
    resolutionRules: l.resolutionRules,
    resolutionSource: l.resolutionSource,
    closeTime: l.closeTime,
    oraclePubKey: l.oraclePubKey,
    optionCount: l.optionCount,
    unresolvedOptionCount: l.unresolvedOptionCount,
    options,
    reserveYes: primary.reserveYes,
    reserveNo: primary.reserveNo,
    pool: primary.pool,
    volume: primary.volume,
    totalYesStake: primary.totalYesStake,
    totalNoStake: primary.totalNoStake,
    status: l.status,
    outcome: primary.outcome,
    proposedOutcome: primary.proposedOutcome,
    proposedAt: primary.proposedAt,
    proposalDeadline: primary.proposalDeadline,
    oracleDisputed: primary.oracleDisputed,
    oracleFinalized: primary.oracleFinalized,
    positionCount: l.positions.size(),
    nullifierCount: l.nullifiers.size(),
    priceYes: primary.priceYes,
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
