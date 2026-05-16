import {
  deployMarketFactory,
  joinMarketFactory,
  type RegisteredMarket,
} from "cocoa-contract";
import { useCallback, useEffect, useState } from "react";

import { useWallet } from "../hooks/useWallet";
import { explainError } from "../lib/errors";
import { truncateAddress } from "../lib/format";
import { cocoaConfig } from "../lib/network";
import { buildCocoaProviders } from "../lib/providers";

export const FactoryAdminPage = () => {
  const wallet = useWallet();
  const [factoryAddress, setFactoryAddress] = useState(
    cocoaConfig.marketFactoryAddress ?? "",
  );
  const [markets, setMarkets] = useState<readonly RegisteredMarket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet.connection || !factoryAddress.trim()) return;
    setError(null);
    try {
      const providers = buildCocoaProviders(wallet.connection);
      const factory = await joinMarketFactory(providers as never, factoryAddress.trim());
      setMarkets(await factory.markets());
    } catch (err) {
      setError(explainError(err));
    }
  }, [factoryAddress, wallet.connection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deploy = async (): Promise<void> => {
    if (!wallet.connection) return;
    setSubmitting(true);
    setError(null);
    try {
      const providers = buildCocoaProviders(wallet.connection);
      const factory = await deployMarketFactory(providers as never);
      setFactoryAddress(factory.contractAddress);
      setMarkets([]);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page factory-admin">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Hidden admin</p>
          <h2>Market Factory</h2>
        </div>
      </header>

      {!wallet.connection ? (
        <div className="empty-state">
          <p>Connect wallet to deploy or inspect the market factory.</p>
        </div>
      ) : (
        <div className="factory-admin__panel">
          <label className="create-market__field">
            <span>Factory address</span>
            <input
              type="text"
              value={factoryAddress}
              onChange={(event) => setFactoryAddress(event.target.value)}
              placeholder="Deploy one, then set VITE_MARKET_FACTORY_ADDRESS"
            />
          </label>
          <div className="factory-admin__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void deploy()}
              disabled={submitting}
            >
              {submitting ? "Deploying..." : "Deploy factory"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void refresh()}
              disabled={!factoryAddress.trim()}
            >
              Refresh
            </button>
          </div>
          {factoryAddress && (
            <p className="factory-admin__hint">
              Set <code>VITE_MARKET_FACTORY_ADDRESS={factoryAddress}</code> for
              every UI instance.
            </p>
          )}
          {markets.length > 0 && (
            <ul className="factory-admin__markets">
              {markets.map((market) => (
                <li key={market.contractAddress}>
                  <span>{market.question}</span>
                  <code title={market.contractAddress}>
                    {truncateAddress(market.contractAddress, 8, 8)}
                  </code>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="create-market__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
