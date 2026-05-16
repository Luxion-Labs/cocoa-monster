import { type CocoaApi, type CocoaState, Side, Status } from "cocoa-contract";
import { useEffect, useState } from "react";

import { formatSide } from "../lib/format";

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

  const close = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await api.close(nowSeconds());
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

  if (state.status === Status.OPEN) {
    const closed = nowSeconds() >= state.closeTime;
    return (
      <div className="resolve-panel" data-testid="resolve-panel">
        <h3>Oracle</h3>
        <p>
          Trading is open. After the cutoff, anyone can stop trading before the
          oracle finalizes.
        </p>
        <button
          type="button"
          onClick={() => void close()}
          disabled={!closed || submitting}
          className="btn btn--ghost"
        >
          {submitting ? "Closing..." : "Close market"}
        </button>
        {error && (
          <p className="resolve-panel__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (isOracle === false) {
    return (
      <div className="resolve-panel" data-testid="resolve-panel">
        <h3>Oracle</h3>
        <p>
          Trading is closed. The optimistic oracle can propose an outcome, then
          the trusted resolver submits the finalized answer on-chain.
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
          onClick={() => void resolve(Side.YES)}
          disabled={submitting}
          className="btn btn--primary"
          data-testid="resolve-panel-resolve-yes"
        >
          {submitting ? "Resolving…" : "Resolve YES"}
        </button>
        <button
          type="button"
          onClick={() => void resolve(Side.NO)}
          disabled={submitting}
          className="btn btn--ghost"
          data-testid="resolve-panel-resolve-no"
        >
          Resolve NO
        </button>
      </div>
      {error && (
        <p className="resolve-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
