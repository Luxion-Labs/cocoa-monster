import { type CocoaApi, type CocoaState, Side, quoteAmountOut } from "cocoa-contract";
import { useMemo, useState } from "react";

import { formatBigInt, formatPriceYes } from "../lib/format";

type Props = {
  api: CocoaApi;
  state: CocoaState;
};

const parseCollateral = (raw: string): bigint | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  try {
    const value = BigInt(raw.trim());
    return value > 0n ? value : null;
  } catch {
    return null;
  }
};

export const BetForm = ({ api, state }: Props) => {
  const [side, setSide] = useState<Side>(Side.YES);
  const [collateralRaw, setCollateralRaw] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const collateral = parseCollateral(collateralRaw);

  const quote = useMemo(() => {
    if (collateral === null) return null;
    return quoteAmountOut(state.reserveYes, state.reserveNo, side, collateral);
  }, [state.reserveYes, state.reserveNo, side, collateral]);

  const impliedPriceAfter = useMemo(() => {
    if (collateral === null || quote === null) return null;
    const newYes =
      side === Side.YES ? state.reserveYes - quote : state.reserveYes + collateral;
    const newNo =
      side === Side.YES ? state.reserveNo + collateral : state.reserveNo - quote;
    const total = Number(newYes + newNo);
    if (total === 0) return null;
    return Number(newNo) / total;
  }, [collateral, quote, side, state.reserveYes, state.reserveNo]);

  const disabled = submitting || collateral === null || quote === null || quote <= 0n;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (collateral === null || quote === null || quote <= 0n) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const position = await api.buy(side, collateral, quote);
      setSuccess(
        `Bet submitted: ${formatBigInt(position.amount)} ${
          position.side === Side.YES ? "YES" : "NO"
        } shares.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bet-form" data-testid="bet-form">
      <div className="bet-form__sides">
        <label className={`bet-form__side ${side === Side.YES ? "bet-form__side--active" : ""}`}>
          <input
            type="radio"
            name="side"
            value="YES"
            checked={side === Side.YES}
            onChange={() => setSide(Side.YES)}
            data-testid="bet-form-side-yes"
          />
          YES {formatPriceYes(state.priceYes)}
        </label>
        <label className={`bet-form__side ${side === Side.NO ? "bet-form__side--active" : ""}`}>
          <input
            type="radio"
            name="side"
            value="NO"
            checked={side === Side.NO}
            onChange={() => setSide(Side.NO)}
            data-testid="bet-form-side-no"
          />
          NO {formatPriceYes(1 - state.priceYes)}
        </label>
      </div>
      <label className="bet-form__field">
        <span>Collateral ($NIGHT)</span>
        <input
          type="text"
          inputMode="numeric"
          value={collateralRaw}
          onChange={(e) => setCollateralRaw(e.target.value)}
          data-testid="bet-form-collateral"
        />
      </label>
      <div className="bet-form__quote" data-testid="bet-form-quote">
        {quote !== null && quote > 0n ? (
          <>
            <span>You receive</span>
            <strong>
              {formatBigInt(quote)} {side === Side.YES ? "YES" : "NO"} shares
            </strong>
            {impliedPriceAfter !== null && (
              <span className="bet-form__implied">
                YES price after: {formatPriceYes(impliedPriceAfter)}
              </span>
            )}
          </>
        ) : (
          <span className="bet-form__quote-empty">Enter a collateral amount</span>
        )}
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="btn btn--primary bet-form__submit"
        data-testid="bet-form-submit"
      >
        {submitting ? "Submitting…" : `Bet ${side === Side.YES ? "YES" : "NO"}`}
      </button>
      {error && (
        <p className="bet-form__error" role="alert" data-testid="bet-form-error">
          {error}
        </p>
      )}
      {success && (
        <p className="bet-form__success" data-testid="bet-form-success">
          {success}
        </p>
      )}
    </form>
  );
};
