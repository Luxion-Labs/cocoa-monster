import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from "@midnight-ntwrk/compact-runtime";
import {
  deployContract,
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

import {
  Contract,
  ledger as readLedger,
  Side,
  type Witnesses,
} from "./managed/cocoa/contract/index.js";
import { decodeCocoaState, type CocoaState } from "./quote.js";
import {
  type CocoaPosition,
  type CocoaPrivateState,
  createCocoaPrivateState,
  witnesses,
} from "./witnesses.js";

export type CocoaContract = Contract<CocoaPrivateState, Witnesses<CocoaPrivateState>>;
export type CocoaCircuitId = "buy" | "resolve" | "redeem";
export type CocoaProviders = MidnightProviders<CocoaCircuitId, "cocoa", CocoaPrivateState>;
export type CocoaDeployed = DeployedContract<CocoaContract>;
export type CocoaFound = FoundContract<CocoaContract>;

export const COCOA_PRIVATE_STATE_ID = "cocoa" as const;

const ZERO_32 = new Uint8Array(32);

const oracleDescriptor = new CompactTypeVector(2, new CompactTypeBytes(32));

const padStringTo32 = (s: string): Uint8Array => {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > 32) throw new Error(`prefix "${s}" exceeds 32 bytes`);
  const buf = new Uint8Array(32);
  buf.set(bytes, 0);
  return buf;
};

/** Compute the public commitment from an oracle secret. */
export const computeOraclePubKey = (oracleSecret: Uint8Array): Uint8Array =>
  persistentHash(oracleDescriptor, [
    padStringTo32("cocoa:oracle:"),
    oracleSecret,
  ]);

