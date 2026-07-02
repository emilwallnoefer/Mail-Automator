"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  CHAT_MAX_ATTACHMENT_BYTES,
  CHAT_PAGE_SIZE,
  deleteChatMessage,
  editChatMessage,
  fetchChatHistory,
  fetchVotesForMessages,
  markMessageDone,
  sendChatMessage,
  setMessageVote,
  shortNameFromEmail,
  subscribeToChat,
  summarizeVotes,
  uploadChatAttachment,
  type ChatMessageRow,
  type ChatPresenceUser,
  type ChatVoteRow,
  type MessageKind,
} from "@/lib/chat";
import { playUiSound } from "@/lib/ui-sounds";
import {
  ERROR_AUTO_DISMISS_MS,
  NEAR_BOTTOM_THRESHOLD_PX,
  TYPING_BROADCAST_MIN_INTERVAL_MS,
  TYPING_TIMEOUT_MS,
  UNDO_DELETE_TIMEOUT_MS,
  votableMessageIds,
  type ChatWidgetProps,
  type FilterKey,
  type SendState,
} from "./types";

/** All Team Chat widget state: initial history + realtime subscription, the
 *  scroll/unread bookkeeping, optimistic send/edit/delete/vote/mark flows,
 *  typing indicators, undo-delete timers, and the derived view models. */
