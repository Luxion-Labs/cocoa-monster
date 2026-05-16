import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  persistentHash,
  CompactTypeBytes,
  CompactTypeVector,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import { webcrypto } from "node:crypto";

import {
  Contract,
  type Ledger,
  ledger as readLedger,
  Side,
  Status,
} from "../managed/cocoa/contract/index.js";
import {
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

  constructor(opts: CocoaSimulatorOptions) {
    this.contract = new Contract<CocoaPrivateState>(witnesses);
    this.coinPublicKey = opts.coinPublicKey ?? ZERO_COIN_PUBLIC_KEY;
    this.secretKey = opts.secretKey ?? randomBytes32();
    this.positionNonce = opts.positionNonce ?? randomBytes32();
    this.oracleSecret = opts.oracleSecret ?? randomBytes32();
    this.oraclePubKey = computeOraclePubKey(this.oracleSecret);

    const initialPrivateState = createCocoaPrivateState(
      this.secretKey,
      this.positionNonce,
      this.oracleSecret,
    );

    const initial = this.contract.initialState(
      createConstructorContext(initialPrivateState, this.coinPublicKey),
      opts.question,
      opts.initialLiquidity,
      opts.closeTime,
      this.oraclePubKey,
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

  buy(side: Side, stakeIn: bigint, amountOut: bigint): bigint {
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: {
        ...this.circuitContext.currentPrivateState,
        positionNonce: randomBytes32(),
      },
    };
    const coin = {
      nonce: randomBytes32(),
      color: new Uint8Array(32), // nativeToken() — pad(32, "")
      value: stakeIn,
    };
    const result = this.contract.circuits.buy(
      this.circuitContext,
      side,
      amountOut,
      coin,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  resolve(side: Side, nowTs: bigint): void {
    const result = this.contract.circuits.resolve(
      this.circuitContext,
      side,
      nowTs,
    );
    this.circuitContext = result.context;
  }

  redeem(side: Side, amountOut: bigint): bigint {
    const result = this.contract.circuits.redeem(
      this.circuitContext,
      side,
      amountOut,
    );
    this.circuitContext = result.context;
    return result.result;
  }
}

export { Side, Status };
