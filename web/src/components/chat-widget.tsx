"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CHAT_MAX_ATTACHMENT_BYTES,
  CHAT_PAGE_SIZE,
  TAGGED_KINDS,
  dayKeyFromIso,
  deleteChatMessage,
  editChatMessage,
  fetchAllVotes,
  fetchChatHistory,
  formatChatTimestamp,
  formatDaySeparator,
  getAttachmentSignedUrl,
  initialsFromEmail,
  isMarkableKind,
  isVotableKind,
  markMessageDone,
  messageKindLabel,
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
  type VoteSummary,
} from "@/lib/chat";
import { playUiSound } from "@/lib/ui-sounds";

const TYPING_TIMEOUT_MS = 3500;
const TYPING_BROADCAST_MIN_INTERVAL_MS = 1500;
/** Pixels from the bottom we still consider "at the bottom" for auto-scroll. */
const NEAR_BOTTOM_THRESHOLD_PX = 80;
/** How long an Undo toast stays before the deletion is committed. */
const UNDO_DELETE_TIMEOUT_MS = 5000;
/** How long an error banner sticks around before auto-dismissing. */
const ERROR_AUTO_DISMISS_MS = 4500;

type ChatWidgetProps = {
  /** Bottom offset (in rem) so we can stack above other floating prompts. */
  bottomOffsetRem?: number;
  /** When true, this user can mark feature/change requests as done. */
  isAdmin?: boolean;
};

type SendState = "idle" | "sending";
type FilterKey = "all" | "feature_request" | "change_request" | "best_practice";

