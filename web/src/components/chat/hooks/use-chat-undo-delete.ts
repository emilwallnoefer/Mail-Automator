"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { deleteChatMessage, type ChatMessageRow } from "@/lib/chat";
import { UNDO_DELETE_TIMEOUT_MS } from "../types";

/**
 * Optimistic delete + Undo concern: the message is removed from the UI right
 * away and an Undo toast appears; the server delete only fires once the undo
 * window expires. Tapping Undo restores the row and cancels the pending commit.
 */
export function useChatUndoDelete(
  setMessages: Dispatch<SetStateAction<ChatMessageRow[]>>,
  onError: (message: string) => void,
) {
  // Pending delete with undo toast: keep the original row + a timer to commit
  // the actual server delete if the user doesn't undo in time.
  const [pendingUndo, setPendingUndo] = useState<{
    id: string;
    row: ChatMessageRow;
    expiresAt: number;
  } | null>(null);
  // Pending delete commit timers, keyed by message id.
  const undoTimersRef = useRef<Map<string, number>>(new Map());

  const handleDelete = useCallback(
    (messageId: string) => {
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
            onError((err as Error).message || "Delete failed.");
          }
        })();
      }, UNDO_DELETE_TIMEOUT_MS);
      undoTimersRef.current.set(messageId, timerId);
    },
    [setMessages, onError],
  );

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
  }, [setMessages]);

  return { pendingUndo, handleDelete, handleUndoDelete };
}
