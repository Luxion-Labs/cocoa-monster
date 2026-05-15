import { Ledger } from "./managed/cocoa/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type CocoaPrivateState = {
  readonly secretKey: Uint8Array;
  readonly positionNonce: Uint8Array;
};

export const createCocoaPrivateState = (
  secretKey: Uint8Array,
  positionNonce: Uint8Array,
): CocoaPrivateState => ({ secretKey, positionNonce });

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
};
