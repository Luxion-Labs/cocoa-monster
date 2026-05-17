import {
  Side,
  Status,
  type CocoaApi,
  type CocoaOptionState,
  type CocoaState,
} from "cocoa-contract";
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

const contractOracleStatus = (
  state: CocoaState,
  option: CocoaOptionState,
): OracleStatus => {
  if (option.status === Status.RESOLVED) return "FINALIZED";
  if (state.status === Status.OPEN) return "OPEN";
  if (option.oracleDisputed) return "DISPUTED";
  if (option.proposedAt > 0n) return "PROPOSED";
  return "AWAITING_PROPOSAL";
};

export const OptimisticOraclePanel = ({ state, api }: Props) => {
  const [outcomes, setOutcomes] = useState<Record<string, OracleOutcome>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const optionKey = (option: CocoaOptionState): string => option.optionId.toString();
  const outcomeFor = (option: CocoaOptionState): OracleOutcome =>
    outcomes[optionKey(option)] ?? "YES";
  const reasonFor = (option: CocoaOptionState): string =>
    reasons[optionKey(option)] ?? "";
  const setOutcomeFor = (option: CocoaOptionState, outcome: OracleOutcome): void =>
    setOutcomes((prev) => ({ ...prev, [optionKey(option)]: outcome }));
  const setReasonFor = (option: CocoaOptionState, reason: string): void =>
    setReasons((prev) => ({ ...prev, [optionKey(option)]: reason }));

  const propose = async (option: CocoaOptionState): Promise<void> => {
    setSubmitting(`propose:${option.optionId}`);
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to propose an outcome.");
      await api.proposeOptionOutcome(
        option.optionId,
        outcomeToSide(outcomeFor(option)),
        300n,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const dispute = async (option: CocoaOptionState): Promise<void> => {
    setSubmitting(`dispute:${option.optionId}`);
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to dispute the outcome.");
      await api.disputeOptionOutcome(option.optionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const finalize = async (option: CocoaOptionState): Promise<void> => {
    setSubmitting(`finalize:${option.optionId}`);
    setError(null);
    try {
      if (!api) throw new Error("Connect wallet to finalize the outcome.");
      await api.finalizeOptionOutcome(option.optionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="oracle-panel" data-testid="optimistic-oracle-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <h3 style={{ margin: 0 }}>Resolve option markets</h3>
        <span className={`oracle-status-badge oracle-status-badge--${state.status === Status.OPEN ? "open" : state.status === Status.RESOLVED ? "finalized" : "proposed"}`}>
          Per option
        </span>
      </div>
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
      <div className="oracle-panel__options">
        {state.options.map((option) => {
          const oracleStatus = contractOracleStatus(state, option);
          const proposedOutcome = sideToOutcome(option.proposedOutcome);
          const finalizedOutcome = sideToOutcome(option.outcome) ?? undefined;
          const canPropose =
            state.status === Status.CLOSED &&
            option.status === Status.CLOSED &&
            option.proposedAt === 0n;
          const canDispute = oracleStatus === "PROPOSED";
          const canFinalize = oracleStatus === "PROPOSED";
          const selectedOutcome = outcomeFor(option);
          const submittingPropose = submitting === `propose:${option.optionId}`;
          const submittingDispute = submitting === `dispute:${option.optionId}`;
          const submittingFinalize = submitting === `finalize:${option.optionId}`;

          return (
            <section key={option.optionId.toString()} className="oracle-panel__option">
              <div className="oracle-panel__option-header">
                <strong>Resolve {option.label}</strong>
                <span className={`oracle-status-badge oracle-status-badge--${oracleStatus.toLowerCase()}`}>
                  {oracleStatus === "OPEN" && (
                    <span
                      className="featured-panel__live-dot"
                      style={{
                        background: "var(--success)",
                        boxShadow: "0 0 8px rgba(77, 154, 95, 0.5)",
                        width: "6px",
                        height: "6px",
                        marginRight: "4px"
                      }}
                    />
                  )}
                  {statusLabel(oracleStatus)}
                </span>
              </div>

              {proposedOutcome && option.proposalDeadline > 0n && (
                <p>
                  Proposed <strong>{proposedOutcome}</strong> for {option.label}. Dispute window
                  ends <strong>{formatUnixSeconds(option.proposalDeadline)}</strong>.
                </p>
              )}
              {oracleStatus === "DISPUTED" && (
                <p>
                  Disputed on-chain.
                  {reasonFor(option) ? <> Reason: {reasonFor(option)}</> : null}
                </p>
              )}
              {option.status === Status.RESOLVED && finalizedOutcome && (
                <p>
                  Final: <strong>{finalizedOutcome}</strong>
                </p>
              )}

              {canPropose && (
                <div className="oracle-panel__form">
                  <div className="oracle-panel__buttons">
                    <button
                      type="button"
                      className={selectedOutcome === "YES" ? "btn btn--primary" : "btn btn--ghost"}
                      onClick={() => setOutcomeFor(option, "YES")}
                    >
                      {formatSide(Side.YES)}
                    </button>
                    <button
                      type="button"
                      className={selectedOutcome === "NO" ? "btn btn--primary" : "btn btn--ghost"}
                      onClick={() => setOutcomeFor(option, "NO")}
                    >
                      {formatSide(Side.NO)}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void propose(option)}
                    disabled={submitting !== null}
                  >
                    {submittingPropose ? "Proposing..." : `Propose ${selectedOutcome}`}
                  </button>
                </div>
              )}

              {canDispute && (
                <div className="oracle-panel__form">
                  <input
                    value={reasonFor(option)}
                    onChange={(event) => setReasonFor(option, event.target.value)}
                    placeholder="Dispute reason"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void dispute(option)}
                    disabled={submitting !== null}
                  >
                    {submittingDispute ? "Disputing..." : "Dispute"}
                  </button>
                </div>
              )}

              {canFinalize && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void finalize(option)}
                  disabled={submitting !== null}
                >
                  {submittingFinalize ? "Finalizing..." : "Finalize after window"}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {error && (
        <p className="oracle-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
