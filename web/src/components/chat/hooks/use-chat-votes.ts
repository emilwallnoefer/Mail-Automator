"use client";

import { useCallback, useMemo, useState } from "react";
import { setMessageVote, summarizeVotes, type ChatVoteRow } from "@/lib/chat";

/**
 * Votes concern: the loaded vote rows, the derived per-message summary, and the
 * optimistic `handleVote` action. Realtime vote echoes and initial/older-page
 * vote fetches are applied through the exposed `setVotes` by the connection and
 * pagination code so the whole vote reducer stays in one place.
 */
export function useChatVotes(currentUserId: string | null, onError: (message: string) => void) {
  const [votes, setVotes] = useState<ChatVoteRow[]>([]);

  const voteSummary = useMemo(() => summarizeVotes(votes, currentUserId), [votes, currentUserId]);

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
          onError((err as Error).message || "Vote failed.");
        }
      })();
    },
    [currentUserId, votes, onError],
  );

  return { votes, setVotes, voteSummary, handleVote };
}