const randomBytes32 = (): Uint8Array => {
  const buf = new Uint8Array(32);
  // crypto.getRandomValues is universal across Node 18+ and the browser.
  (globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(buf);
  return buf;
};

export const cocoaContract: CocoaContract = new Contract(witnesses);

export type DeployCocoaMarketOptions = {
  question: string;
  initialLiquidity: bigint;
  closeTime: bigint;
  /**
   * Optional. If omitted a fresh oracle secret is generated and stored in
   * the deployer's private state — the deployer becomes the trusted oracle.
   * Pass an explicit secret to make a different party the oracle.
   */
  oracleSecret?: Uint8Array;
  secretKey?: Uint8Array;
  positionNonce?: Uint8Array;
};

/** Deploys a fresh Cocoa market and returns a wrapped API handle. */
export const deployCocoaMarket = async (
  providers: CocoaProviders,
  opts: DeployCocoaMarketOptions,
): Promise<CocoaApi> => {
  const oracleSecret = opts.oracleSecret ?? randomBytes32();
  const oraclePubKey = computeOraclePubKey(oracleSecret);
  const initialPrivateState = createCocoaPrivateState(
    opts.secretKey ?? randomBytes32(),
    opts.positionNonce ?? randomBytes32(),
    oracleSecret,
  );
  const deployed = await deployContract<CocoaContract>(providers, {
    contract: cocoaContract,
    privateStateId: COCOA_PRIVATE_STATE_ID,
    initialPrivateState,
    args: [
      opts.question,
      opts.initialLiquidity,
      opts.closeTime,
      oraclePubKey,
    ],
  });
  return new CocoaApi(providers, deployed);
};

/** Joins an existing deployed Cocoa market. */
export const joinCocoaMarket = async (
  providers: CocoaProviders,
  contractAddress: string,
  opts: {
    secretKey?: Uint8Array;
    positionNonce?: Uint8Array;
    /** Set if this device is the oracle's. */
    oracleSecret?: Uint8Array;
  } = {},
): Promise<CocoaApi> => {
  const existing = await providers.privateStateProvider.get(
    COCOA_PRIVATE_STATE_ID,
  );
  const initialPrivateState =
    existing ??
    createCocoaPrivateState(
      opts.secretKey ?? randomBytes32(),
      opts.positionNonce ?? randomBytes32(),
      opts.oracleSecret ?? ZERO_32,
    );
  const found = await findDeployedContract<CocoaContract>(providers, {
    contract: cocoaContract,
    contractAddress,
    privateStateId: COCOA_PRIVATE_STATE_ID,
    initialPrivateState,
  });
  return new CocoaApi(providers, found);
};

/**
 * Wraps a deployed Cocoa contract with typed buy / resolve / redeem
 * operations and a `state$` observable that decodes each on-chain update
 * into a UI-friendly snapshot.
 */
export class CocoaApi {
  readonly contractAddress: string;
  readonly state$: Observable<CocoaState>;

  constructor(
    readonly providers: CocoaProviders,
    readonly deployed: CocoaFound,
  ) {
    this.contractAddress = deployed.deployTxData.public.contractAddress;
    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.contractAddress, { type: "latest" })
      .pipe(map((cs) => decodeCocoaState(readLedger(cs.data))));
  }

  /** Place a bet on the market. Returns the recorded position so it can be redeemed later. */
  async buy(
    side: Side,
    collateralIn: bigint,
    amountOut: bigint,
  ): Promise<CocoaPosition> {
    const nonce = randomBytes32();
    await this.rotateNonce(nonce);
    await this.deployed.callTx.buy(side, collateralIn, amountOut);
    const position: CocoaPosition = { side, amount: amountOut, nonce };
    await this.appendOwnedPosition(position);
    return position;
  }

  /**
   * Resolve the market. Only succeeds if the calling device's private
   * state holds the oracle secret matching the `oraclePubKey` recorded
   * at deploy time.
   */
  async resolve(side: Side, nowTs: bigint): Promise<void> {
    await this.deployed.callTx.resolve(side, nowTs);
  }

  /** Redeems a winning position. The position must have been recorded via {@link buy}. */
  async redeem(position: CocoaPosition): Promise<bigint> {
    await this.rotateNonce(position.nonce);
    const result = await this.deployed.callTx.redeem(
      position.side,
      position.amount,
    );
    await this.markPositionRedeemed(position);
    return result.private.result;
  }

  /** List the positions this wallet currently owns and could redeem. */
  async ownedPositions(): Promise<readonly CocoaPosition[]> {
    const ps = await this.providers.privateStateProvider.get(
      COCOA_PRIVATE_STATE_ID,
    );
    return ps?.ownedPositions ?? [];
  }

  /** True if this device's private state holds the oracle secret for this market. */
  async isOracle(): Promise<boolean> {
    const ps = await this.providers.privateStateProvider.get(
      COCOA_PRIVATE_STATE_ID,
    );
    if (!ps) return false;
    if (ps.oracleSecret.every((b) => b === 0)) return false;
    const expected = computeOraclePubKey(ps.oracleSecret);
    const onchain = readLedger(
      (await this.providers.publicDataProvider.queryContractState(
        this.contractAddress,
      ))!.data,
    ).oraclePubKey;
    if (expected.length !== onchain.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== onchain[i]) return false;
    }
    return true;
  }

  private async rotateNonce(nonce: Uint8Array): Promise<void> {
    const ps = await this.providers.privateStateProvider.get(
      COCOA_PRIVATE_STATE_ID,
    );
    if (!ps) return;
    await this.providers.privateStateProvider.set(COCOA_PRIVATE_STATE_ID, {
      ...ps,
      positionNonce: nonce,
    });
  }

  private async appendOwnedPosition(position: CocoaPosition): Promise<void> {
    const ps = await this.providers.privateStateProvider.get(
      COCOA_PRIVATE_STATE_ID,
    );
    if (!ps) return;
    await this.providers.privateStateProvider.set(COCOA_PRIVATE_STATE_ID, {
      ...ps,
      ownedPositions: [...ps.ownedPositions, position],
    });
  }

  private async markPositionRedeemed(position: CocoaPosition): Promise<void> {
    const ps = await this.providers.privateStateProvider.get(
      COCOA_PRIVATE_STATE_ID,
    );
    if (!ps) return;
    await this.providers.privateStateProvider.set(COCOA_PRIVATE_STATE_ID, {
      ...ps,
      ownedPositions: ps.ownedPositions.filter(
        (p) => p.nonce !== position.nonce,
      ),
    });
  }
}
