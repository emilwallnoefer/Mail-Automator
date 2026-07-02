"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { TAGGED_KINDS, initialsFromEmail, shortNameFromEmail, type ChatPresenceUser } from "@/lib/chat";
import { ChatBubbleIcon, LightbulbIcon, PencilSquareIcon, StarIcon } from "./icons";
import { KIND_META, type FilterKey, type KindMeta } from "./types";
import type { MessageKind } from "@/lib/chat";

export function KindToggleRow({
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
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-glass/[0.04] p-1 ring-1 ring-inset ring-glass/5">
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
                  : "bg-glass/12 text-ink shadow-[0_1px_0_rgba(255,255,255,0.06)]"
                : "text-ink-4 hover:bg-glass/[0.06] hover:text-ink-2"
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

export function FilterStrip({
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
    <div className="border-b border-glass/10 bg-overlay/60 px-3 py-2">
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-glass/[0.03] p-1 ring-1 ring-inset ring-glass/5">
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
                  ? "bg-accent/15 text-accent-soft shadow-[0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-accent/40"
                  : "text-ink-4 hover:bg-glass/[0.06] hover:text-ink-2"
              }`}
            >
              {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
              {item.count > 0 ? (
                <span
                  className={`ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold ${
                    active
                      ? "bg-accent/30 text-accent-soft"
                      : "bg-glass/10 text-ink-3 group-hover:bg-glass/15"
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
export function PresenceAvatars({
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
        className="flex items-center -space-x-2 rounded-full p-0.5 transition hover:bg-glass/5"
      >
        {visible.map((u) => {
          const isMe = u.user_id === currentUserId;
          return (
            <span
              key={u.user_id}
              title={`${shortNameFromEmail(u.email)}${isMe ? " (you)" : ""}`}
              className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-surface ${
                isMe
                  ? "bg-gradient-to-br from-accent-from to-accent-to text-slate-950"
                  : "bg-gradient-to-br from-neutral to-raised text-ink"
              }`}
            >
              {initialsFromEmail(u.email)}
            </span>
          );
        })}
        {overflow > 0 ? (
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-raised text-[10px] font-semibold text-ink-2 ring-2 ring-surface"
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
            className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-glass/10 bg-panel/95 shadow-[0_18px_36px_-12px_rgba(0,0,0,0.8)] backdrop-blur"
            role="dialog"
            aria-label="Online members"
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {sorted.map((u) => {
                const isMe = u.user_id === currentUserId;
                return (
                  <div
                    key={u.user_id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-ink-2"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${
                        isMe
                          ? "bg-gradient-to-br from-accent-from to-accent-to text-slate-950"
                          : "bg-gradient-to-br from-neutral to-raised text-ink"
                      }`}
                    >
                      {initialsFromEmail(u.email)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {shortNameFromEmail(u.email)}
                      {isMe ? <span className="ml-1 text-ink-4">(you)</span> : null}
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

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="relative my-3 flex items-center justify-center" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-glass/8" />
      <span className="relative rounded-full border border-glass/10 bg-surface px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-4">
        {label}
      </span>
    </div>
  );
}

export function TypingStrip({ names }: { names: string[] }) {
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
    <div className="flex items-center gap-2 px-4 pb-1 text-[11px] italic text-ink-4">
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
