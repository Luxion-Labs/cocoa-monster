import {
  deployCocoaMarket,
  joinMarketFactory,
  MAX_MARKET_OPTIONS,
} from "cocoa-contract";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWallet } from "../hooks/useWallet";
import { buildCocoaProviders } from "../lib/providers";
import {
  getMarketFactoryAddress,
  MARKET_CATEGORIES,
  type MarketCategory,
  rememberMarket,
} from "../lib/markets";
import { explainError } from "../lib/errors";

const DEFAULT_LIQUIDITY = "1000";
type MarketType = "basic" | "multi";

export const CreateMarketPage = () => {
  const wallet = useWallet();
  const navigate = useNavigate();

  const [marketType, setMarketType] = useState<MarketType>("basic");
  const [category, setCategory] = useState<MarketCategory>("Markets");
  const [question, setQuestion] = useState("");
  const [optionsRaw, setOptionsRaw] = useState("Candidate A\nCandidate B");
  const [liquidity, setLiquidity] = useState(DEFAULT_LIQUIDITY);
  const [resolutionSource, setResolutionSource] = useState("");
  const [resolutionRules, setResolutionRules] = useState("");
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

  const marketOptions = useMemo(
    () =>
      optionsRaw
        .split(/\r?\n/)
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [optionsRaw],
  );

  const valid =
    !!wallet.connection &&
    question.trim().length > 0 &&
    (marketType === "basic" ||
      (marketOptions.length >= 2 && marketOptions.length <= MAX_MARKET_OPTIONS)) &&
    resolutionRules.trim().length > 0 &&
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
        marketType,
        category,
        initialLiquidity: String(liquidityBig),
        closeTime: String(closeTimestamp),
      });
      const api = await deployCocoaMarket(providers, {
        question: question.trim(),
        options: marketType === "basic" ? undefined : marketOptions,
        resolutionRules: resolutionRules.trim(),
        resolutionSource: resolutionSource.trim(),
        initialLiquidity: liquidityBig!,
        closeTime: closeTimestamp!,
      });
      console.debug("[cocoa] deployed at", api.contractAddress);
      const marketFactoryAddress = getMarketFactoryAddress();
      if (marketFactoryAddress) {
        const factory = await joinMarketFactory(
          providers as never,
          marketFactoryAddress,
        );
        await factory.registerMarket({
          contractAddress: api.contractAddress,
          question: question.trim(),
          closeTime: closeTimestamp!,
          oraclePubKey: api.oraclePubKey ?? new Uint8Array(32),
        });
      }
      rememberMarket({
        contractAddress: api.contractAddress,
        question: question.trim(),
        category,
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
          <div className="create-market__field">
            <span>Market type</span>
            <div className="create-market__type" role="group" aria-label="Market type">
              <button
                type="button"
                className={`create-market__type-option ${
                  marketType === "basic" ? "create-market__type-option--active" : ""
                }`}
                aria-pressed={marketType === "basic"}
                onClick={() => setMarketType("basic")}
                data-testid="create-market-type-basic"
              >
                Basic YES/NO
              </button>
              <button
                type="button"
                className={`create-market__type-option ${
                  marketType === "multi" ? "create-market__type-option--active" : ""
                }`}
                aria-pressed={marketType === "multi"}
                onClick={() => setMarketType("multi")}
                data-testid="create-market-type-multi"
              >
                Multi-option
              </button>
            </div>
          </div>
          <label className="create-market__field">
            <span>Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MarketCategory)}
              data-testid="create-market-category"
            >
              {MARKET_CATEGORIES.map((marketCategory) => (
                <option key={marketCategory} value={marketCategory}>
                  {marketCategory}
                </option>
              ))}
            </select>
          </label>
          <label className="create-market__field">
            <span>Market question</span>
            <input
              type="text"
              required
              maxLength={200}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Who will win the 2028 election?"
              data-testid="create-market-question"
            />
          </label>
          {marketType === "multi" && (
            <label className="create-market__field">
              <span>Option markets</span>
              <textarea
                required
                rows={Math.min(5, MAX_MARKET_OPTIONS)}
                value={optionsRaw}
                onChange={(e) => setOptionsRaw(e.target.value)}
                placeholder={"Candidate A\nCandidate B\nCandidate C"}
                data-testid="create-market-options"
              />
            </label>
          )}
          <label className="create-market__field">
            <span>Initial liquidity per YES/NO side</span>
            <input
              type="text"
              inputMode="numeric"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
              data-testid="create-market-liquidity"
            />
          </label>
          <label className="create-market__field">
            <span>Betting deadline</span>
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              data-testid="create-market-close"
            />
          </label>
          <label className="create-market__field">
            <span>Resolution source</span>
            <input
              type="text"
              value={resolutionSource}
              onChange={(e) => setResolutionSource(e.target.value)}
              placeholder="Official result, exchange listing page, API URL"
              data-testid="create-market-resolution-source"
            />
          </label>
          <label className="create-market__field">
            <span>Resolution rules</span>
            <textarea
              required
              rows={5}
              value={resolutionRules}
              onChange={(e) => setResolutionRules(e.target.value)}
              placeholder={
                marketType === "basic"
                  ? "Resolve YES if the event happens. Resolve NO otherwise."
                  : "Resolve each option YES if that option wins. Resolve every other listed option NO."
              }
              data-testid="create-market-resolution-rules"
            />
          </label>
          <p className="create-market__note">
            {marketType === "basic"
              ? "Trading stops at the betting deadline. The oracle resolves the market YES or NO."
              : "Trading stops at the betting deadline. The oracle resolves every option as its own YES/NO result."}
          </p>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="btn btn--primary"
            data-testid="create-market-submit"
          >
            {submitting
              ? "Deploying…"
              : marketType === "basic"
                ? "Deploy YES/NO market"
                : "Deploy option markets"}
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
