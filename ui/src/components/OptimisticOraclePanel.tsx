import { Side, Status, type CocoaApi, type CocoaState } from "cocoa-contract";
import { useState } from "react";

import { formatSide, formatUnixSeconds } from "../lib/format";

type Props = {
  state: CocoaState;
  api: CocoaApi | null;
};

type OracleOutcome = "YES" | "NO";
type OracleStatus =
  | "OPEN"
  | "AWAITING_PROPOSAL"
  | "PROPOSED"
  | "DISPUTED"
  | "FINALIZED";

const sideToOutcome = (side: Side | null): OracleOutcome | null =>
  side === Side.YES ? "YES" : side === Side.NO ? "NO" : null;

const outcomeToSide = (outcome: OracleOutcome): Side =>
  outcome === "YES" ? Side.YES : Side.NO;

const statusLabel = (status: OracleStatus): string => {
  switch (status) {
    case "OPEN":
      return "Betting open";
    case "AWAITING_PROPOSAL":
      return "Awaiting proposal";
    case "PROPOSED":
      return "Proposed";
    case "DISPUTED":
      return "Disputed";
    case "FINALIZED":
      return "Finalized";
  }
};

const contractOracleStatus = (state: CocoaState): OracleStatus => {
  if (state.status === Status.RESOLVED) return "FINALIZED";
  if (state.oracleDisputed) return "DISPUTED";
  if (state.proposedAt > 0n) return "PROPOSED";
  return state.status === Status.CLOSED ? "AWAITING_PROPOSAL" : "OPEN";
};

export const OptimisticOraclePanel = ({ state, api }: Props) => {
  const [outcome, setOutcome] = useState<OracleOutcome>("YES");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const propose = async (): Promise<void> => {
    setSubmitting("propose");
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to propose an outcome.");
      await api.proposeOutcome(outcomeToSide(outcome), 300n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const dispute = async (): Promise<void> => {
    setSubmitting("dispute");
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to dispute the outcome.");
      await api.disputeOutcome();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const finalize = async (): Promise<void> => {
    setSubmitting("finalize");
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to finalize the outcome.");
      await api.finalizeOutcome();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const finalizedOutcome = sideToOutcome(state.outcome) ?? undefined;
  const proposedOutcome = sideToOutcome(state.proposedOutcome);
  const oracleStatus = contractOracleStatus(state);
  const canPropose =
    state.status === Status.CLOSED && state.proposedAt === 0n;
  const canDispute = oracleStatus === "PROPOSED";
  const canFinalize = oracleStatus === "PROPOSED";

  return (
    <div className="oracle-panel" data-testid="optimistic-oracle-panel">
      <h3>Optimistic oracle</h3>
      <p>
        Status: <strong>{statusLabel(oracleStatus)}</strong>
      </p>
      {state.resolutionSource && (
        <p>
          Source: <strong>{state.resolutionSource}</strong>
        </p>
      )}
      {state.resolutionRules && (
        <div className="oracle-panel__rules">
          <strong>Resolution rules</strong>
          <p>{state.resolutionRules}</p>
        </div>
      )}
      {proposedOutcome && state.proposalDeadline > 0n && (
        <p>
          Proposed <strong>{proposedOutcome}</strong>. Dispute window
          ends <strong>{formatUnixSeconds(state.proposalDeadline)}</strong>.
        </p>
      )}
      {oracleStatus === "DISPUTED" && (
        <p>
          Disputed on-chain.
          {reason ? <> Reason: {reason}</> : null}
        </p>
      )}
      {finalizedOutcome && (
        <p>
          Final outcome: <strong>{finalizedOutcome}</strong>
        </p>
      )}

      {canPropose && (
        <div className="oracle-panel__form">
          <div className="oracle-panel__buttons">
            <button
              type="button"
              className={outcome === "YES" ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setOutcome("YES")}
            >
              {formatSide(Side.YES)}
            </button>
            <button
              type="button"
              className={outcome === "NO" ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setOutcome("NO")}
            >
              {formatSide(Side.NO)}
            </button>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void propose()}
            disabled={submitting !== null}
          >
            {submitting === "propose" ? "Proposing..." : "Propose outcome"}
          </button>
        </div>
      )}

      {canDispute && (
        <div className="oracle-panel__form">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Dispute reason"
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void dispute()}
            disabled={submitting !== null}
          >
            {submitting === "dispute" ? "Disputing..." : "Dispute"}
          </button>
        </div>
      )}

      {canFinalize && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void finalize()}
          disabled={submitting !== null}
        >
          {submitting === "finalize" ? "Finalizing..." : "Finalize after window"}
        </button>
      )}

      {error && (
        <p className="oracle-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
