"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import {
  CHAT_MAX_ATTACHMENT_BYTES,
  TAGGED_KINDS,
  deleteChatMessage,
  editChatMessage,
  fetchAllVotes,
  fetchChatHistory,
  formatChatTimestamp,
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const broadcastTypingRef = useRef<((isTyping: boolean) => Promise<void>) | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

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
        setLoading(false);

        const sub = await subscribeToChat({
          onInsert: (row) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row];
            });
            if (row.sender_id !== sub.currentUserId && !openRef.current) {
              setUnread((n) => n + 1);
              playUiSound("switchWhoosh");
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

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [open, messages.length, filter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) setEditingId(null);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editingId]);

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

  const handleSend = useCallback(async () => {
    if (sendState === "sending") return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSendState("sending");
    setError(null);
    try {
      await sendChatMessage({ body: trimmed, kind: pendingKind });
      setDraft("");
      setPendingKind("message");
      lastTypingSentAtRef.current = 0;
      const broadcast = broadcastTypingRef.current;
      if (broadcast) void broadcast(false);
      playUiSound("mailSend");
    } catch (err) {
      setError((err as Error).message || "Failed to send.");
    } finally {
      setSendState("idle");
    }
  }, [draft, pendingKind, sendState]);

  const handleAttachmentPick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > CHAT_MAX_ATTACHMENT_BYTES) {
        setError(`File too large. Max ${Math.round(CHAT_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
        return;
      }
      setSendState("sending");
      setError(null);
      try {
        const uploaded = await uploadChatAttachment(file);
        await sendChatMessage({
          body: draft.trim() || undefined,
          kind: pendingKind,
          attachment: uploaded,
        });
        setDraft("");
        setPendingKind("message");
        playUiSound("mailSend");
      } catch (err) {
        setError((err as Error).message || "Upload failed.");
      } finally {
        setSendState("idle");
      }
    },
    [draft, pendingKind],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleVote = useCallback(
    async (messageId: string, current: -1 | 0 | 1, next: -1 | 1) => {
      const newVote = current === next ? 0 : next;
      // Optimistic UI: patch local votes immediately.
      setVotes((prev) => {
        const without = prev.filter((v) => !(v.message_id === messageId && v.user_id === currentUserId));
        if (newVote === 0 || !currentUserId) return without;
        return [...without, { message_id: messageId, user_id: currentUserId, vote: newVote }];
      });
      try {
        await setMessageVote(messageId, newVote);
      } catch (err) {
        setError((err as Error).message || "Vote failed.");
        // Realtime will re-sync on the next event; nothing to revert manually.
      }
    },
    [currentUserId],
  );

  const handleMarkDone = useCallback(async (messageId: string, done: boolean) => {
    try {
      const updated = await markMessageDone(messageId, done);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      setError((err as Error).message || "Could not update.");
    }
  }, []);

  const handleSaveEdit = useCallback(async (messageId: string, body: string) => {
    try {
      const updated = await editChatMessage(messageId, body);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message || "Could not edit.");
    }
  }, []);

  const handleDelete = useCallback(async (messageId: string) => {
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    try {
      await deleteChatMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setError((err as Error).message || "Delete failed.");
    }
  }, []);

  const onlineCount = presence.length;
  const otherTypingNames = useMemo(() => {
    const now = Date.now();
    return Object.entries(typingUsers)
      .filter(([id, v]) => id !== currentUserId && v.expiresAt > now)
      .map(([, v]) => shortNameFromEmail(v.email));
  }, [typingUsers, currentUserId]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close team chat" : "Open team chat"}
        onClick={() => {
          playUiSound("switchWhoosh");
          setOpen((prev) => !prev);
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
      </button>

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
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              className="fixed right-0 top-0 z-[131] flex h-full w-full max-w-[420px] flex-col border-l border-white/15 bg-slate-950/95 shadow-[0_0_60px_-20px_rgba(34,211,238,0.35)] backdrop-blur-xl"
            >
              <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/75">Team chat</p>
                  <h2 className="text-base font-semibold text-white">Everyone</h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {onlineCount === 0 ? "Connecting…" : `${onlineCount} online`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-md border border-white/15 bg-white/8 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/15"
                >
                  ✕
                </button>
              </header>

              <PresenceStrip users={presence} currentUserId={currentUserId} />

              <FilterStrip filter={filter} setFilter={setFilter} counts={filterCounts} />

              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {loading ? (
                  <p className="text-center text-xs text-slate-400">Loading conversation…</p>
                ) : visibleMessages.length === 0 ? (
                  <p className="mt-8 text-center text-xs text-slate-400">
                    {filter === "all"
                      ? "No messages yet — say hi to your team."
                      : "Nothing here. Try a different filter or post a new one below."}
                  </p>
                ) : (
                  visibleMessages.map((m, i) => {
                    const previous = visibleMessages[i - 1];
                    const showHeader =
                      !previous ||
                      previous.sender_id !== m.sender_id ||
                      previous.kind !== m.kind ||
                      new Date(m.created_at).getTime() -
                        new Date(previous.created_at).getTime() >
                        5 * 60 * 1000;
                    return (
                      <MessageRow
                        key={m.id}
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
                        onVote={(next) => handleVote(m.id, voteSummary.get(m.id)?.mine ?? 0, next)}
                        onMarkDone={(done) => handleMarkDone(m.id, done)}
                      />
                    );
                  })
                )}
              </div>

              <TypingStrip names={otherTypingNames} />

              {error ? (
                <p className="border-t border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="border-t border-white/10 bg-slate-950/70 px-3 py-3">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    aria-label="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendState === "sending"}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
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
                    placeholder={
                      pendingKind === "message"
                        ? "Message your team…"
                        : `Posting as ${messageKindLabel(pendingKind).toLowerCase()}…`
                    }
                    className="min-h-10 max-h-32 flex-1 resize-none rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSend();
                    }}
                    disabled={sendState === "sending" || draft.trim().length === 0}
                    className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-400/90 text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Send"
                  >
                    {sendState === "sending" ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <SendIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <KindToggleRow pendingKind={pendingKind} setPendingKind={setPendingKind} />
              </div>
            </motion.aside>
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
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {TAGGED_KINDS.map((kind) => {
        const active = pendingKind === kind;
        const meta = KIND_META[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            onClick={() => setPendingKind(active ? "message" : kind)}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
              active
                ? `${meta.activeBorder} ${meta.activeBg} ${meta.activeText} shadow-[0_0_0_1px_rgba(255,255,255,0.05)]`
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
            title={meta.shortDescription}
          >
            <meta.Icon className="h-3.5 w-3.5" />
            <span>{meta.shortLabel}</span>
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
    { id: "best_practice", label: "Best practices", count: counts.best_practice, icon: StarIcon },
  ];
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-white/[0.02] px-3 py-2">
      {items.map((item) => {
        const active = filter === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              active
                ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            {Icon ? <Icon className="h-3 w-3" /> : null}
            <span>{item.label}</span>
            <span className={`text-[10px] ${active ? "text-cyan-200/80" : "text-slate-400"}`}>
              {item.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PresenceStrip({
  users,
  currentUserId,
}: {
  users: ChatPresenceUser[];
  currentUserId: string | null;
}) {
  if (users.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-white/10 bg-white/[0.03] px-4 py-2">
      {users.map((u) => {
        const isMe = u.user_id === currentUserId;
        return (
          <span
            key={u.user_id}
            title={u.email}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${
              isMe
                ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                : "border-white/15 bg-white/5 text-slate-200"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {shortNameFromEmail(u.email)}
            {isMe ? " (you)" : ""}
          </span>
        );
      })}
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
}: MessageRowProps) {
  const initials = initialsFromEmail(message.sender_email);
  const name = shortNameFromEmail(message.sender_email);
  const tagged = message.kind !== "message";
  const meta = tagged ? KIND_META[message.kind as Exclude<MessageKind, "message">] : null;
  const isDone = Boolean(message.done_at);

  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
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
      <div className={`flex max-w-[78%] flex-col ${isMe ? "items-end" : "items-start"}`}>
        {showHeader ? (
          <p className="mb-0.5 text-[10px] text-slate-400">
            {isMe ? "You" : name} · {formatChatTimestamp(message.created_at)}
            {message.edited_at ? <span className="ml-1 italic text-slate-500">(edited)</span> : null}
          </p>
        ) : null}

        {tagged && meta ? (
          <span
            className={`mb-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.badgeBorder} ${meta.badgeBg} ${meta.badgeText} ${
              isDone ? "opacity-70" : ""
            }`}
          >
            <meta.Icon className="h-3 w-3" />
            {meta.shortLabel}
            {isDone ? " · Done" : ""}
          </span>
        ) : null}

        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isMe
              ? "rounded-br-sm bg-cyan-400/90 text-slate-900"
              : "rounded-bl-sm bg-white/8 text-slate-100"
          } ${isDone ? "opacity-75" : ""}`}
        >
          {isEditing ? (
            <EditField initialBody={message.body ?? ""} onSave={onSaveEdit} onCancel={onCancelEdit} />
          ) : message.body ? (
            <p className={`whitespace-pre-wrap ${isDone ? "line-through decoration-slate-400/70" : ""}`}>
              {message.body}
            </p>
          ) : null}
          {message.attachment_path ? (
            <AttachmentBlock message={message} darkText={isMe} />
          ) : null}
        </div>

        {/* Action row: votes (left) + per-message actions (right) */}
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
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {showVotes ? (
        <>
          <button
            type="button"
            onClick={() => onVote(1)}
            disabled={isDone}
            aria-label="Upvote"
            aria-pressed={mine === 1}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mine === 1
                ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <ArrowUpIcon className="h-3 w-3" />
            <span>{votes?.up ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => onVote(-1)}
            disabled={isDone}
            aria-label="Downvote"
            aria-pressed={mine === -1}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mine === -1
                ? "border-rose-300/60 bg-rose-400/15 text-rose-200"
                : "border-white/12 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <ArrowDownIcon className="h-3 w-3" />
            <span>{votes?.down ?? 0}</span>
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

function AttachmentBlock({ message, darkText }: { message: ChatMessageRow; darkText: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={message.attachment_name ?? "attachment"}
          className="max-h-64 max-w-full rounded-lg border border-white/10 object-contain"
        />
      </a>
    ) : (
      <p className={`mt-1 text-xs ${darkText ? "text-slate-700" : "text-slate-400"}`}>Loading image…</p>
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
