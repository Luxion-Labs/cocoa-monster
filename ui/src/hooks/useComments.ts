import { useCallback, useEffect, useRef, useState } from "react";

import {
  type Comment,
  isPinataConfigured,
  loadComments,
  publishComment,
  removeComment,
} from "../lib/comments";
import { getOrCreateIdentity } from "../lib/identity";

const POLL_MS = 20_000;

export type CommentView = Comment & {
  /** Local-only: optimistic post not yet confirmed by a reload. */
  readonly pending?: boolean;
};

export type UseComments = {
  readonly comments: CommentView[];
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly configured: boolean;
  readonly myPubKey: string | null;
  post(body: string, file?: File | null): Promise<void>;
  remove(comment: Comment): Promise<void>;
  refresh(): void;
};

/**
 * Loads and polls a market's IPFS comment thread. IPFS has no realtime
 * channel, so we poll (skipping hidden tabs) and reconcile optimistic posts
 * on the next reload.
 */
export const useComments = (market: string | null): UseComments => {
  const configured = isPinataConfigured();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [loading, setLoading] = useState<boolean>(configured && market !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myPubKey, setMyPubKey] = useState<string | null>(null);

  const pendingRef = useRef<CommentView[]>([]);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void getOrCreateIdentity()
      .then((id) => {
        if (!cancelled) setMyPubKey(id.pubKey);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const merge = useCallback((loaded: Comment[]): CommentView[] => {
    const loadedCids = new Set(loaded.map((c) => c.cid));
    // Keep optimistic posts until a reload actually returns them.
    pendingRef.current = pendingRef.current.filter(
      (p) => !loadedCids.has(p.cid),
    );
    return [...loaded, ...pendingRef.current].sort(
      (a, b) => a.createdAt - b.createdAt || a.cid.localeCompare(b.cid),
    );
  }, []);

  const reload = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!market || !configured) return;
      const req = (reqRef.current += 1);
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const loaded = await loadComments(market);
        if (reqRef.current !== req) return; // a newer request superseded us
        setComments(merge(loaded));
        setError(null);
      } catch (err) {
        if (reqRef.current !== req) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (reqRef.current === req) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [market, configured, merge],
  );

  useEffect(() => {
    pendingRef.current = [];
    setComments([]);
    if (!market || !configured) {
      setLoading(false);
      return;
    }
    void reload("initial");
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload("refresh");
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [market, configured, reload]);

  const post = useCallback(
    async (body: string, file?: File | null) => {
      if (!market) throw new Error("No market selected.");
      const created = await publishComment({ market, body, file });
      const optimistic: CommentView = { ...created, pending: true };
      pendingRef.current = [...pendingRef.current, optimistic];
      setComments((prev) =>
        [...prev, optimistic].sort(
          (a, b) => a.createdAt - b.createdAt || a.cid.localeCompare(b.cid),
        ),
      );
      // Pinata listing is eventually consistent; reload shortly after.
      window.setTimeout(() => void reload("refresh"), 2_500);
    },
    [market, reload],
  );

  const remove = useCallback(
    async (comment: Comment) => {
      await removeComment(comment);
      pendingRef.current = pendingRef.current.filter(
        (p) => p.cid !== comment.cid,
      );
      setComments((prev) => prev.filter((c) => c.cid !== comment.cid));
      window.setTimeout(() => void reload("refresh"), 1_500);
    },
    [reload],
  );

  const refresh = useCallback(() => {
    void reload("refresh");
  }, [reload]);

  return {
    comments,
    loading,
    refreshing,
    error,
    configured,
    myPubKey,
    post,
    remove,
    refresh,
  };
};
