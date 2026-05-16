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
 * Fetch current state for known markets from the indexer.
 * 
 * Since the Midnight Indexer v4 doesn't provide a "list all contracts" query,
 * we query each known market individually to get its current state.
 * 
 * @param knownAddresses Array of contract addresses to query
 * @throws Error if the indexer query fails
 */
export const fetchMarketStates = async (
  knownAddresses: string[],
): Promise<DiscoveredMarket[]> => {
  if (knownAddresses.length === 0) {
    return [];
  }

  const markets: DiscoveredMarket[] = [];

  // Query each contract's current state
  for (const address of knownAddresses) {
    try {
      const query = `
        query GetContractState($address: HexEncoded!) {
          contractAction(address: $address) {
            __typename
            address
            state
          }
        }
      `;

      const response = await fetch(cocoaConfig.indexerUri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: { address },
        }),
      });

      if (!response.ok) {
        console.warn(`[discovery] Failed to query ${address}: ${response.statusText}`);
        continue;
      }

      const result = await response.json();

      if (result.errors) {
        console.warn(`[discovery] GraphQL errors for ${address}:`, result.errors);
        continue;
      }

      const action = result?.data?.contractAction;
      if (!action || !action.state) {
        console.warn(`[discovery] No state found for ${address}`);
        continue;
      }

      try {
        // Decode the contract state to verify it's a Cocoa contract
        const state = decodeCocoaState(readLedger(action.state));
        markets.push({
          contractAddress: address,
          question: state.question,
          addedAt: Date.now(),
          priceYes: state.priceYes,
          status: state.status === 0 ? "OPEN" : "RESOLVED",
          positionCount: state.positionCount,
        });
      } catch (err) {
        console.warn(`[discovery] Failed to decode state for ${address}:`, err);
        continue;
      }
    } catch (err) {
      console.warn(`[discovery] Error querying ${address}:`, err);
      continue;
    }
  }

  console.log(`[discovery] Fetched state for ${markets.length}/${knownAddresses.length} markets`);
  return markets;
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
