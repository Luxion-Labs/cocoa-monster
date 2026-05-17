import { Ledger } from "./managed/cocoa/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Side } from "./managed/cocoa/contract/index.js";

export type CocoaPosition = {
  readonly optionId: bigint;
  readonly side: Side;
  readonly amount: bigint;
  readonly nonce: Uint8Array;
};

export type CocoaPrivateState = {
  readonly secretKey: Uint8Array;
  readonly positionNonce: Uint8Array;
  /**
   * Oracle secret. Non-empty only on devices owned by the market's oracle.
   * Other users keep this as a 32-byte zero buffer; the contract's
   * `resolve` circuit recomputes the public commitment and rejects if it
   * doesn't match the deployed `oraclePubKey`.
   */
  readonly oracleSecret: Uint8Array;
  readonly ownedPositions: readonly CocoaPosition[];
};

const ZERO_32 = new Uint8Array(32);

export const createCocoaPrivateState = (
  secretKey: Uint8Array,
  positionNonce: Uint8Array,
  oracleSecret: Uint8Array = ZERO_32,
  ownedPositions: readonly CocoaPosition[] = [],
): CocoaPrivateState => ({ secretKey, positionNonce, oracleSecret, ownedPositions });

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, CocoaPrivateState>): [
    CocoaPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  positionNonce: ({
    privateState,
  }: WitnessContext<Ledger, CocoaPrivateState>): [
    CocoaPrivateState,
    Uint8Array,
  ] => [privateState, privateState.positionNonce],

  oracleSecret: ({
    privateState,
  }: WitnessContext<Ledger, CocoaPrivateState>): [
    CocoaPrivateState,
    Uint8Array,
  ] => [privateState, privateState.oracleSecret],
};
