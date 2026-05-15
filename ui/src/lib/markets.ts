/**
 * Tracks markets the user has interacted with on this device. There is no
 * on-chain registry — Cocoa contracts are addressed individually — so the
 * frontend keeps a local "address book" so the user can return to markets
 * across page loads.
 */

const STORAGE_KEY = "cocoa.knownMarkets";

export type KnownMarket = {
  readonly contractAddress: string;
  readonly question: string;
  /** Timestamp the user first saw or deployed this market. */
  readonly addedAt: number;
};

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
    return parsed.filter(
      (m): m is KnownMarket =>
        typeof m === "object" &&
        m !== null &&
        typeof m.contractAddress === "string" &&
        typeof m.question === "string" &&
        typeof m.addedAt === "number",
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
