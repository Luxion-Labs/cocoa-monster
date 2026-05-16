/**
 * Market discovery via the Midnight indexer. Queries for all deployed
 * Cocoa contracts so users can discover markets without manual address
 * sharing.
 */

import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  decodeCocoaState,
  ledger as readLedger,
  readMarketFactoryLedger,
} from "cocoa-contract";
import type { KnownMarket } from "./markets";
import { cocoaConfig } from "./network";
import { fetchOracleMarkets } from "./oracle";

export type DiscoveredMarket = KnownMarket & {
  readonly priceYes: number;
  readonly status: "OPEN" | "CLOSED" | "RESOLVED";
  readonly positionCount: bigint;
};

const isKnownMarket = (value: unknown): value is KnownMarket => {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Partial<KnownMarket>;
  return (
    typeof m.contractAddress === "string" &&
    typeof m.question === "string" &&
    (m.addedAt === undefined || typeof m.addedAt === "number")
  );
};

export const fetchRegistryMarkets = async (): Promise<KnownMarket[]> => {
  const registryUrl = import.meta.env.VITE_MARKET_REGISTRY_URL as
    | string
    | undefined;
  if (!registryUrl) return [];

  const response = await fetch(registryUrl);
  if (!response.ok) {
    throw new Error(`registry returned ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.markets;
  if (!Array.isArray(rows)) return [];

  const now = Date.now();
  return rows.filter(isKnownMarket).map((market) => ({
    contractAddress: market.contractAddress,
    question: market.question,
    addedAt: market.addedAt ?? now,
  }));
};

export const fetchFactoryMarkets = async (): Promise<KnownMarket[]> => {
  if (!cocoaConfig.marketFactoryAddress) return [];

  const query = `
    query GetFactoryState($address: HexEncoded!) {
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
      variables: { address: cocoaConfig.marketFactoryAddress },
    }),
  });

  if (!response.ok) {
    throw new Error(`factory registry returned ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`factory registry query failed: ${JSON.stringify(result.errors)}`);
  }

  const state = result?.data?.contractAction?.state;
  if (!state) return [];

  const ledger = readMarketFactoryLedger(state);
  return [...ledger.markets]
    .map(([contractAddress, info]) => ({
      contractAddress: Array.from(contractAddress, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      question: info.question,
      addedAt: Number(info.createdAt) * 1000,
    }))
    .sort((a, b) => b.addedAt - a.addedAt);
};

export const fetchSharedMarkets = async (): Promise<KnownMarket[]> => {
  const [factory, registry, oracle] = await Promise.allSettled([
    fetchFactoryMarkets(),
    fetchRegistryMarkets(),
    fetchOracleMarkets(),
  ]);
  const now = Date.now();
  const markets: KnownMarket[] = [];

  if (factory.status === "fulfilled") {
    markets.push(...factory.value);
  } else {
    console.warn("[discovery] Factory registry refresh failed:", factory.reason);
  }

  if (registry.status === "fulfilled") {
    markets.push(...registry.value);
  } else {
    console.warn("[discovery] Registry refresh failed:", registry.reason);
  }

  if (oracle.status === "fulfilled") {
    markets.push(
      ...oracle.value.map((market) => ({
        contractAddress: market.contractAddress,
        question: market.question,
        addedAt: market.addedAt ?? now,
      })),
    );
  } else {
    console.warn("[discovery] Oracle registry refresh failed:", oracle.reason);
  }

  return markets;
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
          status:
            state.status === 0
              ? "OPEN"
              : state.status === 1
                ? "CLOSED"
                : "RESOLVED",
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
