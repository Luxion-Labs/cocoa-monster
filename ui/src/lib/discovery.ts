/**
 * Market discovery via the Midnight indexer. Queries for all deployed
 * Cocoa contracts so users can discover markets without manual address
 * sharing.
 */

import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { decodeCocoaState, ledger as readLedger } from "cocoa-contract";
import type { KnownMarket } from "./markets";
import { cocoaConfig } from "./network";

export type DiscoveredMarket = KnownMarket & {
  readonly priceYes: number;
  readonly status: string;
  readonly positionCount: bigint;
};

/**
 * Query the indexer for all deployed Cocoa contracts. This scans the
 * blockchain for contract deployments and returns their current state.
 * 
 * Note: This is a simple implementation that queries recent contracts.
 * For production, you'd want to:
 * - Cache results
 * - Paginate through all contracts
 * - Filter by contract bytecode hash to identify Cocoa contracts specifically
 */
export const discoverMarkets = async (): Promise<DiscoveredMarket[]> => {
  try {
    const provider = indexerPublicDataProvider(
      cocoaConfig.indexerUri,
      cocoaConfig.indexerWsUri,
    );

    // Query for recent contract states. The indexer's GraphQL API
    // provides `contractStates` which returns all known contracts.
    // We'll fetch the most recent ones and decode their state.
    const query = `
      query RecentContracts {
        contractStates(first: 100, orderBy: BLOCK_HEIGHT_DESC) {
          nodes {
            contractAddress
            data
            blockHeight
          }
        }
      }
    `;

    const response = await fetch(cocoaConfig.indexerUri, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Indexer query failed: ${response.statusText}`);
    }

    const result = await response.json();
    const contracts = result?.data?.contractStates?.nodes ?? [];

    // Try to decode each contract as a Cocoa contract. If decoding
    // succeeds, it's likely a Cocoa market.
    const markets: DiscoveredMarket[] = [];
    
    for (const contract of contracts) {
      try {
        const state = decodeCocoaState(readLedger(contract.data));
        markets.push({
          contractAddress: contract.contractAddress,
          question: state.question,
          addedAt: Date.now(), // We don't have the actual deploy time
          priceYes: state.priceYes,
          status: state.status === 0 ? "OPEN" : "RESOLVED",
          positionCount: state.positionCount,
        });
      } catch {
        // Not a Cocoa contract or failed to decode — skip it
        continue;
      }
    }

    return markets;
  } catch (err) {
    console.error("[discovery] Failed to discover markets:", err);
    return [];
  }
};

/**
 * Merge discovered markets with locally known markets, preferring
 * local data when available (since it has the correct addedAt timestamp).
 */
export const mergeWithLocalMarkets = (
  discovered: DiscoveredMarket[],
  local: KnownMarket[],
): DiscoveredMarket[] => {
  const localMap = new Map(
    local.map((m) => [m.contractAddress, m]),
  );

  return discovered.map((d) => {
    const localMatch = localMap.get(d.contractAddress);
    return localMatch
      ? { ...d, addedAt: localMatch.addedAt }
      : d;
  });
};
