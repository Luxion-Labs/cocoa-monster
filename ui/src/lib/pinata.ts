/**
 * Minimal browser-side Pinata client.
 *
 * There is no backend in this project, so the Pinata JWT is embedded in the
 * client (see runtime-config). That key is therefore extractable — comment
 * authenticity is enforced by signature verification in `comments.ts`, not by
 * trusting Pinata. This module only knows how to pin/list/fetch/unpin.
 *
 * We use Pinata's legacy pinning API (`pinFileToIPFS`, `pinJSONToIPFS`,
 * `data/pinList`, `unpin`) because it is stable, CORS-enabled for browser
 * use with a JWT, and supports the keyvalue-filtered listing we rely on to
 * rebuild a per-market thread.
 */

import { getRuntimeConfig } from "./runtime-config";

const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PIN_LIST_URL = "https://api.pinata.cloud/data/pinList";
const UNPIN_URL = "https://api.pinata.cloud/pinning/unpin";
const PUBLIC_GATEWAY = "https://gateway.pinata.cloud";

export const APP_TAG = "cocoa.monster";

type PinataConfig = {
  readonly jwt: string;
  readonly gateway: string;
  readonly gatewayKey?: string;
};

const env = (key: string): string | undefined => {
  // Match network.ts: prefer injected runtime config, fall back to Vite env
  // vars in dev so a local `.env` works.
  const fromRuntime = (getRuntimeConfig() as Record<string, unknown>)[key];
  if (typeof fromRuntime === "string" && fromRuntime.trim()) {
    return fromRuntime.trim();
  }
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)[key]
      : undefined;
  return fromVite?.trim() || undefined;
};

const stripProtocol = (host: string): string =>
  host.replace(/^https?:\/\//, "").replace(/\/+$/, "");

const readConfig = (): PinataConfig | null => {
  const jwt = env("VITE_PINATA_JWT");
  if (!jwt) return null;
  const gatewayRaw = env("VITE_PINATA_GATEWAY");
  const gateway = gatewayRaw
    ? `https://${stripProtocol(gatewayRaw)}`
    : PUBLIC_GATEWAY;
  return { jwt, gateway, gatewayKey: env("VITE_PINATA_GATEWAY_KEY") };
};

export const isPinataConfigured = (): boolean => readConfig() !== null;

const requireConfig = (): PinataConfig => {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "Pinata is not configured. Set VITE_PINATA_JWT (and optionally VITE_PINATA_GATEWAY).",
    );
  }
  return config;
};

const authHeaders = (config: PinataConfig): HeadersInit => ({
  Authorization: `Bearer ${config.jwt}`,
});

export type PinKeyValues = Readonly<Record<string, string>>;

export type PinnedFile = {
  readonly cid: string;
  readonly size: number;
  readonly datePinned: string;
  readonly keyvalues: PinKeyValues;
};

const errorText = async (res: Response): Promise<string> => {
  try {
    const body = await res.text();
    return body ? `: ${body.slice(0, 300)}` : "";
  } catch {
    return "";
  }
};

/** Pin an arbitrary JSON document; returns its CID. */
export const pinJson = async (
  content: unknown,
  name: string,
  keyvalues: PinKeyValues,
): Promise<string> => {
  const config = requireConfig();
  const res = await fetch(PIN_JSON_URL, {
    method: "POST",
    headers: { ...authHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name, keyvalues },
    }),
  });
  if (!res.ok) {
    throw new Error(`Pinata pinJSON failed (${res.status})${await errorText(res)}`);
  }
  const json = (await res.json()) as { IpfsHash?: string };
  if (!json.IpfsHash) throw new Error("Pinata pinJSON returned no IpfsHash");
  return json.IpfsHash;
};

/** Pin a binary file; returns its CID and pinned size. */
export const pinFile = async (
  file: File,
  name: string,
  keyvalues: PinKeyValues,
): Promise<{ cid: string; size: number }> => {
  const config = requireConfig();
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("pinataMetadata", JSON.stringify({ name, keyvalues }));
  // Do NOT set Content-Type; the browser must add the multipart boundary.
  const res = await fetch(PIN_FILE_URL, {
    method: "POST",
    headers: authHeaders(config),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Pinata pinFile failed (${res.status})${await errorText(res)}`);
  }
  const json = (await res.json()) as { IpfsHash?: string; PinSize?: number };
  if (!json.IpfsHash) throw new Error("Pinata pinFile returned no IpfsHash");
  return { cid: json.IpfsHash, size: json.PinSize ?? file.size };
};

const eqFilter = (value: string): string =>
  encodeURIComponent(JSON.stringify({ value, op: "eq" }));

/** List comment pins for a market, newest pin first. */
export const listMarketPins = async (
  market: string,
  pageLimit = 200,
): Promise<PinnedFile[]> => {
  const config = requireConfig();
  const query =
    `status=pinned&pageLimit=${pageLimit}` +
    `&metadata[keyvalues][app]=${eqFilter(APP_TAG)}` +
    `&metadata[keyvalues][kind]=${eqFilter("comment")}` +
    `&metadata[keyvalues][market]=${eqFilter(market)}`;
  const res = await fetch(`${PIN_LIST_URL}?${query}`, {
    headers: authHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Pinata pinList failed (${res.status})${await errorText(res)}`);
  }
  const json = (await res.json()) as {
    rows?: Array<{
      ipfs_pin_hash?: string;
      size?: number;
      date_pinned?: string;
      metadata?: { keyvalues?: Record<string, string> | null };
    }>;
  };
  return (json.rows ?? [])
    .filter((row): row is { ipfs_pin_hash: string } & typeof row =>
      Boolean(row.ipfs_pin_hash),
    )
    .map((row) => ({
      cid: row.ipfs_pin_hash,
      size: row.size ?? 0,
      datePinned: row.date_pinned ?? "",
      keyvalues: (row.metadata?.keyvalues ?? {}) as PinKeyValues,
    }));
};

/**
 * Unpin a CID from our Pinata account. Note: this only stops *our* account
 * from serving/announcing it — IPFS content may persist elsewhere.
 */
export const unpin = async (cid: string): Promise<void> => {
  const config = requireConfig();
  const res = await fetch(`${UNPIN_URL}/${cid}`, {
    method: "DELETE",
    headers: authHeaders(config),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Pinata unpin failed (${res.status})${await errorText(res)}`);
  }
};

/** Public gateway URL for a CID (used for <img> and JSON reads). */
export const gatewayUrl = (cid: string): string => {
  const config = readConfig();
  const base = config?.gateway ?? PUBLIC_GATEWAY;
  const token = config?.gatewayKey
    ? `?pinataGatewayToken=${encodeURIComponent(config.gatewayKey)}`
    : "";
  return `${base}/ipfs/${cid}${token}`;
};

// CIDs are immutable, so a fetched document never changes — cache forever.
const jsonCache = new Map<string, Promise<unknown>>();

export const fetchJson = async <T>(cid: string): Promise<T> => {
  const cached = jsonCache.get(cid);
  if (cached) return cached as Promise<T>;
  const promise = (async () => {
    const res = await fetch(gatewayUrl(cid));
    if (!res.ok) {
      throw new Error(`Gateway fetch failed for ${cid} (${res.status})`);
    }
    return res.json();
  })();
  jsonCache.set(cid, promise);
  try {
    return (await promise) as T;
  } catch (err) {
    jsonCache.delete(cid); // allow retry on transient gateway errors
    throw err;
  }
};
