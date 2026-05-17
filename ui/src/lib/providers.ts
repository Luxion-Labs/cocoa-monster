import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { createProofProvider } from "@midnight-ntwrk/midnight-js-types";
import type { KeyMaterialProvider } from "@midnight-ntwrk/midnight-js-types";
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

const logImbalances = (
  label: string,
  tx: { imbalances: (segment: number, fees?: bigint) => Map<unknown, bigint> },
): void => {
  try {
    const format = (m: Map<unknown, bigint>) =>
      Array.from(m.entries()).map(([token, amount]) => [
        typeof token === "object" ? JSON.stringify(token) : String(token),
        amount.toString(),
      ]);
    // eslint-disable-next-line no-console
    console.debug("[cocoa] tx imbalances", label, {
      segment0: format(tx.imbalances(0)),
      segment1: format(tx.imbalances(1)),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.debug("[cocoa] tx imbalance logging failed", label, error);
  }
};

const artifactBaseUri = (): string =>
  `${typeof window === "undefined" ? "http://localhost:5173" : window.location.origin}/midnight-artifacts`;

const artifactPreview = (bytes: Uint8Array): string => {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.slice(0, 40),
  );
  return text.replace(/\s+/g, " ").slice(0, 40);
};

const builtinArtifactPath = (
  circuitKeyLocation: string,
  ext: "prover" | "verifier" | "bzkir",
): string | null => {
  switch (circuitKeyLocation) {
    case "midnight/zswap/output":
      return `zswap/9/output.${ext}`;
    case "midnight/zswap/sign":
      return `zswap/9/sign.${ext}`;
    case "midnight/dust/spend":
      return `dust/9/spend.${ext}`;
    default:
      return null;
  }
};

const fetchBuiltinArtifact = async (
  circuitKeyLocation: string,
  ext: "prover" | "verifier" | "bzkir",
): Promise<Uint8Array | null> => {
  const path = builtinArtifactPath(circuitKeyLocation, ext);
  if (!path) return null;
  const url = `${artifactBaseUri()}/${path}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Failed to load ${circuitKeyLocation}.${ext} from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const preview = artifactPreview(bytes);
  if (preview.toLowerCase().includes("<!doctype html")) {
    throw new Error(
      `Loaded HTML instead of ${circuitKeyLocation}.${ext} from ${url}. Restart just dev so the /midnight-artifacts proxy is active.`,
    );
  }
  if (
    ext === "bzkir" &&
    !preview.startsWith("midnight:ir-source[v2]:")
  ) {
    throw new Error(
      `Invalid ZKIR for ${circuitKeyLocation} from ${url}: expected midnight:ir-source[v2]:, got ${JSON.stringify(preview)}`,
    );
  }
  return bytes;
};

const withKeyMaterialLogging = (
  keyMaterialProvider: KeyMaterialProvider,
): KeyMaterialProvider => ({
  getZKIR: async (circuitKeyLocation) => {
    try {
      const value =
        (await fetchBuiltinArtifact(circuitKeyLocation, "bzkir")) ??
        (await keyMaterialProvider.getZKIR(circuitKeyLocation));
      // eslint-disable-next-line no-console
      console.debug("[cocoa] loaded zkir", circuitKeyLocation, value.byteLength);
      return value;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[cocoa] failed to load zkir", circuitKeyLocation, error);
      throw error;
    }
  },
  getProverKey: async (circuitKeyLocation) => {
    try {
      const value =
        (await fetchBuiltinArtifact(circuitKeyLocation, "prover")) ??
        (await keyMaterialProvider.getProverKey(circuitKeyLocation));
      // eslint-disable-next-line no-console
      console.debug(
        "[cocoa] loaded prover key",
        circuitKeyLocation,
        value.byteLength,
      );
      return value;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        "[cocoa] failed to load prover key",
        circuitKeyLocation,
        error,
      );
      throw error;
    }
  },
  getVerifierKey: async (circuitKeyLocation) => {
    try {
      const value =
        (await fetchBuiltinArtifact(circuitKeyLocation, "verifier")) ??
        await keyMaterialProvider.getVerifierKey(circuitKeyLocation);
      // eslint-disable-next-line no-console
      console.debug(
        "[cocoa] loaded verifier key",
        circuitKeyLocation,
        value.byteLength,
      );
      return value;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        "[cocoa] failed to load verifier key",
        circuitKeyLocation,
        error,
      );
      throw error;
    }
  },
});

/**
 * Build read-only providers for viewing market state without a wallet connection.
 * This allows users to browse markets and see prices before connecting their wallet.
 */
export const buildReadOnlyProviders = (): Partial<CocoaProviders> => {
  ensureNetwork();
  
  const zkConfigProvider = new FetchZkConfigProvider<CocoaCircuitId>(
    cocoaConfig.zkConfigBaseUri,
    typeof window === "undefined"
      ? (fetch as typeof fetch)
      : window.fetch.bind(window),
  );

  return {
    publicDataProvider: indexerPublicDataProvider(
      cocoaConfig.indexerUri,
      cocoaConfig.indexerWsUri,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(cocoaConfig.proofServerUri, zkConfigProvider),
  };
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
    proofProvider: {
      proveTx: async (unprovenTx, proveTxConfig) => {
        const provingProvider = await lace.connected.getProvingProvider(
          withKeyMaterialLogging(zkConfigProvider.asKeyMaterialProvider()),
        );
        return createProofProvider(provingProvider).proveTx(
          unprovenTx,
          proveTxConfig,
        );
      },
    },
    walletProvider: {
      getCoinPublicKey: () => lace.coinPublicKey,
      getEncryptionPublicKey: () => lace.encryptionPublicKey,
      balanceTx: async (tx, _ttl) => {
        logImbalances("before wallet balance", tx);
        const serialized = toHex(tx.serialize());
        const result = await lace.connected.balanceUnsealedTransaction(
          serialized,
          { payFees: true },
        );
        // The wallet's `balanceUnsealedTransaction` returns a sealed,
        // signed, bound transaction → Transaction<SignatureEnabled, Proof, Binding>.
        const balanced = Transaction.deserialize(
          "signature",
          "proof",
          "binding",
          fromHex(result.tx),
        ) as FinalizedTransaction;
        logImbalances("after wallet balance", balanced);
        return balanced;
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
