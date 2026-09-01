import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { checkRateLimit, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";
import {
  DEFAULT_WINDOW_DAYS,
  fetchAssetSpans,
  fetchFleetBoard,
  fetchReliability,
  recordAssetEvent,
  todayInZurich,
} from "@/lib/fleet-queries";
import { checkReservation, isBlocking, parseDateKey, toDateKey } from "@/lib/fleet-rules";
import { buildDemoBoard } from "@/lib/fleet-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fleet API.
 *
 * Reads are open to any signed-in user (the fleet is shared property). Writes
 * run on the service-role client, because the rules that make the module work
 * cannot be expressed as RLS:
 *
 *  - you may only book within the horizon your reliability score earns;
 *  - you may only cancel or check in *your own* booking (admins: anyone's);
 *  - a contested week puts you on a waitlist ordered by score, not by luck.
 *
 * `fleet_assets` / `fleet_reservations` grant no INSERT/UPDATE to `authenticated`,
 * so this route is the only writer.
 */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const reserveSchema = z.object({
  action: z.literal("reserve"),
  asset_id: z.string().uuid(),
  start_date: dateKey,
  end_date: dateKey,
  purpose: z.string().trim().max(280).optional(),
  destination: z.string().trim().max(160).optional(),
  /** Join the waitlist instead of failing when the week is taken. */
  waitlist: z.boolean().optional(),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  reservation_id: z.string().uuid(),
});

const checkOutSchema = z.object({
  action: z.literal("check_out"),
  reservation_id: z.string().uuid(),
  location: z.string().trim().max(160).optional(),
});

const checkInSchema = z.object({
  action: z.literal("check_in"),
  reservation_id: z.string().uuid(),
  location: z.string().trim().max(160).optional(),
  note: z.string().trim().max(280).optional(),
});

const moveSchema = z.object({
  action: z.literal("move"),
  asset_id: z.string().uuid(),
  location: z.string().trim().min(1).max(160),
  note: z.string().trim().max(280).optional(),
});

const confirmSchema = z.object({
  action: z.literal("confirm_location"),
  asset_id: z.string().uuid(),
});

const setStatusSchema = z.object({
  action: z.literal("set_status"),
  asset_id: z.string().uuid(),
  status: z.enum(["available", "reserved", "out", "in_repair", "retired"]),
  note: z.string().trim().max(280).optional(),
});

const postSchema = z.discriminatedUnion("action", [
  reserveSchema,
  cancelSchema,
  checkOutSchema,
  checkInSchema,
  moveSchema,
  confirmSchema,
  setStatusSchema,
]);

type Viewer = { id: string; email: string | null; isAdmin: boolean };

async function resolveViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null, isAdmin: isAdminEmail(user.email ?? null) };
}

export async function GET(request: Request) {
  const viewer = await resolveViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const rawStart = url.searchParams.get("start");
  const rawDays = Number(url.searchParams.get("days") ?? DEFAULT_WINDOW_DAYS);

  let windowStart: string | undefined;
  if (rawStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
    }
    // Round-trip through the parser so an impossible date (2026-02-31) is
    // normalised rather than reaching the query as-is.
    windowStart = toDateKey(parseDateKey(rawStart));
  }
  // Capped at a quarter: the grid renders one column per day.
  const windowDays = Number.isFinite(rawDays) ? Math.min(92, Math.max(7, Math.trunc(rawDays))) : DEFAULT_WINDOW_DAYS;

  try {
    const board = await fetchFleetBoard(createAdminClient(), {
      viewerId: viewer.id,
      windowStart,
      windowDays,
    });
    return NextResponse.json({ ...board, is_admin: viewer.isAdmin });
  } catch (error) {
    // The fleet tables are created by a hand-applied migration
    // (supabase/2026-09-01-fleet-management.sql). Until it has been run, serve a
    // labelled demo board OUTSIDE production so the UI can be reviewed and
    // adjusted. Never in production, and never when the tables exist — a real
    // fleet that happens to be empty must render as empty.
    if (process.env.NODE_ENV !== "production" && isMissingFleetTable(error)) {
      const today = todayInZurich();
      return NextResponse.json({
        ...buildDemoBoard({
          viewerId: viewer.id,
          viewerName: viewer.email?.split("@")[0] ?? "You",
          today,
          windowStart: windowStart ?? today,
          windowDays,
        }),
        is_admin: viewer.isAdmin,
      });
    }
    console.error("GET /api/fleet failed", error);
    return NextResponse.json({ error: "Could not load the fleet." }, { status: 500 });
  }
}

