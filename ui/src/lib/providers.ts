import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from "@midnight-ntwrk/compact-runtime";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type {
  FinalizedTransaction,
  TransactionId,
} from "@midnight-ntwrk/ledger-v8";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import type {
  CocoaCircuitId,
  CocoaPrivateState,
  CocoaProviders,
} from "cocoa-contract";

import { cocoaConfig, ensureNetwork } from "./network";
import type { LaceConnection } from "./wallet";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Hex string has odd length");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
};

/**
 * Build the full set of providers a Lace 4.x connection needs to deploy
 * or call the Cocoa contract on Midnight TestNet.
 *
 * The key adapter is the wallet/midnight provider pair: midnight-js
 * passes around `Transaction` instances from `@midnight-ntwrk/ledger-v8`,
 * but Lace's 4.x ConnectedAPI takes/returns hex-encoded strings. We
 * serialize on the way into Lace and deserialize on the way back so
 * midnight-js's downstream code keeps seeing typed objects.
 */
export const buildCocoaProviders = (lace: LaceConnection): CocoaProviders => {
  ensureNetwork();
  const indexerUri = lace.configuration.indexerUri ?? cocoaConfig.indexerUri;
  const indexerWsUri =
    lace.configuration.indexerWsUri ?? cocoaConfig.indexerWsUri;
  // Use whichever URL is configured in `cocoaConfig` (Midnight's public
  // preprod proof-server by default; see network.ts). Lace's deprecated
  // `proverServerUri` is ignored — the wallet now does its own proving
  // inside `balanceUnsealedTransaction` via `getProvingProvider`.
  const proofServerUri = cocoaConfig.proofServerUri;

  const zkConfigProvider = new FetchZkConfigProvider<CocoaCircuitId>(
    cocoaConfig.zkConfigBaseUri,
    typeof window === "undefined"
      ? (fetch as typeof fetch)
      : window.fetch.bind(window),
  );

  return {
    privateStateProvider: levelPrivateStateProvider<"cocoa", CocoaPrivateState>(
      {
        // Scope storage to this wallet. The accountId is hashed before
        // use so the bech32 address is fine to drop in directly.
        accountId: lace.coinPublicKey,
        // Cocoa never holds anything secret on its own — the wallet is
        // the source of truth — so we use a fixed password derived from
        // the dapp identity. Replace this with a user-provided password
        // for production deployments where the device might be shared.
        privateStoragePasswordProvider: async () =>
          "cocoa-monster-static-storage-password-v1",
      },
    ),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => lace.coinPublicKey,
      getEncryptionPublicKey: () => lace.encryptionPublicKey,
      balanceTx: async (tx, _ttl) => {
        const serialized = toHex(tx.serialize());
        const result = await lace.connected.balanceUnsealedTransaction(
          serialized,
          { payFees: true },
        );
        // The wallet's `balanceUnsealedTransaction` returns a sealed,
        // signed, bound transaction → Transaction<SignatureEnabled, Proof, Binding>.
        return Transaction.deserialize(
          "signature",
          "proof",
          "binding",
          fromHex(result.tx),
        ) as FinalizedTransaction;
      },
    },
    midnightProvider: {
      submitTx: async (tx): Promise<TransactionId> => {
        const serialized = toHex(tx.serialize());
        await lace.connected.submitTransaction(serialized);
        // Lace 4.x returns void; derive the tx id locally so midnight-js's
        // downstream watchForTxData call has something to wait on.
        const ids = tx.identifiers();
        if (ids.length === 0) throw new Error("Transaction has no identifiers");
        return ids[0];
      },
    },
  };
};

const oracleDescriptor = new CompactTypeVector(2, new CompactTypeBytes(32));

const padStringTo32 = (s: string): Uint8Array => {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > 32) throw new Error(`prefix "${s}" exceeds 32 bytes`);
  const buf = new Uint8Array(32);
  buf.set(bytes, 0);
  return buf;
};

/** Mirror of the contract's `oracleCommitment` helper. */
export const computeOraclePubKey = (oracleSecret: Uint8Array): Uint8Array =>
  persistentHash(oracleDescriptor, [
    padStringTo32("cocoa:oracle:"),
    oracleSecret,
  ]);
