export type RuntimeConfig = {
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_MARKET_FACTORY_ADDRESS?: string;
};

declare global {
  interface Window {
    __COCOA_MONSTER_CONFIG__?: RuntimeConfig;
  }
}

export const getRuntimeConfig = (): RuntimeConfig =>
  typeof window === "undefined" ? {} : (window.__COCOA_MONSTER_CONFIG__ ?? {});