export function useChat({ bottomOffsetRem = 1, isAdmin = false }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [votes, setVotes] = useState<ChatVoteRow[]>([]);
  const [presence, setPresence] = useState<ChatPresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { email: string; expiresAt: number }>>(
    {},
  );
  const [draft, setDraft] = useState("");
  const [pendingKind, setPendingKind] = useState<MessageKind>("message");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Pagination
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Scroll bookkeeping for "stay where I am" + jump-to-bottom pill
  const [pendingNew, setPendingNew] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Pending delete with undo toast: keep the original row + a timer to commit
  // the actual server delete if the user doesn't undo in time.
  const [pendingUndo, setPendingUndo] = useState<{
    id: string;
    row: ChatMessageRow;
    expiresAt: number;
  } | null>(null);
  // Live announcement string for screen readers (last incoming message).
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  // Lightbox state for attachment image previews.
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  // Presence overflow popover open/closed.
  const [presenceOpen, setPresenceOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const broadcastTypingRef = useRef<((isTyping: boolean) => Promise<void>) | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  // Refs to keep handlers stable while reflecting latest values.
  const isAtBottomRef = useRef(true);
  isAtBottomRef.current = isAtBottom;
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUserId;
  const messagesRef = useRef<ChatMessageRow[]>([]);
  messagesRef.current = messages;
  // Pending delete commit timers, keyed by message id.
  const undoTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let typingSweep: number | null = null;

    (async () => {
      try {
        const history = await fetchChatHistory();
        if (cancelled) return;
        setMessages(history);
        const initialVotes = await fetchVotesForMessages(votableMessageIds(history));
        if (cancelled) return;
        setVotes(initialVotes);
        // If the initial page is full, assume there's more history to page in.
        setHasMoreHistory(history.length >= CHAT_PAGE_SIZE);
        setLoading(false);

        const sub = await subscribeToChat({
          onInsert: (row) => {
            let appended = false;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              appended = true;
              return [...prev, row];
            });
            if (!appended) return;
            const isMine = row.sender_id === sub.currentUserId;
            // Track unread + pending-new + screen-reader announcements only
            // for messages from other people.
            if (!isMine) {
              if (!openRef.current) {
                setUnread((n) => n + 1);
                playUiSound("switchWhoosh");
              } else if (!isAtBottomRef.current) {
                setPendingNew((n) => n + 1);
              }
              const name = shortNameFromEmail(row.sender_email);
              const summary = row.body
                ? row.body.length > 140
                  ? `${row.body.slice(0, 140)}…`
                  : row.body
                : row.attachment_name
                  ? `sent an attachment: ${row.attachment_name}`
                  : "sent a message";
              setLiveAnnouncement(`${name}: ${summary}`);
            }
          },
          onUpdate: (row) => {
            setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
          },
          onDelete: (id) => {
            setMessages((prev) => prev.filter((m) => m.id !== id));
          },
          onVoteInsert: (row) => {
            setVotes((prev) => {
              if (prev.some((v) => v.message_id === row.message_id && v.user_id === row.user_id)) {
                return prev.map((v) =>
                  v.message_id === row.message_id && v.user_id === row.user_id ? row : v,
                );
              }
              return [...prev, row];
            });
          },
          onVoteUpdate: (row) => {
            setVotes((prev) =>
              prev.map((v) =>
                v.message_id === row.message_id && v.user_id === row.user_id ? row : v,
              ),
            );
          },
          onVoteDelete: ({ message_id, user_id }) => {
            setVotes((prev) =>
              prev.filter((v) => !(v.message_id === message_id && v.user_id === user_id)),
            );
          },
          onPresence: (users) => setPresence(users),
          // Patch up any messages/votes that were missed during a disconnect.
          onReconnect: () => {
            void (async () => {
              try {
                const last = messagesRef.current[messagesRef.current.length - 1];
                const missed = await (last
                  ? fetchChatHistory({ after: last.created_at, limit: CHAT_PAGE_SIZE })
                  : fetchChatHistory());
                if (missed.length > 0) {
                  setMessages((prev) => {
                    const seen = new Set(prev.map((m) => m.id));
                    const additions = missed.filter((m) => !seen.has(m.id));
                    if (additions.length === 0) return prev;
                    return [...prev, ...additions];
                  });
                }
                // Re-sync votes for everything currently loaded (existing window
                // plus anything we just missed).
                const loadedIds = votableMessageIds([...messagesRef.current, ...missed]);
                const freshVotes = await fetchVotesForMessages(loadedIds);
                setVotes(freshVotes);
              } catch {
                // Best-effort: a failed re-sync just leaves the state as-is.
              }
            })();
          },
          onTyping: (payload) => {
            if (!payload.is_typing) {
              setTypingUsers((prev) => {
                if (!prev[payload.user_id]) return prev;
                const next = { ...prev };
                delete next[payload.user_id];
                return next;
              });
              return;
            }
            setTypingUsers((prev) => ({
              ...prev,
              [payload.user_id]: {
                email: payload.email,
                expiresAt: Date.now() + TYPING_TIMEOUT_MS,
              },
            }));
          },
        });

        if (cancelled) {
          await sub.channel.unsubscribe();
          return;
        }

        broadcastTypingRef.current = sub.broadcastTyping;
        setCurrentUserId(sub.currentUserId);
        setCurrentUserEmail(sub.currentEmail);
        await sub.trackPresence();

        typingSweep = window.setInterval(() => {
          setTypingUsers((prev) => {
            const now = Date.now();
            let changed = false;
            const next: typeof prev = {};
            for (const [k, v] of Object.entries(prev)) {
              if (v.expiresAt > now) next[k] = v;
              else changed = true;
            }
            return changed ? next : prev;
          });
        }, 1000);

        unsubscribe = () => {
          void sub.channel.unsubscribe();
        };
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message || "Could not connect to chat.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (typingSweep != null) window.clearInterval(typingSweep);
    };
  }, []);

  // Whenever the panel opens, jump to the latest message and clear unread.
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [open]);

  // Re-scroll only when the user is already at/near the bottom (or when they
  // change the filter, which is an explicit context switch). This prevents
  // new messages from yanking the viewport away while reading older ones.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length, open]);

  // Filter change is an explicit user action — always snap to bottom.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    setPendingNew(0);
  }, [filter, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (editingId) setEditingId(null);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editingId, lightbox]);

  // Auto-dismiss errors after a few seconds.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [error]);

  // Track scroll position so the insert handler / pill know whether the
  // user is currently at the bottom.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < NEAR_BOTTOM_THRESHOLD_PX;
    setIsAtBottom(near);
    if (near) setPendingNew(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPendingNew(0);
  }, []);

  const handleLoadOlder = useCallback(async () => {
    if (loadingMore || !hasMoreHistory) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    const el = scrollRef.current;
    const previousScrollHeight = el?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      const older = await fetchChatHistory({ before: oldest.created_at, limit: CHAT_PAGE_SIZE });
      if (older.length === 0) {
        setHasMoreHistory(false);
        return;
      }
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const additions = older.filter((m) => !seen.has(m.id));
        return [...additions, ...prev];
      });
      // Pull in votes for the older page so its tallies render correctly.
      const olderVotes = await fetchVotesForMessages(votableMessageIds(older));
      if (olderVotes.length > 0) {
        setVotes((prev) => {
          const seen = new Set(prev.map((v) => `${v.message_id}:${v.user_id}`));
          const additions = olderVotes.filter((v) => !seen.has(`${v.message_id}:${v.user_id}`));
          return additions.length > 0 ? [...prev, ...additions] : prev;
        });
      }
      setHasMoreHistory(older.length >= CHAT_PAGE_SIZE);
      // Preserve visible position by adjusting scrollTop for the height delta.
      requestAnimationFrame(() => {
        const after = scrollRef.current;
        if (!after) return;
        after.scrollTop = after.scrollHeight - previousScrollHeight;
      });
    } catch (err) {
      setError((err as Error).message || "Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreHistory]);

  const voteSummary = useMemo(() => summarizeVotes(votes, currentUserId), [votes, currentUserId]);

  const visibleMessages = useMemo(() => {
    if (filter === "all") return messages;
    return messages.filter((m) => m.kind === filter && !m.done_at);
  }, [messages, filter]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: messages.length,
      feature_request: 0,
      change_request: 0,
      best_practice: 0,
    };
    for (const m of messages) {
      if (m.kind === "message" || m.done_at) continue;
      if (m.kind === "feature_request") counts.feature_request += 1;
      else if (m.kind === "change_request") counts.change_request += 1;
      else if (m.kind === "best_practice") counts.best_practice += 1;
    }
    return counts;
  }, [messages]);

  const handleDraftChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft(value);
    const broadcast = broadcastTypingRef.current;
    if (!broadcast) return;
    const now = Date.now();
    if (value.trim().length === 0) {
      lastTypingSentAtRef.current = 0;
      void broadcast(false);
      return;
    }
    if (now - lastTypingSentAtRef.current > TYPING_BROADCAST_MIN_INTERVAL_MS) {
      lastTypingSentAtRef.current = now;
      void broadcast(true);
    }
  }, []);

  /*
   * All mutating actions below follow the same pattern: update local state
   * *synchronously* so the UI responds instantly, then fire the network
   * request in the background. If the server rejects, we revert the local
   * change and surface an error. Optimistic rows use client-generated UUIDs
   * that match the server-side id, so when the Realtime echo arrives we
   * silently dedupe instead of flashing a duplicate.
   */
  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!currentUserId) return;

    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kindAtSend = pendingKind;
    const optimistic: ChatMessageRow = {
      id,
      sender_id: currentUserId,
      sender_email: currentUserEmail ?? "unknown",
      body: trimmed,
      attachment_path: null,
      attachment_name: null,
      attachment_type: null,
      attachment_size: null,
      kind: kindAtSend,
      created_at: new Date().toISOString(),
      edited_at: null,
      done_at: null,
      done_by: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setPendingKind("message");
    setError(null);
    lastTypingSentAtRef.current = 0;
    const broadcast = broadcastTypingRef.current;
    if (broadcast) void broadcast(false);
    playUiSound("mailSend");

    void (async () => {
      try {
        const saved = await sendChatMessage({ id, body: trimmed, kind: kindAtSend });
        setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setDraft((current) => (current === "" ? trimmed : current));
        setPendingKind(kindAtSend);
        setError((err as Error).message || "Failed to send.");
      }
    })();
  }, [draft, pendingKind, currentUserId, currentUserEmail]);

  const uploadAndSendAttachment = useCallback(
    async (file: File) => {
      if (file.size > CHAT_MAX_ATTACHMENT_BYTES) {
        setError(`File too large. Max ${Math.round(CHAT_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
        return;
      }
      // The upload itself is slow (network + storage), so we keep a spinner
      // on the composer for attachments. The DB insert still runs in the
      // background once the upload completes so the message appears the
      // instant the upload finishes.
      setSendState("sending");
      setError(null);
      const bodyAtPick = draft.trim() || undefined;
      const kindAtPick = pendingKind;
      try {
        const uploaded = await uploadChatAttachment(file);
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimistic: ChatMessageRow = {
          id,
          sender_id: currentUserId ?? "",
          sender_email: currentUserEmail ?? "unknown",
          body: bodyAtPick ?? null,
          attachment_path: uploaded.path,
          attachment_name: uploaded.name,
          attachment_type: uploaded.type,
          attachment_size: uploaded.size,
          kind: kindAtPick,
          created_at: new Date().toISOString(),
          edited_at: null,
          done_at: null,
          done_by: null,
        };
        setMessages((prev) => [...prev, optimistic]);
        setDraft("");
        setPendingKind("message");
        playUiSound("mailSend");
        setSendState("idle");
        void (async () => {
          try {
            const saved = await sendChatMessage({
              id,
              body: bodyAtPick,
              kind: kindAtPick,
              attachment: uploaded,
            });
            setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
          } catch (err) {
            setMessages((prev) => prev.filter((m) => m.id !== id));
            setError((err as Error).message || "Failed to send.");
          }
        })();
      } catch (err) {
        setError((err as Error).message || "Upload failed.");
        setSendState("idle");
      }
    },
    [draft, pendingKind, currentUserId, currentUserEmail],
  );

  const handleAttachmentPick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await uploadAndSendAttachment(file);
    },
    [uploadAndSendAttachment],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleVote = useCallback(
    (messageId: string, current: -1 | 0 | 1, next: -1 | 1) => {
      if (!currentUserId) return;
      const newVote = current === next ? 0 : next;
      // Snapshot so we can revert on error.
      const snapshot = votes;
      setVotes((prev) => {
        const without = prev.filter((v) => !(v.message_id === messageId && v.user_id === currentUserId));
        if (newVote === 0) return without;
        return [...without, { message_id: messageId, user_id: currentUserId, vote: newVote }];
      });
      void (async () => {
        try {
          await setMessageVote(messageId, newVote);
        } catch (err) {
          setVotes(snapshot);
          setError((err as Error).message || "Vote failed.");
        }
      })();
    },
    [currentUserId, votes],
  );

  const handleMarkDone = useCallback(
    (messageId: string, done: boolean) => {
      const timestamp = done ? new Date().toISOString() : null;
      const doneBy = done ? currentUserId : null;
      let previous: ChatMessageRow | undefined;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          previous = m;
          return { ...m, done_at: timestamp, done_by: doneBy };
        }),
      );
      void (async () => {
        try {
          const updated = await markMessageDone(messageId, done);
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        } catch (err) {
          if (previous) {
            const restored = previous;
            setMessages((prev) => prev.map((m) => (m.id === messageId ? restored : m)));
          }
          setError((err as Error).message || "Could not update.");
        }
      })();
    },
    [currentUserId],
  );

  const handleSaveEdit = useCallback((messageId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const timestamp = new Date().toISOString();
    let previous: ChatMessageRow | undefined;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        previous = m;
        return { ...m, body: trimmed, edited_at: timestamp };
      }),
    );
    setEditingId(null);
    void (async () => {
      try {
        const updated = await editChatMessage(messageId, trimmed);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } catch (err) {
        if (previous) {
          const restored = previous;
          setMessages((prev) => prev.map((m) => (m.id === messageId ? restored : m)));
        }
        setError((err as Error).message || "Could not edit.");
      }
    })();
  }, []);

  /*
   * Soft-delete with Undo: the message is removed from the UI immediately and
   * an Undo toast appears. The actual server delete is fired only after the
   * undo window expires. Tapping Undo restores the row and cancels the
   * pending commit.
   */
  const handleDelete = useCallback((messageId: string) => {
    let previous: ChatMessageRow | undefined;
    setMessages((prev) => {
      previous = prev.find((m) => m.id === messageId);
      return prev.filter((m) => m.id !== messageId);
    });
    if (!previous) return;
    const row = previous;
    setPendingUndo({ id: messageId, row, expiresAt: Date.now() + UNDO_DELETE_TIMEOUT_MS });
    const existing = undoTimersRef.current.get(messageId);
    if (existing) window.clearTimeout(existing);
    const timerId = window.setTimeout(() => {
      undoTimersRef.current.delete(messageId);
      setPendingUndo((current) => (current && current.id === messageId ? null : current));
      void (async () => {
        try {
          await deleteChatMessage(messageId);
        } catch (err) {
          // Server rejected the delete — bring the message back.
          setMessages((prev) => {
            if (prev.some((m) => m.id === messageId)) return prev;
            return [...prev, row].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
          });
          setError((err as Error).message || "Delete failed.");
        }
      })();
    }, UNDO_DELETE_TIMEOUT_MS);
    undoTimersRef.current.set(messageId, timerId);
  }, []);

  const handleUndoDelete = useCallback(() => {
    setPendingUndo((current) => {
      if (!current) return null;
      const timer = undoTimersRef.current.get(current.id);
      if (timer) window.clearTimeout(timer);
      undoTimersRef.current.delete(current.id);
      const restored = current.row;
      setMessages((prev) => {
        if (prev.some((m) => m.id === restored.id)) return prev;
        return [...prev, restored].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
      return null;
    });
  }, []);

  /*
   * Paste-to-upload: when the user pastes an image into the textarea, treat
   * it as an attachment send. Falls through to default paste behavior if no
   * image is present in the clipboard.
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          void uploadAndSendAttachment(file);
          return;
        }
      }
    },
    [uploadAndSendAttachment],
  );

  const onlineCount = presence.length;
  const otherTypingNames = useMemo(() => {
    const now = Date.now();
    return Object.entries(typingUsers)
      .filter(([id, v]) => id !== currentUserId && v.expiresAt > now)
      .map(([, v]) => shortNameFromEmail(v.email));
  }, [typingUsers, currentUserId]);

  return {
    // props echoed for the orchestrator
    bottomOffsetRem,
    isAdmin,
    // panel + connection state
    open,
    setOpen,
    loading,
    error,
    setError,
    unread,
    liveAnnouncement,
    currentUserId,
    presence,
    onlineCount,
    presenceOpen,
    setPresenceOpen,
    otherTypingNames,
    // messages + pagination
    visibleMessages,
    voteSummary,
    hasMoreHistory,
    loadingMore,
    handleLoadOlder,
    // scroll bookkeeping
    scrollRef,
    handleScroll,
    scrollToBottom,
    isAtBottom,
    pendingNew,
    // composer
    draft,
    handleDraftChange,
    handleKeyDown,
    handlePaste,
    pendingKind,
    setPendingKind,
    sendState,
    fileInputRef,
    handleSend,
    handleAttachmentPick,
    // filter
    filter,
    setFilter,
    filterCounts,
    // per-message actions
    editingId,
    setEditingId,
    handleSaveEdit,
    handleDelete,
    handleVote,
    handleMarkDone,
    // undo + lightbox
    pendingUndo,
    handleUndoDelete,
    lightbox,
    setLightbox,
  };
}

export type ChatState = ReturnType<typeof useChat>;
