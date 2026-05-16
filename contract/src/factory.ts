import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  type ContractProviders,
  type DeployedContract,
  type FoundContract,
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { pipe } from "effect";

import {
  Contract as FactoryContractClass,
  ledger as readFactoryLedger,
  type Ledger as FactoryLedger,
  type Witnesses as FactoryWitnesses,
} from "./managed/factory/contract/index.js";

export type FactoryPrivateState = Record<string, never>;
export type MarketFactoryContract = FactoryContractClass<
  FactoryPrivateState,
  FactoryWitnesses<FactoryPrivateState>
>;
export type FactoryCircuitId = "registerMarket";
export type MarketFactoryProviders = ContractProviders<
  MarketFactoryContract,
  FactoryCircuitId,
  FactoryPrivateState
>;
export type MarketFactoryDeployed = DeployedContract<MarketFactoryContract>;
export type MarketFactoryFound = FoundContract<MarketFactoryContract>;

export type RegisteredMarket = {
  contractAddress: string;
  question: string;
  closeTime: bigint;
  oraclePubKey: Uint8Array;
  createdAt: bigint;
};

export const MARKET_FACTORY_PRIVATE_STATE_ID = "cocoa-market-factory" as const;

const emptyPrivateState = (): FactoryPrivateState => ({});

export const compiledMarketFactoryContract = pipe(
  CompiledContract.make<MarketFactoryContract, FactoryPrivateState>(
    "factory",
    FactoryContractClass as never,
  ),
);

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const hexToBytes32 = (hex: string): Uint8Array => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("expected a 32-byte hex address");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const decodeRegisteredMarkets = (ledger: FactoryLedger): RegisteredMarket[] =>
  [...ledger.markets].map(([address, info]) => ({
    contractAddress: bytesToHex(address),
    question: info.question,
    closeTime: info.closeTime,
    oraclePubKey: info.oraclePubKey,
    createdAt: info.createdAt,
  }));

export const deployMarketFactory = async (
  providers: MarketFactoryProviders,
): Promise<MarketFactoryApi> => {
  const deployed = await deployContract<MarketFactoryContract>(providers, {
    compiledContract: compiledMarketFactoryContract as never,
    privateStateId: MARKET_FACTORY_PRIVATE_STATE_ID,
    initialPrivateState: emptyPrivateState(),
  });
  return new MarketFactoryApi(providers, deployed);
};

export const joinMarketFactory = async (
  providers: MarketFactoryProviders,
  contractAddress: string,
): Promise<MarketFactoryApi> => {
  providers.privateStateProvider.setContractAddress(contractAddress as never);
  const found = await findDeployedContract<MarketFactoryContract>(providers, {
    compiledContract: compiledMarketFactoryContract as never,
    contractAddress: contractAddress as never,
    privateStateId: MARKET_FACTORY_PRIVATE_STATE_ID,
    initialPrivateState: emptyPrivateState(),
  });
  return new MarketFactoryApi(providers, found);
};

export const readMarketFactoryLedger = readFactoryLedger;

export class MarketFactoryApi {
  readonly contractAddress: string;

  constructor(
    readonly providers: MarketFactoryProviders,
    readonly deployed: MarketFactoryFound,
  ) {
    this.contractAddress = deployed.deployTxData.public.contractAddress;
  }

  async registerMarket(input: {
    contractAddress: string;
    question: string;
    closeTime: bigint;
    oraclePubKey: Uint8Array;
    createdAt?: bigint;
  }): Promise<void> {
    await this.deployed.callTx.registerMarket(
      hexToBytes32(input.contractAddress),
      input.question,
      input.closeTime,
      input.oraclePubKey,
      input.createdAt ?? BigInt(Math.floor(Date.now() / 1000)),
    );
  }

  async markets(): Promise<RegisteredMarket[]> {
    const state = await this.providers.publicDataProvider.queryContractState(
      this.contractAddress as never,
    );
    if (!state) return [];
    return decodeRegisteredMarkets(readFactoryLedger(state.data));
  }
}
