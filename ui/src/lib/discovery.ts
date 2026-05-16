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

const getProvider = () => 
  indexerPublicDataProvider(cocoaConfig.indexerUri, cocoaConfig.indexerWsUri);

export type DiscoveredMarket = KnownMarket & {
  readonly priceYes: number;
  readonly status: "OPEN" | "CLOSED" | "RESOLVED";
  readonly positionCount: bigint;
  readonly nullifierCount: bigint;
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

  const response = await fetch(registryUrl, { cache: "no-store" });
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

  try {
    const provider = getProvider();
    const state = await provider.queryContractState(cocoaConfig.marketFactoryAddress as never);
    if (!state) {
      console.warn("[discovery] Factory contract state not found");
      return [];
    }

    const ledger = readMarketFactoryLedger(state.data);
    const markets = [...ledger.markets]
      .map(([contractAddress, info]) => ({
        contractAddress: Array.from(contractAddress, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
        question: info.question,
        addedAt: Number(info.createdAt) * 1000,
      }))
      .sort((a, b) => b.addedAt - a.addedAt);

    console.log(`[discovery] Found ${markets.length} markets in factory registry`);
    return markets;
  } catch (error) {
    console.error("[discovery] Factory registry refresh failed:", error);
    return [];
  }
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
  const markets: DiscoveredMarket[] = [];
  const provider = getProvider();

  // Query each contract's current state
  for (const address of knownAddresses) {
    try {
      const stateResponse = await provider.queryContractState(address as never);
      if (!stateResponse) {
        console.warn(`[discovery] No state found for ${address}`);
        continue;
      }

      // Decode the contract state to verify it's a Cocoa contract
      const state = decodeCocoaState(readLedger(stateResponse.data));
      markets.push({
        contractAddress: address,
        question: state.question,
        addedAt: Number(state.closeTime) * 1000, // Fallback if not from factory
        priceYes: state.priceYes,
        status:
          state.status === 0 ? "OPEN" : state.status === 1 ? "CLOSED" : "RESOLVED",
        positionCount: state.positionCount,
        nullifierCount: state.nullifierCount,
      });
    } catch (error) {
      console.warn(`[discovery] Failed to decode state for ${address}:`, error);
    }
  }

  console.log(`[discovery] Fetched state for ${markets.length}/${knownAddresses.length} markets`);
  return markets;
};

/**
 * Merge discovered markets with locally known markets, preferring
 * local data when available (since it has the correct addedAt timestamp).
 * 
 * This keeps known markets (from local storage or factory) in the list
 * even if the indexer is lagging and hasn't discovered them yet.
 */
export const mergeWithLocalMarkets = (
  discovered: DiscoveredMarket[],
  local: KnownMarket[],
): DiscoveredMarket[] => {
  const merged = new Map<string, DiscoveredMarket>();

  // 1. Start with all local markets as placeholders
  for (const m of local) {
    merged.set(m.contractAddress, {
      ...m,
      priceYes: 0.5,
      status: "OPEN",
      positionCount: 0n,
      nullifierCount: 0n,
    });
  }

  // 2. Overwrite with live discovered state (and add any new markets from factory)
  for (const d of discovered) {
    const existing = merged.get(d.contractAddress);
    merged.set(d.contractAddress, {
      ...d,
      // Keep the local addedAt if we have it, otherwise use the discovered one
      addedAt: existing?.addedAt ?? d.addedAt,
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.addedAt - a.addedAt);
};
