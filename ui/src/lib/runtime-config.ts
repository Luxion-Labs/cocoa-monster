export type RuntimeConfig = {
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_MARKET_FACTORY_ADDRESS?: string;
  /**
   * Pinata JWT used to pin market comments + attachments to IPFS. Embedded
   * client-side (no backend) — comment authenticity is enforced by signature
   * verification, not by trusting this key. Omit to disable discussion.
   */
  readonly VITE_PINATA_JWT?: string;
  /** Dedicated Pinata gateway host (e.g. "my-gw.mypinata.cloud"). */
  readonly VITE_PINATA_GATEWAY?: string;
  /** Optional access token for a restricted dedicated gateway. */
  readonly VITE_PINATA_GATEWAY_KEY?: string;
};

declare global {
  interface Window {
    __COCOA_MONSTER_CONFIG__?: RuntimeConfig;
  }
}

export const getRuntimeConfig = (): RuntimeConfig =>
  typeof window === "undefined" ? {} : (window.__COCOA_MONSTER_CONFIG__ ?? {});
