import {
  deployCocoaMarket,
  joinMarketFactory,
} from "cocoa-contract";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWallet } from "../hooks/useWallet";
import { buildCocoaProviders } from "../lib/providers";
import { rememberMarket } from "../lib/markets";
import { explainError } from "../lib/errors";
import { prepareOracle, registerOracleMarket } from "../lib/oracle";
import { cocoaConfig } from "../lib/network";

const DEFAULT_LIQUIDITY = "1000";

export const CreateMarketPage = () => {
  const wallet = useWallet();
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [liquidity, setLiquidity] = useState(DEFAULT_LIQUIDITY);
  const [closeAt, setCloseAt] = useState<string>(() => {
    // Default to one hour from now, in YYYY-MM-DDTHH:mm form.
    const t = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => `${n}`.padStart(2, "0");
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeTimestamp = useMemo(() => {
    if (!closeAt) return null;
    const t = new Date(closeAt).getTime();
    if (Number.isNaN(t)) return null;
    return BigInt(Math.floor(t / 1000));
  }, [closeAt]);

  const liquidityBig = useMemo(() => {
    if (!/^\d+$/.test(liquidity.trim())) return null;
    try {
      const v = BigInt(liquidity.trim());
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [liquidity]);

  const valid =
    !!wallet.connection &&
    question.trim().length > 0 &&
    liquidityBig !== null &&
    closeTimestamp !== null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!wallet.connection || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      console.debug("[cocoa] building providers from wallet connection", {
        coinPublicKey: wallet.connection.coinPublicKey,
        configuration: wallet.connection.configuration,
      });
      const providers = buildCocoaProviders(wallet.connection);
      console.debug("[cocoa] providers ready", {
        wallet: providers.walletProvider,
        midnight: providers.midnightProvider,
        proof: providers.proofProvider,
        zk: providers.zkConfigProvider,
        publicData: providers.publicDataProvider,
        privateState: providers.privateStateProvider,
      });
      console.debug("[cocoa] calling deployCocoaMarket", {
        question: question.trim(),
        initialLiquidity: String(liquidityBig),
        closeTime: String(closeTimestamp),
      });
      const oracle = await prepareOracle({
        question: question.trim(),
        closeTime: closeTimestamp!,
      });
      const api = await deployCocoaMarket(providers, {
        question: question.trim(),
        initialLiquidity: liquidityBig!,
        closeTime: closeTimestamp!,
        oraclePubKey: oracle.oraclePubKey,
      });
      console.debug("[cocoa] deployed at", api.contractAddress);
      if (cocoaConfig.marketFactoryAddress) {
        const factory = await joinMarketFactory(
          providers as never,
          cocoaConfig.marketFactoryAddress,
        );
        await factory.registerMarket({
          contractAddress: api.contractAddress,
          question: question.trim(),
          closeTime: closeTimestamp!,
          oraclePubKey: oracle.oraclePubKey,
        });
      }
      await registerOracleMarket({
        oracleId: oracle.oracleId,
        contractAddress: api.contractAddress,
        question: question.trim(),
        closeTime: closeTimestamp!,
      });
      rememberMarket({
        contractAddress: api.contractAddress,
        question: question.trim(),
        addedAt: Date.now(),
      });
      navigate(`/m/${api.contractAddress}`);
    } catch (err) {
      console.error("[cocoa] deploy failed:", err);
      setError(explainError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page create-market">
      <header className="page__header">
        <h2>Create a market</h2>
      </header>
      {!wallet.connection ? (
        <div className="empty-state">
          <p>
            {wallet.status.kind === "connecting" ||
            wallet.status.kind === "checking"
              ? "Syncing wallet connection..."
              : "Connect wallet from the top bar to deploy a new market."}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="create-market__form" data-testid="create-market-form">
          <label className="create-market__field">
            <span>Question</span>
            <input
              type="text"
              required
              maxLength={200}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will it rain in Lagos tomorrow?"
              data-testid="create-market-question"
            />
          </label>
          <label className="create-market__field">
            <span>Initial liquidity (each side)</span>
            <input
              type="text"
              inputMode="numeric"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
              data-testid="create-market-liquidity"
            />
          </label>
          <label className="create-market__field">
            <span>Closes at</span>
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              data-testid="create-market-close"
            />
          </label>
          <p className="create-market__note">
            The oracle service prepares the market key and registers the
            deployed contract for shared discovery.
          </p>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="btn btn--primary"
            data-testid="create-market-submit"
          >
            {submitting ? "Deploying…" : "Deploy market"}
          </button>
          {error && (
            <p className="create-market__error" role="alert" data-testid="create-market-error">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
};
