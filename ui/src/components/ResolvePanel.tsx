import { type CocoaApi, type CocoaState, Side, Status } from "cocoa-contract";
import { useEffect, useState } from "react";

import { formatSide, formatUnixSeconds } from "../lib/format";

type Props = {
  api: CocoaApi;
  state: CocoaState;
};

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const ResolvePanel = ({ api, state }: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOracle, setIsOracle] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .isOracle()
      .then((v) => {
        if (!cancelled) setIsOracle(v);
      })
      .catch(() => {
        if (!cancelled) setIsOracle(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, state.status]);

  const resolve = async (side: Side): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await api.resolve(side, nowSeconds());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === Status.RESOLVED) {
    return (
      <div className="resolve-panel resolve-panel--resolved" data-testid="resolve-panel">
        <h3>Oracle</h3>
        <p>
          Market resolved <strong>{formatSide(state.outcome ?? Side.YES)}</strong>.
        </p>
      </div>
    );
  }

  const closed = nowSeconds() >= state.closeTime;

  if (isOracle === false) {
    return (
      <div className="resolve-panel" data-testid="resolve-panel">
        <h3>Oracle</h3>
        <p>
          Closes <strong>{formatUnixSeconds(state.closeTime)}</strong>. The
          market's trusted oracle resolves it from their device once the
          close time passes.
        </p>
      </div>
    );
  }

  return (
    <div className="resolve-panel" data-testid="resolve-panel">
      <h3>Oracle</h3>
      <p>
        You hold the oracle secret for this market. Choose the outcome —
        the contract verifies your secret on-chain and resolves in a single
        step.
      </p>
      <div className="resolve-panel__buttons">
        <button
          type="button"
          onClick={() => resolve(Side.YES)}
          disabled={!closed || submitting}
          className="btn btn--primary"
          data-testid="resolve-panel-resolve-yes"
        >
          {submitting ? "Resolving…" : "Resolve YES"}
        </button>
        <button
          type="button"
          onClick={() => resolve(Side.NO)}
          disabled={!closed || submitting}
          className="btn btn--ghost"
          data-testid="resolve-panel-resolve-no"
        >
          Resolve NO
        </button>
      </div>
      {!closed && (
        <p className="resolve-panel__hint">
          Closes <strong>{formatUnixSeconds(state.closeTime)}</strong>.
        </p>
      )}
      {error && (
        <p className="resolve-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
