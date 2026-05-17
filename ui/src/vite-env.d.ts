/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKET_REGISTRY_URL?: string;
  readonly VITE_MARKET_FACTORY_ADDRESS?: string;
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_INDEXER_URI?: string;
  readonly VITE_INDEXER_WS_URI?: string;
  readonly VITE_PROOF_SERVER_URI?: string;
  readonly VITE_ZK_CONFIG_URI?: string;
}
