#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
  createKeystore,
  mergeWalletEntries,
} from "@midnight-ntwrk/wallet-sdk";
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v8";

import { deployMarketFactory } from "../contract/dist/factory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class FileZkConfigProvider extends ZKConfigProvider {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
  }

  async readArtifact(kind, circuitId, ext) {
    return new Uint8Array(
      await readFile(path.join(this.baseDir, kind, `${circuitId}.${ext}`)),
    );
  }

  async getZKIR(circuitId) {
    return this.readArtifact("zkir", circuitId, "bzkir");
  }

  async getProverKey(circuitId) {
    return this.readArtifact("keys", circuitId, "prover");
  }

  async getVerifierKey(circuitId) {
    return this.readArtifact("keys", circuitId, "verifier");
  }
}

const env = (key, fallback) => process.env[key] ?? fallback;

const log = (message) => {
  process.stderr.write(`${new Date().toISOString()} ${message}\n`);
};

const parsePositiveInt = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
};

const withTimeout = async (promise, label, timeoutMs) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

const requiredEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const normalizeHex = (value, label) => {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return clean.toLowerCase();
};

const bytesFromHex = (value, label) => {
  const clean = normalizeHex(value, label);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const normalizeMnemonic = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");

const resolveSeedBytes = () => {
  const mnemonic = process.env.COCOA_FACTORY_MNEMONIC;
  if (mnemonic) {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized, englishWordlist)) {
      throw new Error("COCOA_FACTORY_MNEMONIC is not a valid BIP-39 English mnemonic");
    }
    return mnemonicToSeedSync(
      normalized,
      env("COCOA_FACTORY_MNEMONIC_PASSPHRASE", ""),
    );
  }

  return bytesFromHex(
    requiredEnv("COCOA_FACTORY_SEED_HEX"),
    "COCOA_FACTORY_SEED_HEX",
  );
};

const defaultRelayUrl = (networkId) => {
  if (networkId === "preprod") return "https://rpc.preprod.midnight.network";
  throw new Error("COCOA_RELAY_URL is required for non-preprod networks");
};

const loadState = async (stateFile) => {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
};

const writeState = async (stateFile, state) => {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
};

const deriveKeys = (seedBytes, accountIndex) => {
  const walletResult = HDWallet.fromSeed(seedBytes);
  if (walletResult.type !== "seedOk") {
    throw new Error(`failed to derive HD wallet: ${String(walletResult.error)}`);
  }

  const roles = [Roles.NightExternal, Roles.Dust, Roles.Zswap];
  const derivation = walletResult.hdWallet
    .selectAccount(accountIndex)
    .selectRoles(roles)
    .deriveKeysAt(0);
  walletResult.hdWallet.clear();

  if (derivation.type !== "keysDerived") {
    throw new Error(`failed to derive wallet roles: ${derivation.roles.join(", ")}`);
  }

  return {
    nightKey: derivation.keys[Roles.NightExternal],
    dustSecretKey: DustSecretKey.fromSeed(derivation.keys[Roles.Dust]),
    shieldedSecretKeys: ZswapSecretKeys.fromSeed(derivation.keys[Roles.Zswap]),
  };
};

const buildWalletFacade = async ({
  networkId,
  indexerUri,
  indexerWsUri,
  relayUrl,
  proofServerUri,
  privateStateDir,
  privateStatePassword,
  keys,
}) => {
  const configuration = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: indexerUri,
      indexerWsUrl: indexerWsUri,
    },
    relayURL: new URL(relayUrl),
    provingServerUrl: new URL(proofServerUri),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      WalletEntrySchema,
      mergeWalletEntries,
    ),
  };
  const keyStore = createKeystore(keys.nightKey, networkId);
  log("initializing wallet facade");
  const facade = await WalletFacade.init({
    configuration,
    shielded: (config) =>
      ShieldedWallet(config).startWithSecretKeys(keys.shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(keyStore)),
    dust: (config) =>
      DustWallet(config).startWithSecretKey(
        keys.dustSecretKey,
        LedgerParameters.initialParameters().dust,
      ),
  });
  try {
    log("wallet facade initialized");

    log("starting wallet facade");
    await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey);
    log("wallet facade started");

    const syncTimeoutMs = parsePositiveInt(
      env("COCOA_FACTORY_SYNC_TIMEOUT_MS", "300000"),
      "COCOA_FACTORY_SYNC_TIMEOUT_MS",
    );
    log(`waiting for wallet sync, timeout ${Math.round(syncTimeoutMs / 1000)}s`);
    const synced = await withTimeout(
      facade.waitForSyncedState(),
      "wallet sync",
      syncTimeoutMs,
    );
    log(`wallet synced for account ${synced.shielded.address}`);
    const zkConfigProvider = new FileZkConfigProvider(
      path.join(repoRoot, "contract/src/managed/factory"),
    );

    return {
      facade,
      accountId: synced.shielded.address,
      providers: {
        privateStateProvider: levelPrivateStateProvider({
          midnightDbName: path.join(privateStateDir, "midnight"),
          privateStateStoreName: "private-states",
          signingKeyStoreName: "signing-keys",
          accountId: synced.shielded.address,
          privateStoragePasswordProvider: async () => privateStatePassword,
        }),
        publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
        zkConfigProvider,
        proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
        walletProvider: {
          getCoinPublicKey: () => synced.shielded.coinPublicKey,
          getEncryptionPublicKey: () => synced.shielded.encryptionPublicKey,
          balanceTx: async (tx, ttl) => {
            const recipe = await facade.balanceUnboundTransaction(
              tx,
              {
                shieldedSecretKeys: keys.shieldedSecretKeys,
                dustSecretKey: keys.dustSecretKey,
              },
              {
                ttl: ttl ?? new Date(Date.now() + 60 * 60 * 1000),
                tokenKindsToBalance: "all",
              },
            );
            return facade.finalizeRecipe(recipe);
          },
        },
        midnightProvider: {
          submitTx: async (tx) => {
            await facade.submitTransaction(tx);
            const ids = tx.identifiers();
            if (ids.length === 0) throw new Error("Transaction has no identifiers");
            return ids[0];
          },
        },
      },
    };
  } catch (error) {
    await facade.stop();
    throw error;
  }
};

