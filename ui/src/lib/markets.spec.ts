import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetMarket, listKnownMarkets, rememberMarket } from "./markets";

describe("markets address book", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(listKnownMarkets()).toEqual([]);
  });

  it("remembers a market and round-trips through localStorage", () => {
    rememberMarket({
      contractAddress: "0xabc",
      question: "Will it rain?",
      addedAt: 1,
    });
    expect(listKnownMarkets()).toEqual([
      { contractAddress: "0xabc", question: "Will it rain?", addedAt: 1 },
    ]);
  });

  it("dedupes by contractAddress, keeping the most-recent entry first", () => {
    rememberMarket({ contractAddress: "0xabc", question: "old", addedAt: 1 });
    rememberMarket({ contractAddress: "0xabc", question: "new", addedAt: 2 });
    expect(listKnownMarkets()).toEqual([
      { contractAddress: "0xabc", question: "new", addedAt: 2 },
    ]);
  });

  it("orders multiple markets newest-first", () => {
    rememberMarket({ contractAddress: "0xa", question: "a", addedAt: 1 });
    rememberMarket({ contractAddress: "0xb", question: "b", addedAt: 2 });
    expect(listKnownMarkets().map((m) => m.contractAddress)).toEqual([
      "0xb",
      "0xa",
    ]);
  });

  it("forgetMarket removes the entry", () => {
    rememberMarket({ contractAddress: "0xa", question: "a", addedAt: 1 });
    rememberMarket({ contractAddress: "0xb", question: "b", addedAt: 2 });
    forgetMarket("0xa");
    expect(listKnownMarkets().map((m) => m.contractAddress)).toEqual(["0xb"]);
  });

  it("ignores corrupt JSON in storage", () => {
    window.localStorage.setItem("cocoa.knownMarkets", "{not json");
    expect(listKnownMarkets()).toEqual([]);
  });

  it("filters out malformed entries", () => {
    window.localStorage.setItem(
      "cocoa.knownMarkets",
      JSON.stringify([
        { contractAddress: "0xa", question: "valid", addedAt: 1 },
        { contractAddress: 42, question: "wrong type", addedAt: 1 },
      ]),
    );
    expect(listKnownMarkets()).toHaveLength(1);
    expect(listKnownMarkets()[0].contractAddress).toBe("0xa");
  });
});
