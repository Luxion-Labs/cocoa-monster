import {
  deployMarketFactory,
  joinMarketFactory,
  type RegisteredMarket,
} from "cocoa-contract";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useWallet } from "../hooks/useWallet";
import { explainError } from "../lib/errors";
import { truncateAddress } from "../lib/format";
import {
  getMarketFactoryAddress,
  setMarketFactoryAddress,
} from "../lib/markets";
import { buildCocoaProviders } from "../lib/providers";

export const FactoryAdminPage = () => {
  const wallet = useWallet();
  const [factoryAddress, setFactoryAddress] = useState(
    getMarketFactoryAddress() ?? "",
  );
  const [markets, setMarkets] = useState<readonly RegisteredMarket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = useMemo(
    () => (wallet.connection ? buildCocoaProviders(wallet.connection) : null),
    [wallet.connection],
  );

  const refresh = useCallback(async () => {
    if (!providers || !factoryAddress.trim()) return;
    setError(null);
    try {
      const factory = await joinMarketFactory(providers as never, factoryAddress.trim());
      setMarkets(await factory.markets());
    } catch (err) {
      setError(explainError(err));
    }
  }, [factoryAddress, providers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deploy = async (): Promise<void> => {
    if (!wallet.connection) return;
    setSubmitting(true);
    setError(null);
    try {
      const factory = await deployMarketFactory(providers! as never);
      setFactoryAddress(factory.contractAddress);
      setMarketFactoryAddress(factory.contractAddress);
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
          <p className="page__eyebrow">Operations</p>
          <h2>Oracle Operations</h2>
        </div>
      </header>

      {!wallet.connection ? (
        <div className="empty-state">
          <p>Connect wallet to deploy or inspect the market factory.</p>
        </div>
      ) : (
        <div className="factory-admin__panel">
          <div className="factory-admin__intro">
            <h3>Market registry</h3>
            <p>
              Deploy one factory, configure its address in every UI, and all
              markets created through Cocoa will be discoverable by everyone.
            </p>
          </div>
          <label className="create-market__field">
            <span>Factory address</span>
            <input
              type="text"
              value={factoryAddress}
              onChange={(event) => {
                setFactoryAddress(event.target.value);
                setMarketFactoryAddress(event.target.value);
              }}
              placeholder="Deploy one, then paste its address here"
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
              This browser will use <code>{factoryAddress}</code> for market
              discovery.
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
                  <Link
                    to={`/oracle/${encodeURIComponent(market.contractAddress)}`}
                    className="btn btn--ghost"
                  >
                    Oracle
                  </Link>
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
