import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useComments } from "../hooks/useComments";
import { useWallet } from "../hooks/useWallet";
import { avatarColor, setHandle } from "../lib/identity";
import { MAX_BODY, gatewayUrl, type Comment } from "../lib/comments";

const HIDDEN_KEY = "cocoa.hiddenComments";

const readHidden = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const writeHidden = (set: Set<string>): void => {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable — hiding is best-effort */
  }
};

const relativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
};

const isImage = (mime: string): boolean => mime.startsWith("image/");

export const MarketComments = ({
  marketAddress,
}: {
  marketAddress: string;
}) => {
  const wallet = useWallet();
  const {
    comments,
    loading,
    refreshing,
    error,
    configured,
    myPubKey,
    post,
    remove,
    refresh,
  } = useComments(marketAddress);

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hidden, setHiddenState] = useState<Set<string>>(() => readHidden());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writeHidden(hidden);
  }, [hidden]);

  const hide = useCallback((cid: string) => {
    setHiddenState((prev) => new Set(prev).add(cid));
  }, []);

  const visible = useMemo(
    () => comments.filter((c) => !hidden.has(c.cid)),
    [comments, hidden],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setPosting(true);
      try {
        await post(body, file);
        setBody("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
      } finally {
        setPosting(false);
      }
    },
    [body, file, post],
  );

  const onRemove = useCallback(
    async (comment: Comment) => {
      try {
        await remove(comment);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
      }
    },
    [remove],
  );

  const rename = useCallback(() => {
    const next = window.prompt("Display name (handle)");
    if (next && next.trim()) setHandle(next);
  }, []);

  return (
    <section className="discussion" data-testid="market-discussion">
      <div className="discussion__head">
        <div className="market-detail__section-label">
          Discussion {visible.length > 0 ? `· ${visible.length}` : ""}
        </div>
        {configured && (
          <button
            type="button"
            className="btn btn--secondary discussion__refresh"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {!configured ? (
        <p className="discussion__notice">
          Comments are disabled — set <code>VITE_PINATA_JWT</code> (and
          optionally <code>VITE_PINATA_GATEWAY</code>) in runtime config to
          enable IPFS-backed discussion.
        </p>
      ) : (
        <>
          <p className="discussion__notice">
            Comments are stored publicly and permanently on IPFS. Your comment
            identity is separate from your wallet — don't post anything that
            links it to your private positions.
          </p>

          {error && (
            <p className="market-detail__error" role="alert">
              {error}
            </p>
          )}

          <div className="discussion__list" data-testid="discussion-list">
            {loading && comments.length === 0 ? (
              <p className="discussion__empty">Loading comments…</p>
            ) : visible.length === 0 ? (
              <p className="discussion__empty">
                No comments yet. Start the conversation.
              </p>
            ) : (
              visible.map((c) => (
                <article
                  key={c.cid}
                  className={`comment${c.pending ? " comment--pending" : ""}`}
                >
                  <div
                    className="comment__avatar"
                    style={{ background: avatarColor(c.fingerprint) }}
                    aria-hidden="true"
                  >
                    {c.author.handle.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="comment__main">
                    <div className="comment__meta">
                      <span className="comment__handle">
                        {c.author.handle}
                      </span>
                      <span className="comment__fp" title="Author key fingerprint">
                        {c.fingerprint}
                      </span>
                      <span
                        className="comment__time"
                        title={new Date(c.createdAt).toLocaleString()}
                      >
                        {c.pending ? "posting…" : relativeTime(c.createdAt)}
                      </span>
                    </div>
                    {c.body && <p className="comment__body">{c.body}</p>}
                    {c.attachment &&
                      (isImage(c.attachment.mime) ? (
                        <a
                          href={gatewayUrl(c.attachment.cid)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <img
                            className="comment__image"
                            src={gatewayUrl(c.attachment.cid)}
                            alt={c.attachment.name}
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <a
                          className="comment__file"
                          href={gatewayUrl(c.attachment.cid)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          📎 {c.attachment.name}
                        </a>
                      ))}
                    <div className="comment__actions">
                      {myPubKey === c.author.pubKey && !c.pending && (
                        <button
                          type="button"
                          className="comment__action"
                          onClick={() => void onRemove(c)}
                        >
                          Remove
                        </button>
                      )}
                      {!c.pending && (
                        <button
                          type="button"
                          className="comment__action"
                          onClick={() => hide(c.cid)}
                        >
                          Hide
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {wallet.connection ? (
            <form className="discussion__composer" onSubmit={submit}>
              <textarea
                className="discussion__textarea"
                placeholder="Add a comment…"
                value={body}
                maxLength={MAX_BODY}
                rows={3}
                onChange={(e) => setBody(e.target.value)}
                disabled={posting}
                data-testid="discussion-input"
              />
              <div className="discussion__composer-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={posting}
                />
                <span className="discussion__count">
                  {body.length}/{MAX_BODY}
                </span>
                <button
                  type="button"
                  className="comment__action"
                  onClick={rename}
                >
                  Rename
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={posting || (!body.trim() && !file)}
                  data-testid="discussion-submit"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
              {formError && (
                <p className="market-detail__error" role="alert">
                  {formError}
                </p>
              )}
            </form>
          ) : (
            <div className="market-detail__connect-prompt">
              <p>Connect wallet from the top bar to join the discussion.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
