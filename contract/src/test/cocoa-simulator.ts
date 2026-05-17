import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  persistentHash,
  CompactTypeBytes,
  CompactTypeVector,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import { encodeUserAddress, sampleUserAddress } from "@midnight-ntwrk/ledger-v8";
import { webcrypto } from "node:crypto";

import {
  Contract,
  type Ledger,
  ledger as readLedger,
  Side,
  Status,
} from "../managed/cocoa/contract/index.js";
import {
  type CocoaPosition,
  type CocoaPrivateState,
  createCocoaPrivateState,
  witnesses,
} from "../witnesses.js";

const ZERO_COIN_PUBLIC_KEY = "0".repeat(64);

const randomBytes32 = (): Uint8Array => {
  const buf = new Uint8Array(32);
  webcrypto.getRandomValues(buf);
  return buf;
};

const ORACLE_DOMAIN_SEP = "cocoa:oracle:";

const padStringTo32 = (s: string): Uint8Array => {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > 32) throw new Error(`prefix "${s}" exceeds 32 bytes`);
  const buf = new Uint8Array(32);
  buf.set(bytes, 0);
  return buf;
};

const oracleDescriptor = new CompactTypeVector(2, new CompactTypeBytes(32));

/**
 * Compute the public commitment for an oracle secret. Mirrors the
 * `oracleCommitment` helper in cocoa.compact so the simulator can
 * pre-compute the value to feed into the constructor.
 */
export const computeOraclePubKey = (oracleSecret: Uint8Array): Uint8Array =>
  persistentHash(oracleDescriptor, [padStringTo32(ORACLE_DOMAIN_SEP), oracleSecret]);

export type CocoaSimulatorOptions = {
  question: string;
  options?: readonly string[];
  initialLiquidity: bigint;
  closeTime: bigint;
  /**
   * Optional oracle secret. The simulator hashes it to derive the
   * `oraclePubKey` registered on the contract. If omitted, a fresh
   * random secret is generated and exposed via {@link CocoaSimulator.oracleSecret}.
   */
  oracleSecret?: Uint8Array;
  secretKey?: Uint8Array;
  positionNonce?: Uint8Array;
  coinPublicKey?: string;
};

const MAX_OPTIONS = 8;
type PaddedOptions = [string, string, string, string, string, string, string, string];

const normalizeOptions = (options: readonly string[] | undefined): string[] => {
  const normalized = (options ?? ["Outcome"])
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  if (normalized.length === 0) throw new Error("at least one option is required");
  if (normalized.length > MAX_OPTIONS) throw new Error("too many options");
  return normalized;
};

const padOptions = (options: readonly string[]): PaddedOptions => {
  const padded = [
    ...options,
    ...Array.from({ length: MAX_OPTIONS - options.length }, () => ""),
  ];
  return padded as PaddedOptions;
};

/**
 * In-process simulator for the Cocoa contract that runs circuits without a
 * proof server. Used in unit tests to validate AMM math, oracle resolution,
 * and the position-commitment / nullifier privacy invariants.
 */
export class CocoaSimulator {
  private readonly contract: Contract<CocoaPrivateState>;
  private circuitContext: CircuitContext<CocoaPrivateState>;
  readonly secretKey: Uint8Array;
  readonly positionNonce: Uint8Array;
  readonly oracleSecret: Uint8Array;
  readonly oraclePubKey: Uint8Array;
  readonly coinPublicKey: string;
  private ownedPositions: CocoaPosition[] = [];

