/**
 * Pseudonymous, device-local comment identity.
 *
 * The Midnight wallet connector (Lace) exposes no arbitrary message-signing
 * method, and binding comments to the shielded trading address would publicly
 * correlate a person's posts with their otherwise-private positions. So a
 * comment identity is a P-256 keypair generated and persisted *locally*,
 * separate from the wallet.
 *
 * Honest scope: with no backend and no registration, a signature proves
 * tamper-evidence and consistent authorship within a thread — it is NOT Sybil
 * resistance. Handles are claimable; the public-key fingerprint shown in the
 * UI is the real stable identifier.
 */

const STORAGE_KEY = "cocoa.identity";

const ADJECTIVES = [
  "amber", "salty", "brisk", "lunar", "cobalt", "fizzy", "nimble", "dusky",
  "velvet", "zesty", "stoic", "plucky", "rustic", "mellow", "crisp", "wily",
];
const NOUNS = [
  "cocoa", "otter", "comet", "maple", "heron", "quartz", "badger", "willow",
  "falcon", "pepper", "marlin", "cactus", "ferret", "almond", "raven", "lynx",
];

export type Identity = {
  /** Base64 raw (uncompressed) P-256 public key — the stable id. */
  readonly pubKey: string;
  /** User-facing display name; not unique, not verified. */
  readonly handle: string;
  /** Short hex fingerprint of the public key. */
  readonly fingerprint: string;
  readonly privateKey: CryptoKey;
};

type StoredIdentity = {
  readonly pubKey: string;
  readonly handle: string;
  readonly privateJwk: JsonWebKey;
};

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new Error(
      "WebCrypto is unavailable. Comments require a secure (https/localhost) context.",
    );
  }
  return s;
};

export const bytesToB64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await subtle().digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Short, deterministic fingerprint of a base64 public key. */
export const fingerprintOf = async (pubKeyB64: string): Promise<string> => {
  const hex = await sha256Hex(b64ToBytes(pubKeyB64));
  return hex.slice(0, 10);
};

/** Deterministic default handle derived from the fingerprint. */
const defaultHandle = (fingerprint: string): string => {
  const a = parseInt(fingerprint.slice(0, 2), 16) % ADJECTIVES.length;
  const n = parseInt(fingerprint.slice(2, 4), 16) % NOUNS.length;
  return `${ADJECTIVES[a]}-${NOUNS[n]}-${fingerprint.slice(0, 4)}`;
};

const ECDSA_KEY = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIG = { name: "ECDSA", hash: "SHA-256" } as const;

const safeStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readStored = (): StoredIdentity | null => {
  const raw = safeStorage()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (
      typeof parsed?.pubKey === "string" &&
      typeof parsed?.handle === "string" &&
      parsed?.privateJwk
    ) {
      return parsed;
    }
  } catch {
    /* fall through to regenerate */
  }
  return null;
};

let cached: Identity | null = null;

/** Load the device identity, generating + persisting one on first use. */
export const getOrCreateIdentity = async (): Promise<Identity> => {
  if (cached) return cached;

  const stored = readStored();
  if (stored) {
    const privateKey = await subtle().importKey(
      "jwk",
      stored.privateJwk,
      ECDSA_KEY,
      false,
      ["sign"],
    );
    cached = {
      pubKey: stored.pubKey,
      handle: stored.handle,
      fingerprint: await fingerprintOf(stored.pubKey),
      privateKey,
    };
    return cached;
  }

  const pair = await subtle().generateKey(ECDSA_KEY, true, ["sign", "verify"]);
  const rawPub = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  const pubKey = bytesToB64(rawPub);
  const privateJwk = await subtle().exportKey("jwk", pair.privateKey);
  const fingerprint = await fingerprintOf(pubKey);
  const handle = defaultHandle(fingerprint);

  safeStorage()?.setItem(
    STORAGE_KEY,
    JSON.stringify({ pubKey, handle, privateJwk } satisfies StoredIdentity),
  );

  cached = { pubKey, handle, fingerprint, privateKey: pair.privateKey };
  return cached;
};

export const setHandle = (handle: string): void => {
  const trimmed = handle.trim().slice(0, 32);
  if (!trimmed) return;
  const stored = readStored();
  if (!stored) return;
  safeStorage()?.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...stored, handle: trimmed } satisfies StoredIdentity),
  );
  if (cached) cached = { ...cached, handle: trimmed };
};

/** Sign bytes with the device private key; returns base64. */
export const sign = async (
  identity: Identity,
  data: Uint8Array,
): Promise<string> => {
  const sig = await subtle().sign(
    ECDSA_SIG,
    identity.privateKey,
    data as BufferSource,
  );
  return bytesToB64(new Uint8Array(sig));
};

/** Verify a base64 signature against a base64 raw public key. */
export const verify = async (
  pubKeyB64: string,
  data: Uint8Array,
  sigB64: string,
): Promise<boolean> => {
  try {
    const key = await subtle().importKey(
      "raw",
      b64ToBytes(pubKeyB64) as BufferSource,
      ECDSA_KEY,
      false,
      ["verify"],
    );
    return await subtle().verify(
      ECDSA_SIG,
      key,
      b64ToBytes(sigB64) as BufferSource,
      data as BufferSource,
    );
  } catch {
    return false;
  }
};

/** Stable HSL color for an avatar, derived from the fingerprint. */
export const avatarColor = (fingerprint: string): string => {
  const hue = parseInt(fingerprint.slice(0, 4) || "0", 16) % 360;
  return `hsl(${hue} 55% 45%)`;
};
