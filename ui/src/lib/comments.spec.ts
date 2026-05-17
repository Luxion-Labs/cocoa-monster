import { beforeAll, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";

import { canonicalize, verifyComment, type SignedComment } from "./comments";
import { getOrCreateIdentity, sign } from "./identity";

// jsdom does not implement WebCrypto subtle; use Node's implementation.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
});

const encoder = new TextEncoder();

const signFixture = async (
  overrides: Partial<Omit<SignedComment, "sig" | "author">> = {},
): Promise<SignedComment> => {
  const id = await getOrCreateIdentity();
  const payload = {
    v: 1 as const,
    kind: "cocoa.comment" as const,
    market: "0xmarket",
    parent: null,
    author: { handle: id.handle, pubKey: id.pubKey },
    body: "gm",
    attachment: null,
    createdAt: 1_700_000_000_000,
    nonce: "fixed-nonce",
    ...overrides,
  };
  const sig = await sign(id, encoder.encode(canonicalize(payload)));
  return { ...payload, sig };
};

describe("canonicalize", () => {
  it("is independent of object key insertion order", () => {
    expect(canonicalize({ a: 1, b: { d: 4, c: 3 } })).toBe(
      canonicalize({ b: { c: 3, d: 4 }, a: 1 }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles null and nested structures", () => {
    expect(canonicalize({ x: null, y: [{ b: 2, a: 1 }] })).toBe(
      '{"x":null,"y":[{"a":1,"b":2}]}',
    );
  });
});

describe("verifyComment", () => {
  it("accepts an untampered signed comment", async () => {
    expect(await verifyComment(await signFixture())).toBe(true);
  });

  it("rejects a comment whose body was tampered after signing", async () => {
    const signed = await signFixture();
    expect(await verifyComment({ ...signed, body: "rugged" })).toBe(false);
  });

  it("rejects a comment whose market was swapped after signing", async () => {
    const signed = await signFixture();
    expect(await verifyComment({ ...signed, market: "0xother" })).toBe(false);
  });

  it("rejects a forged signature", async () => {
    const signed = await signFixture();
    expect(await verifyComment({ ...signed, sig: "AAAA" })).toBe(false);
  });
});
