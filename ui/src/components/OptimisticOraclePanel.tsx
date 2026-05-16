import { Side, Status, type CocoaApi, type CocoaState } from "cocoa-contract";
import { useCallback, useEffect, useState } from "react";

import { formatSide, formatUnixSeconds } from "../lib/format";
import {
  disputeOracleOutcome,
  fetchOracleMarket,
  fetchOracleResolution,
  finalizeOracleOutcome,
  proposeOracleOutcome,
  type OracleMarket,
  type OracleOutcome,
} from "../lib/oracle";

type Props = {
  contractAddress: string;
  state: CocoaState;
  api: CocoaApi | null;
};

const sideToOutcome = (side: Side | null): OracleOutcome | null =>
  side === Side.YES ? "YES" : side === Side.NO ? "NO" : null;

const outcomeToSide = (outcome: OracleOutcome): Side =>
  outcome === "YES" ? Side.YES : Side.NO;

const deadlineLabel = (deadline?: number): string =>
  deadline ? formatUnixSeconds(BigInt(deadline)) : "unknown";

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

const statusLabel = (status?: OracleMarket["oracleStatus"]): string => {
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
    default:
      return "Not registered";
  }
};

export const OptimisticOraclePanel = ({ contractAddress, state, api }: Props) => {
  const [market, setMarket] = useState<OracleMarket | null>(null);
  const [outcome, setOutcome] = useState<OracleOutcome>("YES");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setMarket(await fetchOracleMarket(contractAddress));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [contractAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const propose = async (): Promise<void> => {
    setSubmitting("propose");
    setError(null);
    try {
      setMarket(
        await proposeOracleOutcome({
          contractAddress,
          outcome,
          evidenceUrl,
          proposer: "web",
        }),
      );
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
      setMarket(
        await disputeOracleOutcome({
          contractAddress,
          reason,
          disputer: "web",
        }),
      );
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
      setMarket(await finalizeOracleOutcome(contractAddress));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const submitFinalizedOnChain = async (): Promise<void> => {
    setSubmitting("resolve");
    setError(null);
    try {
      if (!api) {
        throw new Error("Connect wallet to submit the finalized outcome on-chain.");
      }
      const resolution = await fetchOracleResolution(contractAddress);
      if (state.status === Status.OPEN) {
        await api.close(nowSeconds());
      }
      await api.resolveWithOracleSecret(
        outcomeToSide(resolution.outcome),
        nowSeconds(),
        resolution.oracleSecret,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  };

  const finalizedOutcome =
    market?.finalOutcome ?? sideToOutcome(state.outcome) ?? undefined;
  const canPropose =
    state.status === Status.CLOSED &&
    (!market || market.oracleStatus === "AWAITING_PROPOSAL");
  const canDispute = market?.oracleStatus === "PROPOSED";
  const canFinalize = market?.oracleStatus === "PROPOSED";
  const canSubmitFinalized =
    market?.oracleStatus === "FINALIZED" && state.status !== Status.RESOLVED;

  return (
    <div className="oracle-panel" data-testid="optimistic-oracle-panel">
      <h3>Optimistic oracle</h3>
      <p>
        Status: <strong>{statusLabel(market?.oracleStatus)}</strong>
      </p>
      {market?.closeTime && (
        <p>
          Betting deadline:{" "}
          <strong>{formatUnixSeconds(BigInt(market.closeTime))}</strong>
        </p>
      )}
      {market?.resolutionSource && (
        <p>
          Source: <strong>{market.resolutionSource}</strong>
        </p>
      )}
      {market?.resolutionRules && (
        <div className="oracle-panel__rules">
          <strong>Resolution rules</strong>
          <p>{market.resolutionRules}</p>
        </div>
      )}
      {market?.proposerBond && (
        <p>
          Proposal bond: <strong>{market.proposerBond}</strong>
          {market.disputerBond ? (
            <>
              {"; "}
              Dispute bond: <strong>{market.disputerBond}</strong>
            </>
          ) : null}
        </p>
      )}
      {market?.proposedOutcome && (
        <p>
          Proposed <strong>{market.proposedOutcome}</strong>. Dispute window
          ends <strong>{deadlineLabel(market.proposalDeadline)}</strong>.
        </p>
      )}
      {market?.oracleStatus === "DISPUTED" && (
        <p>
          Disputed by {market.disputer ?? "anonymous"}:{" "}
          {market.disputeReason || "no reason supplied"}
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
          <input
            type="url"
            value={evidenceUrl}
            onChange={(event) => setEvidenceUrl(event.target.value)}
            placeholder="Evidence URL"
          />
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

      {canSubmitFinalized && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void submitFinalizedOnChain()}
          disabled={submitting !== null || !api}
        >
          {submitting === "resolve"
            ? "Submitting..."
            : api
              ? "Submit outcome on-chain"
              : "Connect wallet to submit"}
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
