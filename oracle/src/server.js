import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { computeOraclePubKey } from "cocoa-contract";

const host = process.env.ORACLE_HOST ?? "127.0.0.1";
const port = Number(process.env.ORACLE_PORT ?? "8787");
const dataDir = process.env.ORACLE_DATA_DIR ?? new URL("../data", import.meta.url).pathname;
const storePath = join(dataDir, "oracle-store.json");
const disputeWindowSeconds = Number(process.env.ORACLE_DISPUTE_WINDOW_SECONDS ?? "300");

const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex) => {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const emptyStore = () => ({ prepared: {}, markets: {} });

const nowSeconds = () => Math.floor(Date.now() / 1000);

const parseOutcome = (value) => {
  if (value === "YES" || value === "NO") return value;
  throw new Error("outcome must be YES or NO");
};

const oracleStatus = (market) => {
  if (market.finalizedAt) return "FINALIZED";
  if (market.disputedAt) return "DISPUTED";
  if (market.proposedAt) return "PROPOSED";
  const closeTime = Number(market.closeTime);
  return Number.isFinite(closeTime) && nowSeconds() >= closeTime
    ? "AWAITING_PROPOSAL"
    : "OPEN";
};

const publicMarket = ({ oracleSecret: _secret, ...market }) => ({
  ...market,
  oracleStatus: oracleStatus(market),
});

const requireMarket = (store, contractAddress) => {
  if (typeof contractAddress !== "string" || contractAddress.trim() === "") {
    throw new Error("contractAddress is required");
  }
  const market = store.markets[contractAddress];
  if (!market) throw new Error("unknown market");
  return market;
};

const loadStore = async () => {
  try {
    return JSON.parse(await readFile(storePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyStore();
    throw error;
  }
};

const saveStore = async (store) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const send = (response, status, body) => {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const route = async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/oracle/prepare") {
    const body = await readJson(request);
    if (typeof body.question !== "string" || body.question.trim() === "") {
      return send(response, 400, { error: "question is required" });
    }
    const secret = randomBytes(32);
    const oraclePubKey = computeOraclePubKey(secret);
    const oracleId = bytesToHex(randomBytes(16));
    const store = await loadStore();
    store.prepared[oracleId] = {
      oracleSecret: bytesToHex(secret),
      oraclePubKey: bytesToHex(oraclePubKey),
      question: body.question,
      closeTime: String(body.closeTime ?? ""),
      createdAt: new Date().toISOString(),
    };
    await saveStore(store);
    return send(response, 200, {
      oracleId,
      oraclePubKey: bytesToHex(oraclePubKey),
    });
  }

  if (request.method === "POST" && url.pathname === "/oracle/markets") {
    const body = await readJson(request);
    if (typeof body.oracleId !== "string" || typeof body.contractAddress !== "string") {
      return send(response, 400, { error: "oracleId and contractAddress are required" });
    }
    const store = await loadStore();
    const prepared = store.prepared[body.oracleId];
    if (!prepared) return send(response, 404, { error: "unknown oracleId" });
    store.markets[body.contractAddress] = {
      ...prepared,
      contractAddress: body.contractAddress,
      question: typeof body.question === "string" ? body.question : prepared.question,
      closeTime: String(body.closeTime ?? prepared.closeTime),
      registeredAt: new Date().toISOString(),
      disputeWindowSeconds,
    };
    await saveStore(store);
    return send(response, 200, { market: publicMarket(store.markets[body.contractAddress]) });
  }

  if (request.method === "GET" && url.pathname === "/oracle/markets") {
    const store = await loadStore();
    const markets = Object.values(store.markets).map(publicMarket);
    return send(response, 200, { markets });
  }

  const marketMatch = url.pathname.match(/^\/oracle\/markets\/([^/]+)$/);
  if (request.method === "GET" && marketMatch) {
    const store = await loadStore();
    const market = store.markets[decodeURIComponent(marketMatch[1])];
    if (!market) return send(response, 404, { error: "unknown market" });
    return send(response, 200, { market: publicMarket(market) });
  }

  if (request.method === "POST" && url.pathname === "/oracle/propose") {
    const body = await readJson(request);
    const store = await loadStore();
    let outcome;
    try {
      outcome = parseOutcome(body.outcome);
    } catch (error) {
      return send(response, 400, { error: error.message });
    }
    let market;
    try {
      market = requireMarket(store, body.contractAddress);
    } catch (error) {
      return send(response, error.message === "unknown market" ? 404 : 400, {
        error: error.message,
      });
    }
    if (market.finalizedAt) {
      return send(response, 409, { error: "market already finalized" });
    }
    if (market.proposedAt && !market.disputedAt) {
      return send(response, 409, { error: "outcome already proposed" });
    }
    const closeTime = Number(market.closeTime);
    if (Number.isFinite(closeTime) && nowSeconds() < closeTime) {
      return send(response, 409, { error: "market is still open" });
    }
    const proposedAt = nowSeconds();
    Object.assign(market, {
      proposedOutcome: outcome,
      proposedAt,
      proposalDeadline: proposedAt + (market.disputeWindowSeconds ?? disputeWindowSeconds),
      proposer: typeof body.proposer === "string" ? body.proposer : "oracle",
      evidenceUrl: typeof body.evidenceUrl === "string" ? body.evidenceUrl : "",
      disputedAt: undefined,
      disputer: undefined,
      disputeReason: undefined,
    });
    await saveStore(store);
    return send(response, 200, { market: publicMarket(market) });
  }

  if (request.method === "POST" && url.pathname === "/oracle/dispute") {
    const body = await readJson(request);
    const store = await loadStore();
    let market;
    try {
      market = requireMarket(store, body.contractAddress);
    } catch (error) {
      return send(response, error.message === "unknown market" ? 404 : 400, {
        error: error.message,
      });
    }
    if (!market.proposedAt) {
      return send(response, 409, { error: "no proposed outcome to dispute" });
    }
    if (market.finalizedAt) {
      return send(response, 409, { error: "market already finalized" });
    }
    if (nowSeconds() > Number(market.proposalDeadline)) {
      return send(response, 409, { error: "dispute window has ended" });
    }
    Object.assign(market, {
      disputedAt: nowSeconds(),
      disputer: typeof body.disputer === "string" ? body.disputer : "anonymous",
      disputeReason: typeof body.reason === "string" ? body.reason : "",
    });
    await saveStore(store);
    return send(response, 200, { market: publicMarket(market) });
  }

  if (request.method === "POST" && url.pathname === "/oracle/finalize") {
    const body = await readJson(request);
    const store = await loadStore();
    let market;
    try {
      market = requireMarket(store, body.contractAddress);
    } catch (error) {
      return send(response, error.message === "unknown market" ? 404 : 400, {
        error: error.message,
      });
    }
    if (!market.proposedAt) {
      return send(response, 409, { error: "no proposed outcome to finalize" });
    }
    if (market.disputedAt) {
      return send(response, 409, {
        error: "market is disputed and needs manual arbitration",
      });
    }
    if (nowSeconds() < Number(market.proposalDeadline)) {
      return send(response, 409, { error: "dispute window is still open" });
    }
    Object.assign(market, {
      finalOutcome: market.proposedOutcome,
      finalizedAt: nowSeconds(),
    });
    await saveStore(store);
    return send(response, 200, {
      market: publicMarket(market),
      nextAction:
        "submit market.close() if needed, then market.resolve(finalOutcome) from an oracle wallet",
    });
  }

  if (request.method === "POST" && url.pathname === "/oracle/resolve") {
    return send(response, 501, {
      error:
        "resolver wallet integration is not implemented yet; oracle secrets are stored separately from the browser",
    });
  }

  return send(response, 404, { error: "not found" });
};

const server = createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error("[oracle]", error);
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

server.listen(port, host, () => {
  console.log(`[oracle] listening on http://${host}:${port}`);
});
