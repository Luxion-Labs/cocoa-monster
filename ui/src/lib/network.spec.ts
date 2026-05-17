import { afterEach, describe, expect, it, vi } from "vitest";

const loadConfig = async (runtimeConfig: Record<string, string> = {}) => {
  vi.resetModules();
  window.__COCOA_MONSTER_CONFIG__ = runtimeConfig;
  return (await import("./network")).cocoaConfig;
};

afterEach(() => {
  delete window.__COCOA_MONSTER_CONFIG__;
  vi.resetModules();
});

describe("cocoaConfig", () => {
  it("requires a network id", async () => {
    await expect(loadConfig({ VITE_NETWORK_ID: "" })).rejects.toThrow(
      "VITE_NETWORK_ID is required",
    );
  });

  it.each([
    [
      "preprod",
      "https://indexer.preprod.midnight.network/api/v4/graphql",
      "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
    ],
    [
      "preview",
      "https://indexer.preview.midnight.network/api/v4/graphql",
      "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    ],
    [
      "mainnet",
      "https://indexer.mainnet.midnight.network/api/v4/graphql",
      "wss://indexer.mainnet.midnight.network/api/v4/graphql/ws",
    ],
  ])("uses %s network defaults", async (networkId, indexerUri, indexerWsUri) => {
    const config = await loadConfig({ VITE_NETWORK_ID: networkId });

    expect(config.networkId).toBe(networkId);
    expect(config.indexerUri).toBe(indexerUri);
    expect(config.indexerWsUri).toBe(indexerWsUri);
  });

  it("rejects unsupported network ids", async () => {
    await expect(loadConfig({ VITE_NETWORK_ID: "devnet" })).rejects.toThrow(
      "Unsupported VITE_NETWORK_ID",
    );
  });
});
