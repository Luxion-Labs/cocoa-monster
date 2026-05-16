import { useCallback, useEffect, useMemo, useState } from "react";

import { useWallet } from "../hooks/useWallet";
import { explainError } from "../lib/errors";
import { formatBigInt, formatNightBalance, truncateAddress } from "../lib/format";

const NATIVE_TOKEN =
  "0000000000000000000000000000000000000000000000000000000000000000";

const parseAmount = (raw: string): bigint | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  try {
    const amount = BigInt(raw.trim());
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
};

type Balances = {
  shieldedNight: bigint;
  unshieldedNight: bigint;
  shieldedAddress: string;
};

type RuntimeDesiredOutput = {
  kind: "shielded";
  tokenType: string;
  value: bigint;
  recipient: string;
};

export const ShieldNightPage = () => {
  const wallet = useWallet();
  const [amountRaw, setAmountRaw] = useState("100");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  const refresh = useCallback(async () => {
    if (!wallet.connection) return;
    setLoading(true);
    setError(null);
    try {
      const [addresses, shielded, unshielded] = await Promise.all([
        wallet.connection.connected.getShieldedAddresses(),
        wallet.connection.connected.getShieldedBalances(),
        wallet.connection.connected.getUnshieldedBalances(),
      ]);
      setBalances({
        shieldedAddress: addresses.shieldedAddress,
        shieldedNight: shielded[NATIVE_TOKEN] ?? 0n,
        unshieldedNight: unshielded[NATIVE_TOKEN] ?? 0n,
      });
    } catch (err) {
      setError(explainError(err));
    } finally {
      setLoading(false);
    }
  }, [wallet.connection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shield = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!wallet.connection || amount === null || !balances) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (amount > balances.unshieldedNight) {
        throw new Error("Amount exceeds unshielded NIGHT balance.");
      }
      await wallet.connection.connected.hintUsage?.([
        "makeTransfer",
        "submitTransaction",
      ]);
      const output: RuntimeDesiredOutput = {
        kind: "shielded",
        tokenType: NATIVE_TOKEN,
        value: amount,
        recipient: balances.shieldedAddress,
      };
      const transfer = await wallet.connection.connected.makeTransfer(
        [output] as never,
        { payFees: true },
      );
      await wallet.connection.connected.submitTransaction(transfer.tx);
      setSuccess(
        `Shield transaction submitted for ${formatBigInt(amount)} raw NIGHT units.`,
      );
      await refresh();
    } catch (err) {
      setError(explainError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || wallet.status.kind === "connecting";
  const disabled =
    submitting ||
    busy ||
    !wallet.connection ||
    !balances ||
    amount === null ||
    amount > balances.unshieldedNight;

  return (
    <section className="page shield-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Wallet utility</p>
          <h2>Shield NIGHT</h2>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void refresh()}
          disabled={!wallet.connection || loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {!wallet.connection ? (
        <div className="empty-state">
          <p>
            {wallet.status.kind === "connecting" ||
            wallet.status.kind === "checking"
              ? "Connecting wallet..."
              : "Connect wallet from the top bar to shield NIGHT."}
          </p>
        </div>
      ) : (
        <div className="shield-page__layout">
          <dl className="shield-page__balances">
            <div>
              <dt>Unshielded NIGHT</dt>
              <dd data-testid="shield-unshielded-balance">
                {formatBigInt(balances?.unshieldedNight ?? 0n)}
              </dd>
              <span>{formatNightBalance(balances?.unshieldedNight ?? 0n)}</span>
            </div>
            <div>
              <dt>Shielded NIGHT</dt>
              <dd data-testid="shield-shielded-balance">
                {formatBigInt(balances?.shieldedNight ?? 0n)}
              </dd>
              <span>{formatNightBalance(balances?.shieldedNight ?? 0n)}</span>
            </div>
          </dl>

          <form
            className="shield-page__form"
            onSubmit={shield}
            data-testid="shield-form"
          >
            <label className="shield-page__field">
              <span>Amount in raw NIGHT units</span>
              <input
                type="text"
                inputMode="numeric"
                value={amountRaw}
                onChange={(event) => setAmountRaw(event.target.value)}
                data-testid="shield-amount"
              />
            </label>
            <div className="shield-page__presets">
              {["1", "100", "1000", "10000"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setAmountRaw(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="shield-page__recipient">
              <span>Recipient shielded address</span>
              <code title={balances?.shieldedAddress}>
                {balances?.shieldedAddress
                  ? truncateAddress(balances.shieldedAddress, 18, 18)
                  : "Loading..."}
              </code>
            </div>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={disabled}
              data-testid="shield-submit"
            >
              {submitting ? "Waiting for wallet..." : "Shield to this wallet"}
            </button>
            {amount !== null && balances && amount > balances.unshieldedNight && (
              <p className="shield-page__error" role="alert">
                Amount exceeds unshielded NIGHT balance.
              </p>
            )}
            {error && (
              <p
                className="shield-page__error"
                role="alert"
                data-testid="shield-error"
              >
                {error}
              </p>
            )}
            {success && (
              <p className="shield-page__success" data-testid="shield-success">
                {success}
              </p>
            )}
          </form>
        </div>
      )}
    </section>
  );
};
