const appOrigin = (): string =>
  typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;

const oracleBaseUrl = (): string =>
  (import.meta.env.VITE_ORACLE_URL as string | undefined) ?? `${appOrigin()}/oracle-api`;

export type PreparedOracle = {
  readonly oracleId: string;
  readonly oraclePubKey: Uint8Array;
};

const hexToBytes = (hex: string): Uint8Array => {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Oracle returned an invalid public key");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${oracleBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Oracle request failed: ${response.status}`);
  }
  return payload;
};

export const prepareOracle = async (input: {
  question: string;
  closeTime: bigint;
}): Promise<PreparedOracle> => {
  const payload = await postJson<{ oracleId: string; oraclePubKey: string }>(
    "/oracle/prepare",
    {
      question: input.question,
      closeTime: input.closeTime.toString(),
    },
  );
  return {
    oracleId: payload.oracleId,
    oraclePubKey: hexToBytes(payload.oraclePubKey),
  };
};

export const registerOracleMarket = async (input: {
  oracleId: string;
  contractAddress: string;
  question: string;
  closeTime: bigint;
}): Promise<void> => {
  await postJson("/oracle/markets", {
    oracleId: input.oracleId,
    contractAddress: input.contractAddress,
    question: input.question,
    closeTime: input.closeTime.toString(),
  });
};

export const fetchOracleMarkets = async (): Promise<
  Array<{ contractAddress: string; question: string; addedAt?: number }>
> => {
  const response = await fetch(`${oracleBaseUrl()}/oracle/markets`);
  if (!response.ok) {
    throw new Error(`oracle registry returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    markets?: Array<{
      contractAddress?: unknown;
      question?: unknown;
      registeredAt?: unknown;
      createdAt?: unknown;
    }>;
  };
  if (!Array.isArray(payload.markets)) return [];

  return payload.markets.flatMap((market) => {
    if (
      typeof market.contractAddress !== "string" ||
      typeof market.question !== "string"
    ) {
      return [];
    }
    const timestamp =
      typeof market.registeredAt === "string"
        ? Date.parse(market.registeredAt)
        : typeof market.createdAt === "string"
          ? Date.parse(market.createdAt)
          : Number.NaN;
    return [
      {
        contractAddress: market.contractAddress,
        question: market.question,
        addedAt: Number.isNaN(timestamp) ? undefined : timestamp,
      },
    ];
  });
};