/**
 * True when the failure is "relation does not exist" rather than a real error.
 * Postgres reports 42P01; PostgREST surfaces an unknown table as PGRST205 with a
 * "Could not find the table" message, and the wrapper in fleet-queries re-throws
 * it as an Error, so match on the text too.
 */
function isMissingFleetTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /42P01/.test(message) ||
    /PGRST205/.test(message) ||
    /Could not find the table/i.test(message) ||
    /relation .*fleet_.* does not exist/i.test(message)
  );
}

export async function POST(request: Request) {
  const viewer = await resolveViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIp = getClientIp(request);
  const limit = await checkRateLimit(`fleet-write:${viewer.id}:${clientIp}`, {
    windowMs: 60 * 60 * 1000,
    max: 240,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry later." },
      { status: 429, headers: createRateLimitHeaders(limit) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const payload = parsed.data;
  const admin = createAdminClient();
  const today = todayInZurich();

  try {
    switch (payload.action) {
      case "reserve":
        return await handleReserve(admin, viewer, payload, today);
      case "cancel":
        return await handleCancel(admin, viewer, payload);
      case "check_out":
        return await handleCheckOut(admin, viewer, payload);
      case "check_in":
        return await handleCheckIn(admin, viewer, payload, today);
      case "move":
        return await handleMove(admin, viewer, payload);
      case "confirm_location":
        return await handleConfirmLocation(admin, viewer, payload);
      case "set_status":
        return await handleSetStatus(admin, viewer, payload);
    }
  } catch (error) {
    console.error(`POST /api/fleet (${payload.action}) failed`, error);
    return NextResponse.json({ error: "Could not complete that action." }, { status: 500 });
  }
}

type Admin = ReturnType<typeof createAdminClient>;

async function handleReserve(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof reserveSchema>,
  today: string,
) {
  const startDate = toDateKey(parseDateKey(payload.start_date));
  const endDate = toDateKey(parseDateKey(payload.end_date));

  const { data: asset, error: assetError } = await admin
    .from("fleet_assets")
    .select("id, name, status, active, current_location")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (assetError) throw new Error(assetError.message);
  if (!asset || !asset.active) {
    return NextResponse.json({ error: "That asset no longer exists." }, { status: 404 });
  }
  if (asset.status === "retired" || asset.status === "in_repair") {
    return NextResponse.json(
      { error: `${asset.name} is ${asset.status === "retired" ? "retired" : "in repair"} and cannot be booked.` },
      { status: 409 },
    );
  }

  const reliability = await fetchReliability(admin, viewer.id, today);
  const existing = await fetchAssetSpans(admin, payload.asset_id);
  const check = checkReservation({
    startDate,
    endDate,
    today,
    // Admins are not subject to the horizon: they schedule missions months out.
    horizonDays: viewer.isAdmin ? 365 : reliability.horizonDays,
    existing,
  });

  if (!check.ok) {
    if (check.reason === "overlap" && payload.waitlist) {
      const { data: waitRow, error: waitError } = await admin
        .from("fleet_reservations")
        .insert({
          asset_id: payload.asset_id,
          user_id: viewer.id,
          start_date: startDate,
          end_date: endDate,
          status: "waitlisted",
          purpose: payload.purpose ?? null,
          destination: payload.destination ?? null,
        })
        .select("id")
        .single();
      if (waitError) throw new Error(waitError.message);
      return NextResponse.json({
        ok: true,
        waitlisted: true,
        reservation_id: waitRow.id,
        message: `Added to the waitlist for ${asset.name}. Position is set by reliability score.`,
      });
    }
    return NextResponse.json({ error: reserveErrorMessage(check, reliability, asset.name) }, { status: 409 });
  }

  const { data: row, error } = await admin
    .from("fleet_reservations")
    .insert({
      asset_id: payload.asset_id,
      user_id: viewer.id,
      start_date: startDate,
      end_date: endDate,
      status: "reserved",
      purpose: payload.purpose ?? null,
      destination: payload.destination ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // The exclusion constraint is the authority: a concurrent request may have
    // taken the same week between our check above and this insert.
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: `Someone booked ${asset.name} for those days a moment ago. Reload and try the waitlist.` },
        { status: 409 },
      );
    }
    throw new Error(error.message);
  }

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    reservation_id: row.id,
    kind: "reserved",
    actor_user_id: viewer.id,
    note: payload.destination ? `Destination: ${payload.destination}` : null,
  });

  return NextResponse.json({ ok: true, reservation_id: row.id });
}