const main = async () => {
  const environment = env("COCOA_FACTORY_ENV", env("COCOA_ENV", "local"));
  const stateFile = path.resolve(
    env("COCOA_FACTORY_STATE_FILE", `.cocoa/factory-${environment}.json`),
  );
  const state = await loadState(stateFile);
  const existingAddress =
    process.env.COCOA_FACTORY_ADDRESS ||
    process.env.VITE_MARKET_FACTORY_ADDRESS ||
    state.contractAddress;

  if (existingAddress) {
    const contractAddress = normalizeHex(existingAddress, "factory address");
    process.stdout.write(
      `${JSON.stringify({ environment, contractAddress, stateFile, reused: true })}\n`,
    );
    return;
  }

  const networkId = env("VITE_NETWORK_ID", "preprod");
  const indexerUri = env(
    "VITE_INDEXER_URI",
    "https://indexer.preprod.midnight.network/api/v4/graphql",
  );
  const indexerWsUri = env(
    "VITE_INDEXER_WS_URI",
    "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  );
  const relayUrl = env("COCOA_RELAY_URL", defaultRelayUrl(networkId));
  const proofServerUri = env(
    "VITE_PROOF_SERVER_URI",
    "https://proof-server.preprod.midnight.network",
  );
  const privateStateDir = path.resolve(
    env("COCOA_FACTORY_PRIVATE_STATE_DIR", `.cocoa/private-state-${environment}`),
  );
  const privateStatePassword = env(
    "COCOA_FACTORY_PRIVATE_STATE_PASSWORD",
    `cocoa-monster-${environment}-factory-private-state`,
  );
  const accountIndex = Number.parseInt(env("COCOA_FACTORY_ACCOUNT_INDEX", "0"), 10);
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) {
    throw new Error("COCOA_FACTORY_ACCOUNT_INDEX must be a non-negative integer");
  }

  setNetworkId(networkId);
  log(`deploying cocoa factory for ${environment} on ${networkId}`);

  const keys = deriveKeys(resolveSeedBytes(), accountIndex);
  const { facade, providers, accountId } = await buildWalletFacade({
    networkId,
    indexerUri,
    indexerWsUri,
    relayUrl,
    proofServerUri,
    privateStateDir,
    privateStatePassword,
    keys,
  });

  try {
    const deployTimeoutMs = parsePositiveInt(
      env("COCOA_FACTORY_DEPLOY_TIMEOUT_MS", "900000"),
      "COCOA_FACTORY_DEPLOY_TIMEOUT_MS",
    );
    log(`submitting factory deployment, timeout ${Math.round(deployTimeoutMs / 1000)}s`);
    const factory = await withTimeout(
      deployMarketFactory(providers),
      "factory deployment",
      deployTimeoutMs,
    );
    log(`factory deployed at ${factory.contractAddress}`);
    const deployedState = {
      environment,
      networkId,
      contractAddress: factory.contractAddress,
      accountId,
      deployedAt: new Date().toISOString(),
    };
    await writeState(stateFile, deployedState);
    process.stdout.write(
      `${JSON.stringify({ ...deployedState, stateFile, reused: false })}\n`,
    );
  } finally {
    await facade.stop();
  }
};

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
