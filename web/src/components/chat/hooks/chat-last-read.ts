// Per-user "last read" mark (ISO timestamp of the newest message seen with the
// panel open). Lets the unread badge survive reloads: messages that arrived
// while this tab was closed still light it up on the next visit.
const CHAT_LAST_READ_AT_KEY = "ma_chat_last_read_at_v1";

export function readLastReadAt(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${CHAT_LAST_READ_AT_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function saveLastReadAt(userId: string, isoTimestamp: string) {
  try {
    window.localStorage.setItem(`${CHAT_LAST_READ_AT_KEY}:${userId}`, isoTimestamp);
  } catch {
    // Storage blocked (e.g. private mode): the badge just resets per session.
  }
}
