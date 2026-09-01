import "server-only";

import {
  addWeeks,
  computeReliability,
  dueDateOf,
  daysOverdue,
  mondayOf,
  type ReservationSpan,
} from "@/lib/fleet-rules";
import type { FleetBoard } from "@/lib/fleet-queries";

/**
 * Dev-only demo board.
 *
 * The fleet tables live in Supabase and this repo applies migrations by hand, so
 * a fresh checkout has no `fleet_assets` table and the panel would render an
 * error instead of a UI. When the tables are genuinely missing AND we are not in
 * production, `/api/fleet` serves this instead, so the calendar, the score and
 * the reminders can be reviewed and adjusted before anyone touches the database.
 *
 * Two hard guarantees, both enforced at the call site in `/api/fleet`:
 *   - it is never served in production;
 *   - it is never served when the tables exist (a real empty fleet stays empty).
 * The response carries `demo: true` and the panel shows a banner, so nobody can
 * mistake this for real data.
 */

const ASSETS: Array<{
  name: string;
  serial: string;
  category: FleetBoard["assets"][number]["category"];
  model: string;
  location: string;
  status: FleetBoard["assets"][number]["status"];
  confirmedDaysAgo: number | null;
}> = [
  { name: "E3-SVA-330", serial: "E300SA23200330", category: "drone", model: "Elios 3", location: "Office Paudex", status: "out", confirmedDaysAgo: 2 },
  { name: "E3-SVA-257", serial: "E300SA23130257", category: "drone", model: "Elios 3", location: "Office Paudex", status: "available", confirmedDaysAgo: 5 },
  { name: "E3-SVA-318", serial: "E300SA23190318", category: "drone", model: "Elios 3", location: "US Office", status: "out", confirmedDaysAgo: 61 },
  { name: "E3-DV1-2", serial: "E300D122160002", category: "drone", model: "Elios 3", location: "EMEA", status: "available", confirmedDaysAgo: 12 },
  { name: "E3-DV1-4", serial: "E300D122160004", category: "drone", model: "Elios 3", location: "US Office", status: "available", confirmedDaysAgo: null },
  { name: "E3-SV9-67", serial: "E300S922410067", category: "drone", model: "Elios 3", location: "FMI", status: "in_repair", confirmedDaysAgo: 9 },
  { name: "REx 0334", serial: "RV0-0334", category: "range_extender", model: "RangeX", location: "Bordeaux", status: "out", confirmedDaysAgo: 3 },
  { name: "REx 0447", serial: "REX-0447", category: "range_extender", model: "RangeX", location: "Office Paudex", status: "available", confirmedDaysAgo: 1 },
  { name: "GCS 0546", serial: "CVO-0546", category: "gcs", model: "GCS", location: "Bordeaux", status: "out", confirmedDaysAgo: 3 },
  { name: "Field tablet", serial: "", category: "accessory", model: "", location: "Office Paudex", status: "available", confirmedDaysAgo: 20 },
  { name: "E1 battery set (3x)", serial: "", category: "accessory", model: "", location: "Office Paudex", status: "available", confirmedDaysAgo: 90 },
];

const PEOPLE = [
  { id: "demo-user-charles", name: "Charles Rey" },
  { id: "demo-user-elisson", name: "Elisson Ciorcero" },
  { id: "demo-user-matteo", name: "Matteo Bianchi" },
];

