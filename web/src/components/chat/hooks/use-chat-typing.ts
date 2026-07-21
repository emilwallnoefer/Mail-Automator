"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shortNameFromEmail, type TypingPayload } from "@/lib/chat";
import { TYPING_BROADCAST_MIN_INTERVAL_MS, TYPING_TIMEOUT_MS } from "../types";

/**
 * Presence-typing concern: the live "who is typing" map, the 1s expiry sweep,
 * the throttled outgoing typing broadcast tied to the draft, and the derived
 * list of other people currently typing. `broadcastTypingRef` is assigned by
 * the connection hook once the realtime channel is ready.
 */
export function useChatTyping(currentUserId: string | null) {
  const [typingUsers, setTypingUsers] = useState<Record<string, { email: string; expiresAt: number }>>(
    {},
  );
  const lastTypingSentAtRef = useRef(0);
  const broadcastTypingRef = useRef<((isTyping: boolean) => Promise<void>) | null>(null);

  // Prune expired typing entries once a second.
  useEffect(() => {
    const sweep = window.setInterval(() => {
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
    return () => window.clearInterval(sweep);
  }, []);

  const applyTypingEvent = useCallback((payload: TypingPayload) => {
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
  }, []);

  // The throttled typing broadcast that fires as the draft changes.
  const broadcastDraftTyping = useCallback((value: string) => {
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

  // Clear the local throttle and tell others we've stopped typing (on send).
  const resetTyping = useCallback(() => {
    lastTypingSentAtRef.current = 0;
    const broadcast = broadcastTypingRef.current;
    if (broadcast) void broadcast(false);
  }, []);

  // No expiry check here: reading Date.now() during render is impure, and the
  // 1s sweep above already drops entries once they expire — worst case a name
  // lingers for under a second longer than its timeout.
  const otherTypingNames = useMemo(
    () =>
      Object.entries(typingUsers)
        .filter(([id]) => id !== currentUserId)
        .map(([, v]) => shortNameFromEmail(v.email)),
    [typingUsers, currentUserId],
  );

  return {
    typingUsers,
    broadcastTypingRef,
    applyTypingEvent,
    broadcastDraftTyping,
    resetTyping,
    otherTypingNames,
  };
}
