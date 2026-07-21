import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import type { TravelSheetColumnMapping } from "@/lib/google-sheets";
import { TIME_TRACKER_TARGET_MINS } from "@/lib/time-tracker-rules";

export const TARGET_MINS = TIME_TRACKER_TARGET_MINS;

/** Supabase server client, as returned by `createClient()`. */
export type TimeTrackerSupabase = Awaited<ReturnType<typeof createClient>>;

export function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeColumnLetter(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return undefined;
  if (!/^[A-Z]+$/.test(text)) return undefined;
  return text;
}

/**
 * The travel sheet has one column trio per person, so the only per-user
 * config is the three travel columns. Tab, range, and date columns come
 * exclusively from the server env — legacy `range`/`gid`/date-column values
 * lingering in user metadata are deliberately ignored so accounts can't
 * silently diverge. All three columns must be set for the mapping to count.
 */
export function parseUserTravelMapping(rawMetadata: unknown): TravelSheetColumnMapping | undefined {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) return undefined;
  const metadata = rawMetadata as Record<string, unknown>;
  const rawMapping = metadata.travel_sheet_mapping;
  if (!rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) return undefined;
  const mappingInput = rawMapping as Record<string, unknown>;

  const clientColumn = normalizeColumnLetter(mappingInput.clientColumn);
  const locationColumn = normalizeColumnLetter(mappingInput.locationColumn);
  const responsibleColumn = normalizeColumnLetter(mappingInput.responsibleColumn);
  if (!clientColumn || !locationColumn || !responsibleColumn) return undefined;

  return { clientColumn, locationColumn, responsibleColumn };
}

/**
 * Builds the per-request "take a safety snapshot before any mutation" guard.
 * Returns `null` when the snapshot succeeded, or a ready-to-return error
 * response (with the same messaging as before) when it failed.
 */
export function createSnapshotGuard(supabase: TimeTrackerSupabase, userId: string) {
  return async function requireSnapshot(reason: string) {
    const snapshotRes = await supabase.rpc("create_time_tracker_snapshot", {
      p_user: userId,
      p_reason: reason,
    });
    if (snapshotRes.error) {
      const detail = snapshotRes.error.message ?? "";
      const looksLikeMissingDurabilityObjects =
        /create_time_tracker_snapshot|function .* does not exist|time_tracker_snapshots|relation .* does not exist/i.test(
          detail,
        );
      return NextResponse.json(
        {
          error: looksLikeMissingDurabilityObjects
            ? "Could not create safety snapshot before update. Run web/supabase/time-tracker-durability.sql in Supabase SQL Editor, then retry."
            : "Could not create safety snapshot before update. No data was changed. Please retry.",
          detail,
        },
        { status: 500 },
      );
    }
    return null;
  };
}

export type RequireSnapshot = ReturnType<typeof createSnapshotGuard>;

/** Shared context handed to every POST action handler. */
export type PostActionContext = {
  supabase: TimeTrackerSupabase;
  userId: string;
  requireSnapshot: RequireSnapshot;
};
