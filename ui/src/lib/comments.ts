/**
 * Per-market comment thread, stored entirely on IPFS via Pinata.
 *
 * Each comment is a small signed JSON document pinned to Pinata and tagged
 * with the market address as a keyvalue. The thread is rebuilt by listing
 * pins for that market, fetching each document through the gateway, and
 * keeping only those whose signature verifies and whose declared market
 * matches both the route and the Pinata tag. Image/file attachments are a
 * second pin the comment points at by CID.
 */

import {
  APP_TAG,
  fetchJson,
  gatewayUrl,
  isPinataConfigured,
  listMarketPins,
  pinFile,
  pinJson,
  unpin,
} from "./pinata";
import {
  type Identity,
  fingerprintOf,
  getOrCreateIdentity,
  sign,
  verify,
} from "./identity";

export { isPinataConfigured, gatewayUrl };

export const MAX_BODY = 2000;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export type CommentAuthor = {
  readonly handle: string;
  /** Base64 raw P-256 public key. */
  readonly pubKey: string;
};

export type CommentAttachment = {
  readonly cid: string;
  readonly mime: string;
  readonly name: string;
  readonly size: number;
};

export type CommentPayload = {
  readonly v: 1;
  readonly kind: "cocoa.comment";
  readonly market: string;
  readonly parent: string | null;
  readonly author: CommentAuthor;
  readonly body: string;
  readonly attachment: CommentAttachment | null;
  readonly createdAt: number;
  readonly nonce: string;
};

export type SignedComment = CommentPayload & { readonly sig: string };

export type Comment = SignedComment & {
  /** CID of the pinned comment document. */
  readonly cid: string;
  readonly fingerprint: string;
};

const encoder = new TextEncoder();

/**
 * Deterministic JSON with recursively sorted object keys. Two clients must
 * produce byte-identical output for the same payload so signatures verify.
 */
export const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonicalize(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
};

const payloadBytes = (payload: CommentPayload): Uint8Array =>
  encoder.encode(canonicalize(payload));

const randomNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Structural validation of an untrusted document fetched from the gateway. */
const looksLikeSignedComment = (
  doc: unknown,
  market: string,
): doc is SignedComment => {
  if (!isObject(doc)) return false;
  if (doc.v !== 1 || doc.kind !== "cocoa.comment") return false;
  if (doc.market !== market) return false;
  if (typeof doc.body !== "string" || doc.body.length > MAX_BODY) return false;
  if (typeof doc.createdAt !== "number") return false;
  if (typeof doc.nonce !== "string") return false;
  if (typeof doc.sig !== "string") return false;
  if (doc.parent !== null && typeof doc.parent !== "string") return false;
  const author = doc.author;
  if (
    !isObject(author) ||
    typeof author.handle !== "string" ||
    typeof author.pubKey !== "string"
  ) {
    return false;
  }
  const att = doc.attachment;
  if (att !== null) {
    if (
      !isObject(att) ||
      typeof att.cid !== "string" ||
      typeof att.mime !== "string" ||
      typeof att.name !== "string" ||
      typeof att.size !== "number"
    ) {
      return false;
    }
  }
  return true;
};

const stripSig = (signed: SignedComment): CommentPayload => {
  const { sig: _sig, ...payload } = signed;
  void _sig;
  return payload;
};

/** Verify a comment's signature against its embedded public key. */
export const verifyComment = async (
  signed: SignedComment,
): Promise<boolean> => {
  return verify(
    signed.author.pubKey,
    payloadBytes(stripSig(signed)),
    signed.sig,
  );
};

export type NewComment = {
  readonly market: string;
  readonly body: string;
  readonly file?: File | null;
};

const validateInput = ({ body, file }: NewComment): void => {
  const trimmed = body.trim();
  if (!trimmed && !file) {
    throw new Error("Write a message or attach a file.");
  }
  if (trimmed.length > MAX_BODY) {
    throw new Error(`Message is too long (max ${MAX_BODY} characters).`);
  }
  if (file) {
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      throw new Error("Attachment must be a PNG, JPEG, WebP, or GIF image.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachment is larger than 5 MB.");
    }
  }
};

/**
 * Build, sign, and pin a comment (uploading its attachment first). Returns
 * the resolved view-model so the UI can optimistically show it.
 */
export const publishComment = async (
  input: NewComment,
  identityOverride?: Identity,
): Promise<Comment> => {
  validateInput(input);
  const identity = identityOverride ?? (await getOrCreateIdentity());
  const { market, file } = input;
  const body = input.body.trim();

  let attachment: CommentAttachment | null = null;
  if (file) {
    const pinned = await pinFile(file, `attachment-${market}`, {
      app: APP_TAG,
      kind: "attachment",
      market,
    });
    attachment = {
      cid: pinned.cid,
      mime: file.type,
      name: file.name.slice(0, 120),
      size: pinned.size,
    };
  }

  const payload: CommentPayload = {
    v: 1,
    kind: "cocoa.comment",
    market,
    parent: null,
    author: { handle: identity.handle, pubKey: identity.pubKey },
    body,
    attachment,
    createdAt: Date.now(),
    nonce: randomNonce(),
  };
  const sig = await sign(identity, payloadBytes(payload));
  const signed: SignedComment = { ...payload, sig };

  const cid = await pinJson(signed, `comment-${market}-${payload.createdAt}`, {
    app: APP_TAG,
    kind: "comment",
    market,
    author: identity.fingerprint,
    ts: String(payload.createdAt),
  });

  return { ...signed, cid, fingerprint: identity.fingerprint };
};

/**
 * Rebuild a market's thread: list pins, fetch each document, drop anything
 * that fails structural validation or signature verification, sort oldest
 * first.
 */
export const loadComments = async (market: string): Promise<Comment[]> => {
  const pins = await listMarketPins(market);
  const results = await Promise.allSettled(
    pins.map(async (pin): Promise<Comment | null> => {
      // The pin's market tag must match the route before we even fetch.
      if (pin.keyvalues.market !== market) return null;
      const doc = await fetchJson<unknown>(pin.cid);
      if (!looksLikeSignedComment(doc, market)) return null;
      if (!(await verifyComment(doc))) return null;
      return {
        ...doc,
        cid: pin.cid,
        fingerprint: await fingerprintOf(doc.author.pubKey),
      };
    }),
  );

  const seen = new Set<string>();
  const comments: Comment[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    if (seen.has(r.value.cid)) continue;
    seen.add(r.value.cid);
    comments.push(r.value);
  }
  comments.sort(
    (a, b) => a.createdAt - b.createdAt || a.cid.localeCompare(b.cid),
  );
  return comments;
};

/** Unpin a comment (and its attachment) from our Pinata account. */
export const removeComment = async (comment: Comment): Promise<void> => {
  if (comment.attachment) {
    await unpin(comment.attachment.cid).catch(() => undefined);
  }
  await unpin(comment.cid);
};