  constructor(opts: CocoaSimulatorOptions) {
    this.contract = new Contract<CocoaPrivateState>(witnesses);
    this.coinPublicKey = opts.coinPublicKey ?? ZERO_COIN_PUBLIC_KEY;
    this.secretKey = opts.secretKey ?? randomBytes32();
    this.positionNonce = opts.positionNonce ?? randomBytes32();
    this.oracleSecret = opts.oracleSecret ?? randomBytes32();
    this.oraclePubKey = computeOraclePubKey(this.oracleSecret);
    const optionLabels = normalizeOptions(opts.options);
    const paddedOptions = padOptions(optionLabels);

    const initialPrivateState = createCocoaPrivateState(
      this.secretKey,
      this.positionNonce,
      this.oracleSecret,
    );

    const initial = this.contract.initialState(
      createConstructorContext(initialPrivateState, this.coinPublicKey),
      opts.question,
      "Resolve according to the source.",
      "https://example.com",
      opts.initialLiquidity,
      opts.closeTime,
      this.oraclePubKey,
      BigInt(optionLabels.length),
      ...paddedOptions,
    );

    const address = sampleContractAddress();
    this.circuitContext = createCircuitContext<CocoaPrivateState>(
      address,
      this.coinPublicKey,
      initial.currentContractState,
      initial.currentPrivateState,
    );
  }

  /** Replace the oracle secret in private state (e.g. simulate a non-oracle caller). */
  setOracleSecret(secret: Uint8Array): void {
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: {
        ...this.circuitContext.currentPrivateState,
        oracleSecret: secret,
      },
    };
  }

  ledger(): Ledger {
    return readLedger(this.circuitContext.currentQueryContext.state);
  }

  option(optionId = 0n) {
    return this.ledger().options.lookup(optionId);
  }

  buy(
    side: Side,
    stakeIn: bigint,
    amountOut: bigint,
    nowTs = this.ledger().closeTime - 1n,
    optionId = 0n,
  ): bigint {
    const positionNonce = randomBytes32();
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: {
        ...this.circuitContext.currentPrivateState,
        positionNonce,
      },
    };
    const result = this.contract.circuits.buy(
      this.circuitContext,
      optionId,
      side,
      amountOut,
      stakeIn,
      nowTs,
    );
    this.circuitContext = result.context;
    this.ownedPositions.push({ optionId, side, amount: result.result, nonce: positionNonce });
    return result.result;
  }

  close(nowTs: bigint): void {
    const result = this.contract.circuits.close(this.circuitContext, nowTs);
    this.circuitContext = result.context;
  }

  proposeOutcome(side: Side, nowTs: bigint, disputeWindowSeconds: bigint, optionId = 0n): void {
    const result = this.contract.circuits.proposeOutcome(
      this.circuitContext,
      optionId,
      side,
      nowTs,
      disputeWindowSeconds,
    );
    this.circuitContext = result.context;
  }

  disputeOutcome(nowTs: bigint, optionId = 0n): void {
    const result = this.contract.circuits.disputeOutcome(
      this.circuitContext,
      optionId,
      nowTs,
    );
    this.circuitContext = result.context;
  }

  finalizeOutcome(nowTs: bigint, optionId = 0n): void {
    const result = this.contract.circuits.finalizeOutcome(
      this.circuitContext,
      optionId,
      nowTs,
    );
    this.circuitContext = result.context;
  }

  resolve(side: Side, nowTs: bigint, optionId = 0n): void {
    const result = this.contract.circuits.resolve(
      this.circuitContext,
      optionId,
      side,
      nowTs,
    );
    this.circuitContext = result.context;
  }

  redeem(side: Side, amountOut: bigint, payout?: bigint, optionId = 0n): bigint {
    const option = this.option(optionId);
    const winningStake = option.outcome === Side.YES ? option.totalYesStake : option.totalNoStake;
    const payoutAmount = payout ?? (winningStake > 0n ? (amountOut * option.volume) / winningStake : 1n);
    const position = this.ownedPositions.find(
      (p) => p.optionId === optionId && p.side === side && p.amount === amountOut,
    );
    if (position) {
      this.circuitContext = {
        ...this.circuitContext,
        currentPrivateState: {
          ...this.circuitContext.currentPrivateState,
          positionNonce: position.nonce,
        },
      };
    }
    const result = this.contract.circuits.redeem(
      this.circuitContext,
      optionId,
      side,
      amountOut,
      payoutAmount,
      { bytes: encodeUserAddress(sampleUserAddress()) },
    );
    this.circuitContext = result.context;
    this.ownedPositions = this.ownedPositions.filter((p) => p !== position);
    return result.result;
  }
}

export { Side, Status };
