const appOrigin = (): string =>
  typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;

const oracleBaseUrl = (): string =>
  (import.meta.env.VITE_ORACLE_URL as string | undefined) ?? `${appOrigin()}/oracle-api`;

export type PreparedOracle = {
  readonly oracleId: string;
  readonly oraclePubKey: Uint8Array;
};

export type OracleOutcome = "YES" | "NO";
export type OracleStatus =
  | "OPEN"
  | "AWAITING_PROPOSAL"
  | "PROPOSED"
  | "DISPUTED"
  | "FINALIZED";

export type OracleMarket = {
  readonly contractAddress: string;
  readonly question: string;
  readonly closeTime: string;
  readonly oraclePubKey: string;
  readonly oracleStatus: OracleStatus;
  readonly registeredAt?: string;
  readonly proposedOutcome?: OracleOutcome;
  readonly proposedAt?: number;
  readonly proposalDeadline?: number;
  readonly proposer?: string;
  readonly evidenceUrl?: string;
  readonly disputedAt?: number;
  readonly disputer?: string;
  readonly disputeReason?: string;
  readonly finalOutcome?: OracleOutcome;
  readonly finalizedAt?: number;
  readonly resolutionRules?: string;
  readonly resolutionSource?: string;
  readonly disputeWindowSeconds?: number;
  readonly proposerBond?: string;
  readonly disputerBond?: string;
};

export type OracleResolution = {
  readonly outcome: OracleOutcome;
  readonly oracleSecret: Uint8Array;
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

const parseMarketPayload = (payload: { market?: unknown }): OracleMarket => {
  const market = payload.market as Partial<OracleMarket> | undefined;
  if (
    !market ||
    typeof market.contractAddress !== "string" ||
    typeof market.question !== "string" ||
    typeof market.oracleStatus !== "string"
  ) {
    throw new Error("Oracle returned an invalid market");
  }
  return market as OracleMarket;
};

export const prepareOracle = async (input: {
  question: string;
  closeTime: bigint;
  resolutionRules?: string;
  resolutionSource?: string;
}): Promise<PreparedOracle> => {
  const payload = await postJson<{ oracleId: string; oraclePubKey: string }>(
    "/oracle/prepare",
    {
      question: input.question,
      closeTime: input.closeTime.toString(),
      resolutionRules: input.resolutionRules,
      resolutionSource: input.resolutionSource,
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
  resolutionRules?: string;
  resolutionSource?: string;
}): Promise<void> => {
  await postJson("/oracle/markets", {
    oracleId: input.oracleId,
    contractAddress: input.contractAddress,
    question: input.question,
    closeTime: input.closeTime.toString(),
    resolutionRules: input.resolutionRules,
    resolutionSource: input.resolutionSource,
  });
};

export const fetchOracleMarket = async (
  contractAddress: string,
): Promise<OracleMarket | null> => {
  const response = await fetch(
    `${oracleBaseUrl()}/oracle/markets/${encodeURIComponent(contractAddress)}`,
  );
  if (response.status === 404) return null;
  const payload = (await response.json()) as { market?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `oracle market returned ${response.status}`);
  }
  return parseMarketPayload(payload);
};

export const proposeOracleOutcome = async (input: {
  contractAddress: string;
  outcome: OracleOutcome;
  evidenceUrl?: string;
  proposer?: string;
}): Promise<OracleMarket> =>
  parseMarketPayload(
    await postJson("/oracle/propose", {
      contractAddress: input.contractAddress,
      outcome: input.outcome,
      evidenceUrl: input.evidenceUrl,
      proposer: input.proposer,
    }),
  );

export const disputeOracleOutcome = async (input: {
  contractAddress: string;
  reason?: string;
  disputer?: string;
}): Promise<OracleMarket> =>
  parseMarketPayload(
    await postJson("/oracle/dispute", {
      contractAddress: input.contractAddress,
      reason: input.reason,
      disputer: input.disputer,
    }),
  );

export const finalizeOracleOutcome = async (
  contractAddress: string,
): Promise<OracleMarket> =>
  parseMarketPayload(await postJson("/oracle/finalize", { contractAddress }));

export const fetchOracleResolution = async (
  contractAddress: string,
): Promise<OracleResolution> => {
  const response = await fetch(
    `${oracleBaseUrl()}/oracle/markets/${encodeURIComponent(contractAddress)}/resolution`,
  );
  const payload = (await response.json()) as {
    outcome?: unknown;
    oracleSecret?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `oracle resolution returned ${response.status}`);
  }
  if (
    (payload.outcome !== "YES" && payload.outcome !== "NO") ||
    typeof payload.oracleSecret !== "string"
  ) {
    throw new Error("Oracle returned an invalid resolution");
  }
  return {
    outcome: payload.outcome,
    oracleSecret: hexToBytes(payload.oracleSecret),
  };
};

export const fetchOracleMarkets = async (): Promise<
  Array<{ contractAddress: string; question: string; addedAt?: number }>
> => {
  const response = await fetch(`${oracleBaseUrl()}/oracle/markets`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`oracle registry returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    markets?: Array<Partial<OracleMarket> & { createdAt?: unknown }>;
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
