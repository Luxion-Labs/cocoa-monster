/**
 * Tracks markets the user has interacted with on this device. There is no
 * on-chain registry — Cocoa contracts are addressed individually — so the
 * frontend keeps a local "address book" so the user can return to markets
 * across page loads.
 */

import { getRuntimeConfig } from "./runtime-config";

const STORAGE_KEY = "cocoa.knownMarkets";
const FACTORY_STORAGE_KEY = "cocoa.marketFactoryAddress";

export const MARKET_CATEGORIES = [
  "Crypto",
  "Politics",
  "Sports",
  "Culture",
  "Tech",
  "Markets",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export type KnownMarket = {
  readonly contractAddress: string;
  readonly question: string;
  readonly category?: MarketCategory;
  /** Timestamp the user first saw or deployed this market. */
  readonly addedAt: number;
};

const isMarketCategory = (value: unknown): value is MarketCategory =>
  typeof value === "string" &&
  (MARKET_CATEGORIES as readonly string[]).includes(value);

const safeStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const listKnownMarkets = (): KnownMarket[] => {
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is KnownMarket =>
          typeof m === "object" &&
          m !== null &&
          typeof m.contractAddress === "string" &&
          typeof m.question === "string" &&
          typeof m.addedAt === "number",
      )
      .map((m) =>
        isMarketCategory(m.category)
          ? { ...m, category: m.category }
          : {
              contractAddress: m.contractAddress,
              question: m.question,
              addedAt: m.addedAt,
            },
      );
  } catch {
    return [];
  }
};

export const rememberMarket = (market: KnownMarket): KnownMarket[] => {
  const storage = safeStorage();
  const existing = listKnownMarkets();
  const next = [
    market,
    ...existing.filter((m) => m.contractAddress !== market.contractAddress),
  ];
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const forgetMarket = (contractAddress: string): KnownMarket[] => {
  const storage = safeStorage();
  const next = listKnownMarkets().filter(
    (m) => m.contractAddress !== contractAddress,
  );
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const getMarketFactoryAddress = (): string | null => {
  const storage = safeStorage();
  const value = storage?.getItem(FACTORY_STORAGE_KEY)?.trim();
  if (value) return value;

  const configuredValue = getRuntimeConfig().VITE_MARKET_FACTORY_ADDRESS?.trim();
  return configuredValue || null;
};

export const setMarketFactoryAddress = (contractAddress: string | null): void => {
  const storage = safeStorage();
  if (!storage) return;
  const value = contractAddress?.trim();
  if (value) {
    storage.setItem(FACTORY_STORAGE_KEY, value);
  } else {
    storage.removeItem(FACTORY_STORAGE_KEY);
  }
};
