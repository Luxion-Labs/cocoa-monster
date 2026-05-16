/**
 * Pretty-print errors that come back from midnight-js / compact-js.
 *
 * The 4.x SDK is built on Effect-TS, so errors typically arrive as a
 * `FiberFailure` whose own `message` is empty — the real failure lives
 * under `.cause`, which is a `Cause<E>` ADT (Sequential / Parallel /
 * Fail / Die / Interrupt). Walking the cause tree pulls out the
 * leaf-level error so the UI shows something actionable instead of a
 * blank string.
 */
type CauseLike = {
  readonly _tag?: string;
  readonly error?: unknown;
  readonly defect?: unknown;
  readonly left?: unknown;
  readonly right?: unknown;
  readonly cause?: unknown;
  readonly message?: unknown;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const collectMessages = (cause: unknown, out: string[]): void => {
  if (!isObject(cause)) {
    if (typeof cause === "string" && cause.length > 0) out.push(cause);
    return;
  }
  const c = cause as CauseLike;
  if (typeof c.message === "string" && c.message.length > 0) out.push(c.message);
  // Effect Cause walks
  if (c.error !== undefined) collectMessages(c.error, out);
  if (c.defect !== undefined) collectMessages(c.defect, out);
  if (c.left !== undefined) collectMessages(c.left, out);
  if (c.right !== undefined) collectMessages(c.right, out);
  if (c.cause !== undefined) collectMessages(c.cause, out);
};

export const explainError = (err: unknown): string => {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const out: string[] = [];
  collectMessages(err, out);
  // Dedupe + drop the FiberFailure noise
  const filtered = [...new Set(out)].filter(
    (m) => m && !m.startsWith("FiberFailure"),
  );
  if (filtered.length > 0) return filtered.join(" — ");
  // Fallback: stringify whatever shape we got, capped so a giant
  // Effect cause tree doesn't blow up the UI.
  try {
    return JSON.stringify(err, null, 2).slice(0, 800);
  } catch {
    return String(err);
  }
};