function reserveErrorMessage(
  check: Exclude<ReturnType<typeof checkReservation>, { ok: true }>,
  reliability: { score: number; horizonDays: number },
  assetName: string,
): string {
  switch (check.reason) {
    case "inverted":
      return "The last day cannot be before the first.";
    case "past":
      return "That day is already past.";
    case "too_long":
      return `A single booking can run at most ${check.maxDays} days. Split it, or ask an admin.`;
    case "beyond_horizon":
      return `Your reliability score (${reliability.score}) lets you book up to ${check.horizonDays} days ahead. Return material on time to book further out.`;
    case "overlap":
      return `${assetName} is already booked on those days. You can join the waitlist instead.`;
  }
}

async function loadReservation(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("fleet_reservations")
    .select("id, asset_id, user_id, start_date, end_date, status, destination")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function handleCancel(admin: Admin, viewer: Viewer, payload: z.infer<typeof cancelSchema>) {
  const reservation = await loadReservation(admin, payload.reservation_id);
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (reservation.user_id !== viewer.id && !viewer.isAdmin) {
    return NextResponse.json({ error: "That booking is not yours." }, { status: 403 });
  }
  if (reservation.status === "picked_up") {
    return NextResponse.json(
      { error: "The material is already out — check it back in instead of cancelling." },
      { status: 409 },
    );
  }
  if (reservation.status === "returned") {
    return NextResponse.json({ error: "That booking is already closed." }, { status: 409 });
  }

  const { error } = await admin
    .from("fleet_reservations")
    .update({ status: "cancelled" })
    .eq("id", payload.reservation_id);
  if (error) throw new Error(error.message);

  await recordAssetEvent(admin, {
    asset_id: reservation.asset_id,
    reservation_id: reservation.id,
    kind: "cancelled",
    actor_user_id: viewer.id,
  });

  // Cancelling frees the week: promote the top of the waitlist, which is
  // ordered by reliability score.
  const promoted = await promoteWaitlist(admin, reservation.asset_id, reservation.start_date);
  return NextResponse.json({ ok: true, promoted });
}

/**
 * Promotes the highest-scoring waitlist entry for a freed span to a real
 * booking. Returns the promoted reservation id, or null when nobody was
 * waiting or the span is still blocked.
 */
async function promoteWaitlist(admin: Admin, assetId: string, startDate: string): Promise<string | null> {
  const { data: waiting, error } = await admin
    .from("fleet_reservations")
    .select("id, user_id, start_date, end_date, created_at")
    .eq("asset_id", assetId)
    .eq("status", "waitlisted")
    .eq("start_date", startDate);
  if (error || !waiting || waiting.length === 0) return null;

  const today = todayInZurich();
  const existing = await fetchAssetSpans(admin, assetId);

  // Score everyone waiting, then try them in order — the first whose span is
  // actually free wins. Ordering is the score's whole purpose.
  const scored = await Promise.all(
    waiting.map(async (row) => ({
      row,
      score: (await fetchReliability(admin, row.user_id, today)).score,
    })),
  );
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.row.created_at < b.row.created_at ? -1 : a.row.created_at > b.row.created_at ? 1 : 0),
  );

  for (const candidate of scored) {
    const clash = existing.some(
      (span) =>
        isBlocking(span.status) &&
        span.start_date <= candidate.row.end_date &&
        candidate.row.start_date <= span.end_date,
    );
    if (clash) continue;

    const { error: promoteError } = await admin
      .from("fleet_reservations")
      .update({ status: "reserved" })
      .eq("id", candidate.row.id)
      .eq("status", "waitlisted");
    if (promoteError) continue;

    await recordAssetEvent(admin, {
      asset_id: assetId,
      reservation_id: candidate.row.id,
      kind: "reserved",
      actor_user_id: candidate.row.user_id,
      note: "Promoted from the waitlist",
    });
    return candidate.row.id;
  }
  return null;
}