export function ChatWidget({ bottomOffsetRem = 1, isAdmin = false }: ChatWidgetProps) {
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
        const [history, allVotes] = await Promise.all([fetchChatHistory(), fetchAllVotes()]);
        if (cancelled) return;
        setMessages(history);
        setVotes(allVotes);
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
                const [missed, freshVotes] = await Promise.all([
                  last
                    ? fetchChatHistory({ after: last.created_at, limit: CHAT_PAGE_SIZE })
                    : fetchChatHistory(),
                  fetchAllVotes(),
                ]);
                if (missed.length > 0) {
                  setMessages((prev) => {
                    const seen = new Set(prev.map((m) => m.id));
                    const additions = missed.filter((m) => !seen.has(m.id));
                    if (additions.length === 0) return prev;
                    return [...prev, ...additions];
                  });
                }
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

  return (
    <>
      {/* Hide the floating trigger pill when the panel is open — it would
          otherwise visibly stick out behind the bottom-right corner of the
          floating "iPhone" panel. */}
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="chat-trigger"
            type="button"
            aria-label="Open team chat"
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onClick={() => {
              playUiSound("switchWhoosh");
              setOpen(true);
            }}
            style={{ bottom: `${bottomOffsetRem}rem` }}
            className="fixed right-4 z-[125] inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_18px_36px_-12px_rgba(34,211,238,0.55)] backdrop-blur transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            <ChatBubbleIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Team chat</span>
            {unread > 0 ? (
              <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Visually hidden live region for screen readers — updated with the
          last incoming message so SR users hear it without the panel needing
          to be open. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="chat-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[130] bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.aside
              key="chat-panel"
              role="dialog"
              aria-label="Team chat"
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 18 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              style={{ transformOrigin: "bottom right" }}
              className="fixed bottom-5 right-5 z-[131] flex h-[calc(100vh-2.5rem)] max-h-[780px] w-[min(94vw,380px)] flex-col rounded-[2.75rem] bg-gradient-to-b from-slate-700/80 via-slate-900 to-slate-950 p-[6px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.75),0_10px_30px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
            >
              {/* Inner "screen" — content lives here; rounded slightly less than the frame so the bezel reads as a thin band. */}
              <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.3rem] bg-slate-950 ring-1 ring-inset ring-white/5">
                {/* Compact one-row header: identity on the left, presence + close on the right. */}
                <header className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-4 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-indigo-500/30 ring-1 ring-inset ring-white/15">
                    <ChatBubbleIcon className="h-4 w-4 text-cyan-100" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-white">Team chat</h2>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          onlineCount > 0 ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-slate-500"
                        }`}
                        aria-hidden
                      />
                      <span>{onlineCount === 0 ? "Connecting…" : `${onlineCount} online`}</span>
                    </div>
                  </div>
                  <PresenceAvatars
                    users={presence}
                    currentUserId={currentUserId}
                    open={presenceOpen}
                    setOpen={setPresenceOpen}
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </header>

                <FilterStrip filter={filter} setFilter={setFilter} counts={filterCounts} />

                <div className="relative flex-1 overflow-hidden">
                  <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="absolute inset-0 space-y-3 overflow-y-auto px-4 py-3"
                  >
                    {hasMoreHistory ? (
                      <div className="flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleLoadOlder();
                          }}
                          disabled={loadingMore}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingMore ? (
                            <SpinnerIcon className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowUpIcon className="h-3 w-3" />
                          )}
                          {loadingMore ? "Loading…" : "Load older"}
                        </button>
                      </div>
                    ) : null}

                    {loading ? (
                      <p className="text-center text-xs text-slate-400">Loading conversation…</p>
                    ) : visibleMessages.length === 0 ? (
                      <p className="mt-8 text-center text-xs text-slate-400">
                        {filter === "all"
                          ? "No messages yet — say hi to your team."
                          : "Nothing here. Try a different filter or post a new one below."}
                      </p>
                    ) : (
                      <AnimatePresence initial={false}>
                        {(() => {
                          const items: ReactNode[] = [];
                          let lastDayKey: string | null = null;
                          visibleMessages.forEach((m, i) => {
                            const dayKey = dayKeyFromIso(m.created_at);
                            const isNewDay = dayKey !== lastDayKey;
                            if (isNewDay) {
                              items.push(
                                <DaySeparator
                                  key={`sep-${dayKey}`}
                                  label={formatDaySeparator(m.created_at)}
                                />,
                              );
                              lastDayKey = dayKey;
                            }
                            const previous = isNewDay ? undefined : visibleMessages[i - 1];
                            const showHeader =
                              !previous ||
                              previous.sender_id !== m.sender_id ||
                              previous.kind !== m.kind ||
                              new Date(m.created_at).getTime() -
                                new Date(previous.created_at).getTime() >
                                5 * 60 * 1000;
                            items.push(
                              <motion.div
                                key={m.id}
                                layout="position"
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                              >
                                <MessageRow
                                  message={m}
                                  isMe={m.sender_id === currentUserId}
                                  showHeader={showHeader}
                                  isAdmin={isAdmin}
                                  isEditing={editingId === m.id}
                                  votes={voteSummary.get(m.id)}
                                  onStartEdit={() => setEditingId(m.id)}
                                  onCancelEdit={() => setEditingId(null)}
                                  onSaveEdit={(body) => handleSaveEdit(m.id, body)}
                                  onDelete={() => handleDelete(m.id)}
                                  onVote={(next) =>
                                    handleVote(m.id, voteSummary.get(m.id)?.mine ?? 0, next)
                                  }
                                  onMarkDone={(done) => handleMarkDone(m.id, done)}
                                  onOpenImage={(url, name) => setLightbox({ url, name })}
                                />
                              </motion.div>,
                            );
                          });
                          return items;
                        })()}
                      </AnimatePresence>
                    )}
                  </div>

                  {/* Jump-to-bottom pill — appears when the user has scrolled
                      up and new messages have arrived. */}
                  <AnimatePresence>
                    {!isAtBottom && pendingNew > 0 ? (
                      <motion.button
                        key="jump-pill"
                        type="button"
                        onClick={scrollToBottom}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-400/90 px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-[0_6px_18px_-6px_rgba(34,211,238,0.6)] backdrop-blur"
                      >
                        <ArrowDownIcon className="h-3 w-3" />
                        {pendingNew} new {pendingNew === 1 ? "message" : "messages"}
                      </motion.button>
                    ) : null}
                  </AnimatePresence>
                </div>

                <TypingStrip names={otherTypingNames} />

                <AnimatePresence>
                  {pendingUndo ? (
                    <motion.div
                      key="undo-toast"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.7)]"
                    >
                      <span>Message deleted</span>
                      <button
                        type="button"
                        onClick={handleUndoDelete}
                        className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
                      >
                        Undo
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence>
                  {error ? (
                    <motion.div
                      key="error-banner"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="flex items-center justify-between gap-2 border-t border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200"
                      role="alert"
                    >
                      <span className="min-w-0 flex-1 truncate">{error}</span>
                      <button
                        type="button"
                        onClick={() => setError(null)}
                        aria-label="Dismiss error"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-rose-200 transition hover:bg-rose-500/20"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="border-t border-white/10 bg-slate-950/70 px-3 py-3">
                  <KindToggleRow pendingKind={pendingKind} setPendingKind={setPendingKind} />
                  <div className="mt-2 flex items-end gap-2 rounded-2xl border border-white/12 bg-white/5 px-2 py-1.5 focus-within:border-cyan-300/50 focus-within:bg-white/[0.07]">
                    <button
                      type="button"
                      aria-label="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sendState === "sending"}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <PaperclipIcon className="h-4 w-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        void handleAttachmentPick(e);
                      }}
                    />
                    <textarea
                      rows={1}
                      value={draft}
                      onChange={handleDraftChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={
                        pendingKind === "message"
                          ? "Message your team…"
                          : `Posting as ${messageKindLabel(pendingKind).toLowerCase()}…`
                      }
                      className="min-h-9 max-h-32 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleSend();
                      }}
                      disabled={sendState === "sending" || draft.trim().length === 0}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/90 text-slate-900 shadow-[0_4px_14px_-4px_rgba(34,211,238,0.6)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700/60 disabled:text-slate-400 disabled:shadow-none"
                      aria-label="Send"
                    >
                      {sendState === "sending" ? (
                        <SpinnerIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <SendIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.aside>

            {/* Image lightbox overlay (rendered last so it sits on top of the
                panel and the backdrop). */}
            <AnimatePresence>
              {lightbox ? (
                <motion.div
                  key="chat-lightbox"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur"
                  onClick={() => setLightbox(null)}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Image preview: ${lightbox.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightbox.url}
                    alt={lightbox.name}
                    className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={() => setLightbox(null)}
                    aria-label="Close preview"
                    className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-slate-900/80 text-white transition hover:bg-slate-800"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// --- Sub-components ----------------------------------------------------

function KindToggleRow({
  pendingKind,
  setPendingKind,
}: {
  pendingKind: MessageKind;
  setPendingKind: (k: MessageKind) => void;
}) {
  /*
   * Segmented mode picker: shows all 4 send modes (the default "Message" plus
   * the three taggable kinds). Always-visible "Message" button so users can
   * see which mode they're in at a glance and tap to switch back.
   */
  const items: { id: MessageKind; label: string; icon: typeof ChatBubbleIcon; meta?: KindMeta }[] = [
    { id: "message", label: "Message", icon: ChatBubbleIcon },
    ...TAGGED_KINDS.map((k) => ({
      id: k,
      label: KIND_META[k].shortLabel,
      icon: KIND_META[k].Icon,
      meta: KIND_META[k],
    })),
  ];
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/5">
      {items.map((item) => {
        const active = pendingKind === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => setPendingKind(item.id)}
            className={`flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-medium transition ${
              active
                ? item.meta
                  ? `${item.meta.activeBg} ${item.meta.activeText} shadow-[0_1px_0_rgba(255,255,255,0.06)]`
                  : "bg-white/12 text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            }`}
            title={item.meta?.shortDescription ?? "Send as a regular message"}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FilterStrip({
  filter,
  setFilter,
  counts,
}: {
  filter: FilterKey;
  setFilter: (k: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  const items: { id: FilterKey; label: string; count: number; icon?: typeof LightbulbIcon }[] = [
    { id: "all", label: "All", count: counts.all },
    {
      id: "feature_request",
      label: "Features",
      count: counts.feature_request,
      icon: LightbulbIcon,
    },
    {
      id: "change_request",
      label: "Changes",
      count: counts.change_request,
      icon: PencilSquareIcon,
    },
    { id: "best_practice", label: "Practices", count: counts.best_practice, icon: StarIcon },
  ];
  return (
    <div className="border-b border-white/10 bg-slate-950/60 px-3 py-2">
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white/[0.03] p-1 ring-1 ring-inset ring-white/5">
        {items.map((item) => {
          const active = filter === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`group inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                active
                  ? "bg-cyan-400/15 text-cyan-100 shadow-[0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-cyan-300/40"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
              {item.count > 0 ? (
                <span
                  className={`ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold ${
                    active
                      ? "bg-cyan-400/30 text-cyan-50"
                      : "bg-white/10 text-slate-300 group-hover:bg-white/15"
                  }`}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/*
 * Tiny stacked-avatar group used inside the header to show who's online without
 * eating its own row. Shows up to 3 initials avatars + a "+N" overflow chip.
 */
function PresenceAvatars({
  users,
  currentUserId,
  open,
  setOpen,
}: {
  users: ChatPresenceUser[];
  currentUserId: string | null;
  open: boolean;
  setOpen: (next: boolean) => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Close popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDocDown);
    return () => window.removeEventListener("mousedown", onDocDown);
  }, [open, setOpen]);

  if (users.length === 0) return null;
  const maxVisible = 3;
  const visible = users.slice(0, maxVisible);
  const overflow = users.length - visible.length;
  // Sort full list with "you" first, then alphabetically by name.
  const sorted = [...users].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return shortNameFromEmail(a.email).localeCompare(shortNameFromEmail(b.email));
  });

  return (
    <div ref={popoverRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${users.length} online — show list`}
        className="flex items-center -space-x-2 rounded-full p-0.5 transition hover:bg-white/5"
      >
        {visible.map((u) => {
          const isMe = u.user_id === currentUserId;
          return (
            <span
              key={u.user_id}
              title={`${shortNameFromEmail(u.email)}${isMe ? " (you)" : ""}`}
              className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-slate-950 ${
                isMe
                  ? "bg-gradient-to-br from-cyan-300 to-indigo-400 text-slate-950"
                  : "bg-gradient-to-br from-slate-600 to-slate-800 text-slate-100"
              }`}
            >
              {initialsFromEmail(u.email)}
            </span>
          );
        })}
        {overflow > 0 ? (
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-200 ring-2 ring-slate-950"
            title={`${overflow} more online`}
          >
            +{overflow}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-[0_18px_36px_-12px_rgba(0,0,0,0.8)] backdrop-blur"
            role="dialog"
            aria-label="Online members"
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {sorted.map((u) => {
                const isMe = u.user_id === currentUserId;
                return (
                  <div
                    key={u.user_id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-slate-200"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${
                        isMe
                          ? "bg-gradient-to-br from-cyan-300 to-indigo-400 text-slate-950"
                          : "bg-gradient-to-br from-slate-600 to-slate-800 text-slate-100"
                      }`}
                    >
                      {initialsFromEmail(u.email)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {shortNameFromEmail(u.email)}
                      {isMe ? <span className="ml-1 text-slate-400">(you)</span> : null}
                    </span>
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]"
                      aria-label="online"
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="relative my-3 flex items-center justify-center" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/8" />
      <span className="relative rounded-full border border-white/10 bg-slate-950 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
    </div>
  );
}

function TypingStrip({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <div className="h-5" aria-hidden />;
  }
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing…`
        : `${names.length} people are typing…`;
  return (
    <div className="flex items-center gap-2 px-4 pb-1 text-[11px] italic text-slate-400">
      <TypingDots />
      <span>{label}</span>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="h-1 w-1 animate-pulse rounded-full bg-slate-300/80 [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-slate-300/80 [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-slate-300/80 [animation-delay:300ms]" />
    </span>
  );
}

type MessageRowProps = {
  message: ChatMessageRow;
  isMe: boolean;
  showHeader: boolean;
  isAdmin: boolean;
  isEditing: boolean;
  votes?: VoteSummary;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => void;
  onDelete: () => void;
  onVote: (next: -1 | 1) => void;
  onMarkDone: (done: boolean) => void;
  onOpenImage: (url: string, name: string) => void;
};

function MessageRow({
  message,
  isMe,
  showHeader,
  isAdmin,
  isEditing,
  votes,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onVote,
  onMarkDone,
  onOpenImage,
}: MessageRowProps) {
  const initials = initialsFromEmail(message.sender_email);
  const name = shortNameFromEmail(message.sender_email);
  const tagged = message.kind !== "message";
  const meta = tagged ? KIND_META[message.kind as Exclude<MessageKind, "message">] : null;
  const isDone = Boolean(message.done_at);

  return (
    <div className={`chat-message-row group flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      <div className="w-7 shrink-0">
        {showHeader ? (
          <span
            className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ${
              isMe
                ? "bg-gradient-to-br from-cyan-300 to-indigo-400 text-slate-950"
                : "bg-gradient-to-br from-slate-700 to-slate-900 text-slate-100"
            }`}
            aria-hidden
          >
            {initials}
          </span>
        ) : null}
      </div>
      <div className={`flex min-w-0 max-w-[78%] flex-col ${isMe ? "items-end" : "items-start"}`}>
        {showHeader ? (
          <p className="mb-0.5 text-[10px] text-slate-400">
            {isMe ? "You" : name} · {formatChatTimestamp(message.created_at)}
            {message.edited_at ? <span className="ml-1 italic text-slate-500">(edited)</span> : null}
          </p>
        ) : null}

        {tagged && meta ? (
          <div className={`mb-1 inline-flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.badgeBorder} ${meta.badgeBg} ${meta.badgeText} ${
                isDone ? "opacity-60 saturate-50" : ""
              }`}
            >
              <meta.Icon className="h-3 w-3" />
              {meta.shortLabel}
            </span>
            {isDone ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300/55 bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200"
                title="Marked as done by an admin"
              >
                <CheckIcon className="h-3 w-3" /> Done
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Relative wrapper: anchors the floating action bar to the bubble itself. */}
        <div className="relative min-w-0 max-w-full">
          <div
            className={`rounded-2xl px-3 py-2 text-sm leading-relaxed transition ${
              isMe
                ? "rounded-br-sm bg-cyan-400/90 text-slate-900"
                : "rounded-bl-sm bg-white/8 text-slate-100"
            } ${isDone ? "opacity-65 saturate-50" : ""}`}
          >
            {isEditing ? (
              <EditField initialBody={message.body ?? ""} onSave={onSaveEdit} onCancel={onCancelEdit} />
            ) : message.body ? (
              <p
                className={`whitespace-pre-wrap break-words ${
                  isDone ? "line-through decoration-slate-400/70 decoration-2" : ""
                }`}
              >
                {message.body}
              </p>
            ) : null}
            {message.attachment_path ? (
              <AttachmentBlock message={message} darkText={isMe} onOpenImage={onOpenImage} />
            ) : null}
          </div>

          {/* Action row: votes + per-message actions, floats over the bubble. */}
          {!isEditing ? (
            <MessageActions
              isMe={isMe}
              isAdmin={isAdmin}
              isDone={isDone}
              kind={message.kind}
              votes={votes}
              onVote={onVote}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
              onMarkDone={onMarkDone}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MessageActions({
  isMe,
  isAdmin,
  isDone,
  kind,
  votes,
  onVote,
  onStartEdit,
  onDelete,
  onMarkDone,
}: {
  isMe: boolean;
  isAdmin: boolean;
  isDone: boolean;
  kind: MessageKind;
  votes?: VoteSummary;
  onVote: (next: -1 | 1) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onMarkDone: (done: boolean) => void;
}) {
  const showVotes = isVotableKind(kind);
  const showMark = isMarkableKind(kind) && isAdmin;
  if (!showVotes && !showMark && !isMe) return null;

  const mine = votes?.mine ?? 0;
  return (
    <div className={`chat-actions-row ${isMe ? "is-me" : "is-other"}`}>
      {showVotes ? (
        <>
          <button
            type="button"
            onClick={() => onVote(1)}
            disabled={isDone}
            aria-label={`Upvote (${votes?.up ?? 0})`}
            aria-pressed={mine === 1}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mine === 1
                ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <ArrowUpIcon className="h-3 w-3" />
            {(votes?.up ?? 0) > 0 ? <span>{votes!.up}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => onVote(-1)}
            disabled={isDone}
            aria-label={`Downvote (${votes?.down ?? 0})`}
            aria-pressed={mine === -1}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mine === -1
                ? "border-rose-300/60 bg-rose-400/15 text-rose-200"
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <ArrowDownIcon className="h-3 w-3" />
            {(votes?.down ?? 0) > 0 ? <span>{votes!.down}</span> : null}
          </button>
        </>
      ) : null}
      {showMark ? (
        <button
          type="button"
          onClick={() => onMarkDone(!isDone)}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition ${
            isDone
              ? "border-amber-300/55 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
              : "border-emerald-300/55 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25"
          }`}
          title={isDone ? "Reopen this request" : "Mark as done"}
        >
          {isDone ? <UndoIcon className="h-3 w-3" /> : <CheckIcon className="h-3 w-3" />}
          <span>{isDone ? "Reopen" : "Mark done"}</span>
        </button>
      ) : null}
      {isMe ? (
        <>
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit message"
            className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 transition hover:border-white/20 hover:bg-white/10"
          >
            <PencilSquareIcon className="h-3 w-3" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete message"
            className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 transition hover:border-rose-300/40 hover:bg-rose-500/15 hover:text-rose-200"
          >
            <TrashIcon className="h-3 w-3" />
            <span>Delete</span>
          </button>
        </>
      ) : null}
    </div>
  );
}

function EditField({
  initialBody,
  onSave,
  onCancel,
}: {
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialBody);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div>
      <textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSave(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="min-h-[3rem] w-full resize-none rounded-md border border-slate-900/30 bg-white/60 px-2 py-1.5 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (value.trim()) onSave(value);
          }}
          className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-cyan-100 hover:bg-slate-800"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-900/30 bg-white/40 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-white/60"
        >
          Cancel
        </button>
        <span className="ml-1 text-[10px] text-slate-700/70">Enter saves · Esc cancels</span>
      </div>
    </div>
  );
}

function AttachmentBlock({
  message,
  darkText,
  onOpenImage,
}: {
  message: ChatMessageRow;
  darkText: boolean;
  onOpenImage?: (url: string, name: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const path = message.attachment_path!;
  const isImage = (message.attachment_type ?? "").startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const signed = await getAttachmentSignedUrl(path);
        if (!cancelled) setUrl(signed);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || "Could not load attachment");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const sizeLabel = message.attachment_size ? formatBytes(message.attachment_size) : "";

  if (err) {
    return <p className={`mt-1 text-xs ${darkText ? "text-slate-700" : "text-rose-300"}`}>{err}</p>;
  }

  if (isImage) {
    const name = message.attachment_name ?? "attachment";
    if (!url) {
      // Skeleton — keeps the bubble at a stable size while signing the URL.
      return (
        <div
          aria-hidden
          className="mt-1 h-40 w-48 max-w-full animate-pulse rounded-lg border border-white/10 bg-white/[0.06]"
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => onOpenImage?.(url, name)}
        className="group/img relative mt-1 block overflow-hidden rounded-lg border border-white/10"
      >
        {!imgLoaded ? (
          <div
            aria-hidden
            className="absolute inset-0 animate-pulse bg-white/[0.06]"
          />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          onLoad={() => setImgLoaded(true)}
          className="block max-h-64 max-w-full object-contain transition group-hover/img:opacity-95"
        />
      </button>
    );
  }

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
      className={`mt-1 inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${
        darkText
          ? "border-slate-900/30 bg-white/40 text-slate-900 hover:bg-white/60"
          : "border-white/15 bg-white/8 text-slate-100 hover:bg-white/12"
      }`}
    >
      <PaperclipIcon className="h-3.5 w-3.5" />
      <span className="max-w-[12rem] truncate">{message.attachment_name ?? "attachment"}</span>
      {sizeLabel ? <span className="opacity-70">· {sizeLabel}</span> : null}
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Kind metadata + icons --------------------------------------------

type KindMeta = {
  shortLabel: string;
  shortDescription: string;
  Icon: (props: { className?: string }) => ReactElement;
  // Active toggle button styles
  activeBorder: string;
  activeBg: string;
  activeText: string;
  // Inline message badge styles
  badgeBorder: string;
  badgeBg: string;
  badgeText: string;
};

const KIND_META: Record<Exclude<MessageKind, "message">, KindMeta> = {
  feature_request: {
    shortLabel: "Feature",
    shortDescription: "Request a new feature",
    Icon: LightbulbIcon,
    activeBorder: "border-amber-300/60",
    activeBg: "bg-amber-400/20",
    activeText: "text-amber-100",
    badgeBorder: "border-amber-300/40",
    badgeBg: "bg-amber-400/15",
    badgeText: "text-amber-200",
  },
  change_request: {
    shortLabel: "Change",
    shortDescription: "Request a change to an existing feature",
    Icon: PencilSquareIcon,
    activeBorder: "border-violet-300/60",
    activeBg: "bg-violet-400/20",
    activeText: "text-violet-100",
    badgeBorder: "border-violet-300/40",
    badgeBg: "bg-violet-400/15",
    badgeText: "text-violet-200",
  },
  best_practice: {
    shortLabel: "Best practice",
    shortDescription: "Share a best practice",
    Icon: StarIcon,
    activeBorder: "border-emerald-300/60",
    activeBg: "bg-emerald-400/20",
    activeText: "text-emerald-100",
    badgeBorder: "border-emerald-300/40",
    badgeBg: "bg-emerald-400/15",
    badgeText: "text-emerald-200",
  },
};

function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m18.375 12.739-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 002.112 2.13"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M12 3a9 9 0 019 9" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v3m-3.75-6.75A6 6 0 1118 14.25c0 1.054-.273 2.044-.75 2.906A6.973 6.973 0 0015 21H9a6.973 6.973 0 00-2.25-3.844 5.97 5.97 0 01-.75-2.906z"
      />
    </svg>
  );
}

function PencilSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l7-7m-7 7l-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