/** Deterministic ids, so a reload does not reshuffle the demo board. */
function assetId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function buildDemoBoard(args: {
  viewerId: string;
  viewerName: string;
  today: string;
  windowStart: string;
  windowWeeks: number;
}): FleetBoard & { demo: true } {
  const { viewerId, viewerName, today, windowStart, windowWeeks } = args;
  const thisWeek = mondayOf(new Date(`${today}T00:00:00Z`));

  const assets = ASSETS.map((asset, index) => ({
    id: assetId(index),
    serial_number: asset.serial || null,
    name: asset.name,
    category: asset.category,
    model: asset.model || null,
    owner_group: "Sales",
    status: asset.status,
    home_location: asset.location,
    current_location: asset.location,
    current_holder_user_id: null,
    current_holder_label: asset.status === "out" ? "On mission" : null,
    location_confirmed_at:
      asset.confirmedDaysAgo == null
        ? null
        : new Date(Date.parse(`${today}T00:00:00Z`) - asset.confirmedDaysAgo * 86_400_000).toISOString(),
    notes: null,
    active: true,
    holder_name: asset.status === "out" ? "On mission" : null,
    location_age_days: asset.confirmedDaysAgo,
    location_stale: asset.confirmedDaysAgo == null || asset.confirmedDaysAgo > 42,
  }));

  // A spread that exercises every cell state the grid can draw: yours, someone
  // else's, a multi-week run, an overdue item, and a waitlisted week.
  const raw: Array<{
    id: string;
    asset: number;
    user: string;
    name: string;
    start: string;
    end: string;
    status: ReservationSpan["status"];
    destination: string | null;
    returnedOn?: string;
  }> = [
    { id: "demo-res-1", asset: 0, user: PEOPLE[0].id, name: PEOPLE[0].name, start: addWeeks(thisWeek, -2), end: addWeeks(thisWeek, -2), status: "picked_up", destination: "Refinery Antwerp" },
    { id: "demo-res-2", asset: 1, user: viewerId, name: viewerName, start: thisWeek, end: addWeeks(thisWeek, 1), status: "picked_up", destination: "Basel site visit" },
    { id: "demo-res-3", asset: 3, user: PEOPLE[1].id, name: PEOPLE[1].name, start: addWeeks(thisWeek, 1), end: addWeeks(thisWeek, 3), status: "reserved", destination: "Rotterdam" },
    { id: "demo-res-4", asset: 6, user: viewerId, name: viewerName, start: addWeeks(thisWeek, 2), end: addWeeks(thisWeek, 2), status: "reserved", destination: "Training room" },
    { id: "demo-res-5", asset: 1, user: PEOPLE[2].id, name: PEOPLE[2].name, start: addWeeks(thisWeek, 4), end: addWeeks(thisWeek, 4), status: "reserved", destination: "Zurich demo" },
    { id: "demo-res-6", asset: 1, user: PEOPLE[0].id, name: PEOPLE[0].name, start: addWeeks(thisWeek, 4), end: addWeeks(thisWeek, 4), status: "waitlisted", destination: "Geneva demo" },
    { id: "demo-res-7", asset: 3, user: viewerId, name: viewerName, start: addWeeks(thisWeek, -6), end: addWeeks(thisWeek, -6), status: "returned", destination: "Lyon", returnedOn: addWeeks(thisWeek, -6) },
    { id: "demo-res-8", asset: 4, user: PEOPLE[2].id, name: PEOPLE[2].name, start: addWeeks(thisWeek, -4), end: addWeeks(thisWeek, -4), status: "returned", destination: "Milan", returnedOn: addWeeks(thisWeek, -3) },
  ];

  const spansByUser = new Map<string, ReservationSpan[]>();
  const reservations = raw.map((row) => {
    const span: ReservationSpan = {
      id: row.id,
      asset_id: assetId(row.asset),
      user_id: row.user,
      start_week: row.start,
      end_week: row.end,
      status: row.status,
      returned_on: row.returnedOn ? addWeeks(row.returnedOn, 0) : null,
    };
    // A returned booking's actual return date is the Sunday it came back.
    if (row.returnedOn) {
      const due = dueDateOf({ end_week: row.end });
      span.returned_on = row.id === "demo-res-8" ? addWeeks(due, 1) : due;
    }
    const list = spansByUser.get(row.user) ?? [];
    list.push(span);
    spansByUser.set(row.user, list);

    return {
      id: row.id,
      asset_id: span.asset_id,
      user_id: row.user,
      start_week: row.start,
      end_week: row.end,
      status: row.status,
      purpose: null,
      destination: row.destination,
      picked_up_at: row.status === "picked_up" ? new Date().toISOString() : null,
      returned_at: span.returned_on ? `${span.returned_on}T16:00:00Z` : null,
      returned_on: span.returned_on ?? null,
      created_at: new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86_400_000).toISOString(),
      holder_name: row.name,
      is_mine: row.user === viewerId,
      due_date: dueDateOf(span),
      days_overdue: daysOverdue(span, today),
      queue_position: row.status === "waitlisted" ? 1 : null,
    };
  });

  const standings = [...spansByUser.entries()]
    .map(([userId, spans]) => ({
      user_id: userId,
      name: userId === viewerId ? viewerName : (PEOPLE.find((p) => p.id === userId)?.name ?? "Unknown"),
      score: computeReliability(spans, today),
    }))
    .sort((a, b) => b.score.score - a.score.score || a.name.localeCompare(b.name));

  return {
    demo: true,
    today,
    window_start: windowStart,
    window_weeks: windowWeeks,
    assets,
    reservations,
    me: { ...computeReliability(spansByUser.get(viewerId) ?? [], today), user_id: viewerId },
    standings,
  };
}