async function handleCheckOut(admin: Admin, viewer: Viewer, payload: z.infer<typeof checkOutSchema>) {
  const reservation = await loadReservation(admin, payload.reservation_id);
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (reservation.user_id !== viewer.id && !viewer.isAdmin) {
    return NextResponse.json({ error: "That booking is not yours." }, { status: 403 });
  }
  if (reservation.status !== "reserved") {
    return NextResponse.json({ error: "Only a confirmed booking can be picked up." }, { status: 409 });
  }

  const { data: asset } = await admin
    .from("fleet_assets")
    .select("current_location")
    .eq("id", reservation.asset_id)
    .maybeSingle();

  const destination = payload.location ?? reservation.destination ?? null;

  const [{ error: resError }, { error: assetError }] = await Promise.all([
    admin
      .from("fleet_reservations")
      .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
      .eq("id", payload.reservation_id),
    admin
      .from("fleet_assets")
      .update({
        status: "out",
        current_holder_user_id: reservation.user_id,
        current_holder_label: null,
        current_location: destination,
        location_confirmed_at: new Date().toISOString(),
      })
      .eq("id", reservation.asset_id),
  ]);
  if (resError) throw new Error(resError.message);
  if (assetError) throw new Error(assetError.message);

  await recordAssetEvent(admin, {
    asset_id: reservation.asset_id,
    reservation_id: reservation.id,
    kind: "checked_out",
    actor_user_id: viewer.id,
    from_location: asset?.current_location ?? null,
    to_location: destination,
  });

  return NextResponse.json({ ok: true });
}

async function handleCheckIn(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof checkInSchema>,
  today: string,
) {
  const reservation = await loadReservation(admin, payload.reservation_id);
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (reservation.user_id !== viewer.id && !viewer.isAdmin) {
    return NextResponse.json({ error: "That booking is not yours." }, { status: 403 });
  }
  if (reservation.status !== "picked_up" && reservation.status !== "reserved") {
    return NextResponse.json({ error: "That booking is already closed." }, { status: 409 });
  }

  const { data: asset } = await admin
    .from("fleet_assets")
    .select("current_location, home_location")
    .eq("id", reservation.asset_id)
    .maybeSingle();

  const landingSpot = payload.location ?? asset?.home_location ?? asset?.current_location ?? null;

  const [{ error: resError }, { error: assetError }] = await Promise.all([
    admin
      .from("fleet_reservations")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        // The Zurich date, so an evening check-in is not counted as the next day.
        returned_on: today,
      })
      .eq("id", payload.reservation_id),
    admin
      .from("fleet_assets")
      .update({
        status: "available",
        current_holder_user_id: null,
        current_holder_label: null,
        current_location: landingSpot,
        location_confirmed_at: new Date().toISOString(),
      })
      .eq("id", reservation.asset_id),
  ]);
  if (resError) throw new Error(resError.message);
  if (assetError) throw new Error(assetError.message);

  await recordAssetEvent(admin, {
    asset_id: reservation.asset_id,
    reservation_id: reservation.id,
    kind: "checked_in",
    actor_user_id: viewer.id,
    from_location: asset?.current_location ?? null,
    to_location: landingSpot,
    note: payload.note ?? null,
  });

  const promoted = await promoteWaitlist(admin, reservation.asset_id, reservation.start_date);
  const score = await fetchReliability(admin, reservation.user_id, today);
  return NextResponse.json({ ok: true, promoted, score });
}

async function handleMove(admin: Admin, viewer: Viewer, payload: z.infer<typeof moveSchema>) {
  const { data: asset, error: readError } = await admin
    .from("fleet_assets")
    .select("current_location")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const { error } = await admin
    .from("fleet_assets")
    .update({ current_location: payload.location, location_confirmed_at: new Date().toISOString() })
    .eq("id", payload.asset_id);
  if (error) throw new Error(error.message);

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "moved",
    actor_user_id: viewer.id,
    from_location: asset.current_location,
    to_location: payload.location,
    note: payload.note ?? null,
  });

  return NextResponse.json({ ok: true });
}

async function handleConfirmLocation(admin: Admin, viewer: Viewer, payload: z.infer<typeof confirmSchema>) {
  const { data: asset, error: readError } = await admin
    .from("fleet_assets")
    .select("current_location")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const { error } = await admin
    .from("fleet_assets")
    .update({ location_confirmed_at: new Date().toISOString() })
    .eq("id", payload.asset_id);
  if (error) throw new Error(error.message);

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "location_confirmed",
    actor_user_id: viewer.id,
    to_location: asset.current_location,
  });

  return NextResponse.json({ ok: true });
}

async function handleSetStatus(admin: Admin, viewer: Viewer, payload: z.infer<typeof setStatusSchema>) {
  // Marking something retired or in-repair takes it off the calendar for
  // everyone, so it stays an admin action.
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can change an asset's status." }, { status: 403 });
  }

  const { error } = await admin
    .from("fleet_assets")
    .update({ status: payload.status })
    .eq("id", payload.asset_id);
  if (error) throw new Error(error.message);

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "status_changed",
    actor_user_id: viewer.id,
    note: payload.note ? `${payload.status}: ${payload.note}` : payload.status,
  });

  return NextResponse.json({ ok: true });
}
