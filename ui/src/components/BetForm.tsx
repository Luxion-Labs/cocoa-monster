import {
  type CocoaApi,
  type CocoaOptionState,
  Side,
  quoteAmountOut,
} from "cocoa-contract";
import { useMemo, useState } from "react";

import { formatBigInt, formatPriceYes, formatSide } from "../lib/format";
import type { LaceConnection } from "../lib/wallet";

type Props = {
  api: CocoaApi;
  option: CocoaOptionState;
  disabledReason?: string;
  wallet?: LaceConnection;
};

const NATIVE_TOKEN =
  "0000000000000000000000000000000000000000000000000000000000000000";

const parseStake = (raw: string): bigint | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  try {
    const value = BigInt(raw.trim());
    return value > 0n ? value : null;
  } catch {
    return null;
  }
};

export const BetForm = ({ api, option, disabledReason, wallet }: Props) => {
  const [side, setSide] = useState<Side>(Side.YES);
  const [stakeRaw, setStakeRaw] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const tradingDisabled = disabledReason !== undefined;

  const stake = parseStake(stakeRaw);

  const quote = useMemo(() => {
    if (stake === null) return null;
    return quoteAmountOut(option.reserveYes, option.reserveNo, side, stake);
  }, [option.reserveYes, option.reserveNo, side, stake]);

  const impliedPriceAfter = useMemo(() => {
    if (stake === null || quote === null) return null;
    const newYes =
      side === Side.YES ? option.reserveYes - quote : option.reserveYes + stake;
    const newNo =
      side === Side.YES ? option.reserveNo + stake : option.reserveNo - quote;
    const total = Number(newYes + newNo);
    if (total === 0) return null;
    return Number(newNo) / total;
  }, [stake, quote, side, option.reserveYes, option.reserveNo]);

  const disabled =
    tradingDisabled ||
    submitting ||
    stake === null ||
    quote === null ||
    quote <= 0n;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tradingDisabled) return;
    if (stake === null || quote === null || quote <= 0n) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (wallet) {
        const balances = await wallet.connected.getUnshieldedBalances();
        const unshieldedNight = balances[NATIVE_TOKEN] ?? 0n;
        if (unshieldedNight < stake) {
          throw new Error(
            `Insufficient unshielded NIGHT. Need ${formatBigInt(stake)}, available ${formatBigInt(unshieldedNight)}.`,
          );
        }
      }
      const position = await api.buy(side, stake, quote, option.optionId);
      setSuccess(
        `Bet submitted: ${formatBigInt(position.amount)} NIGHT on ${formatSide(position.side)} for ${option.label}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`bet-form ${tradingDisabled ? "bet-form--disabled" : ""}`}
      data-testid="bet-form"
    >
      <h3 className="bet-form__title">Trade {option.label}</h3>
      {disabledReason && (
        <p className="bet-form__notice" data-testid="bet-form-disabled-reason">
          {disabledReason}
        </p>
      )}
      <div className="bet-form__sides">
        <label className={`bet-form__side bet-form__side--yes ${side === Side.YES ? "bet-form__side--active" : ""}`}>
          <input
            type="radio"
            name="side"
            value="YES"
            checked={side === Side.YES}
            disabled={tradingDisabled || submitting}
            onChange={() => setSide(Side.YES)}
            data-testid="bet-form-side-yes"
          />
          <strong>YES</strong>
          <span>{formatPriceYes(option.priceYes)}</span>
        </label>
        <label className={`bet-form__side bet-form__side--no ${side === Side.NO ? "bet-form__side--active" : ""}`}>
          <input
            type="radio"
            name="side"
            value="NO"
            checked={side === Side.NO}
            disabled={tradingDisabled || submitting}
            onChange={() => setSide(Side.NO)}
            data-testid="bet-form-side-no"
          />
          <strong>NO</strong>
          <span>{formatPriceYes(1 - option.priceYes)}</span>
        </label>
      </div>
      <label className="bet-form__field">
        <span>Stake units</span>
        <input
          type="text"
          inputMode="numeric"
          value={stakeRaw}
          disabled={tradingDisabled || submitting}
          onChange={(e) => setStakeRaw(e.target.value)}
          data-testid="bet-form-collateral"
        />
      </label>
      <div className="bet-form__quote" data-testid="bet-form-quote">
        {quote !== null && quote > 0n ? (
          <>
            <span>{formatSide(side)} exposure</span>
            <strong>
              {formatBigInt(quote)} {formatSide(side)} units
            </strong>
            <span>{formatBigInt(stake ?? 0n)} NIGHT escrowed</span>
            {impliedPriceAfter !== null && (
              <span className="bet-form__implied">
                YES price after: {formatPriceYes(impliedPriceAfter)}
              </span>
            )}
          </>
        ) : (
          <span className="bet-form__quote-empty">Enter a stake amount</span>
        )}
      </div>
      <button
        type="submit"
        disabled={disabled}
        className={`bet-form__submit ${
          side === Side.YES ? "bet-form__submit--yes" : "bet-form__submit--no"
        }`}
        data-testid="bet-form-submit"
      >
        {disabledReason
          ? "Betting closed"
          : submitting
            ? "Submitting…"
            : `Buy ${formatSide(side)}`}
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
