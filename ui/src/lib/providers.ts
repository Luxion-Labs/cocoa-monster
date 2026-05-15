import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { getZswapNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { CoinInfo } from "@midnight-ntwrk/zswap";
import type {
  CocoaCircuitId,
  CocoaPrivateState,
  CocoaProviders,
} from "cocoa-contract";

import { cocoaConfig, ensureNetwork } from "./network";
import type { LaceConnection } from "./wallet";

/**
 * Build the full set of providers a connected wallet needs to deploy or
 * call the Cocoa contract: private state (LevelDB in browser),
 * indexer (live state stream), proof server (Docker container),
 * ZK config (fetched from the bundled `/zk-config/cocoa/`), and a wallet
 * provider that delegates balancing + submission back to Lace.
 *
 * The wallet's reported `serviceUriConfig` overrides our defaults, so the
 * dapp targets whichever indexer / proof server the user's wallet is on.
 */
export const buildCocoaProviders = (lace: LaceConnection): CocoaProviders => {
  ensureNetwork();
  const indexerUri = lace.serviceUriConfig.indexerUri ?? cocoaConfig.indexerUri;
  const indexerWsUri =
    lace.serviceUriConfig.indexerWsUri ?? cocoaConfig.indexerWsUri;
  const proofServerUri =
    lace.serviceUriConfig.proverServerUri ?? cocoaConfig.proofServerUri;

  return {
    privateStateProvider: levelPrivateStateProvider<"cocoa", CocoaPrivateState>(
      { privateStateStoreName: "cocoa-private-states" },
    ),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
    zkConfigProvider: new FetchZkConfigProvider<CocoaCircuitId>(
      cocoaConfig.zkConfigBaseUri,
      typeof window === "undefined" ? (fetch as typeof fetch) : window.fetch.bind(window),
    ),
    proofProvider: httpClientProofProvider(proofServerUri),
    walletProvider: {
      coinPublicKey: lace.walletState.coinPublicKey,
      encryptionPublicKey: lace.walletState.encryptionPublicKey,
      balanceTx: async (tx, newCoins: CoinInfo[]) => {
        const proven = await lace.api.balanceAndProveTransaction(
          tx as never,
          newCoins,
        );
        return proven as never;
      },
    },
    midnightProvider: {
      submitTx: (tx) => lace.api.submitTransaction(tx as never),
    },
  };
};
