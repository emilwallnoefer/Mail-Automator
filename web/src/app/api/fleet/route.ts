import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { checkRateLimit, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";
import {
  DEFAULT_WINDOW_DAYS,
  displayNameFor,
  fetchAssetSpans,
  fetchReliability,
  recordAssetEvent,
  todayInZurich,
} from "@/lib/fleet-queries";
import {
  addDays,
  checkReservation,
  closureStatusFor,
  holderLabelMatchesPerson,
  isBlocking,
  normalizeHolderLabel,
  parseDateKey,
  toDateKey,
} from "@/lib/fleet-rules";
import { buildDemoBoard } from "@/lib/fleet-demo";
import { parseBoardWindow } from "./window";
import { buildFleetBoard } from "@/lib/fleet-board";

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

const claimHolderSchema = z.object({
  action: z.literal("claim_holder"),
  /** The free-text holder name to take ownership of. */
  label: z.string().trim().min(1).max(160),
  /** Admin only: assign the name to somebody else instead of yourself. */
  user_id: z.string().uuid().optional(),
});

const assignSchema = z.object({
  action: z.literal("assign"),
  asset_id: z.string().uuid(),
  /** Who it goes to. A free-text name is fine — they may not have an account. */
  holder_label: z.string().trim().min(1).max(160),
  location: z.string().trim().max(160).optional(),
  note: z.string().trim().max(280).optional(),
});

const returnToPoolSchema = z.object({
  action: z.literal("return_to_pool"),
  asset_id: z.string().uuid(),
  location: z.string().trim().max(160).optional(),
  note: z.string().trim().max(280).optional(),
});

const registerMemberSchema = z.object({
  action: z.literal("register_member"),
});

const setRemindersSchema = z.object({
  action: z.literal("set_reminders"),
  enabled: z.boolean(),
});

const ASSET_CATEGORIES = [
  "drone", "lidar", "rad_payload", "ut_payload", "lel_payload",
  "dummy_drone", "tether", "range_extender", "gcs", "accessory", "other",
] as const;

const ASSET_STATUSES = ["available", "reserved", "out", "in_repair", "retired"] as const;

/** Fields an admin can set on a piece of material. Shared by create and update. */
const assetFields = {
  name: z.string().trim().min(1).max(120),
  serial_number: z.string().trim().max(120).nullable().optional(),
  category: z.enum(ASSET_CATEGORIES),
  model: z.string().trim().max(120).nullable().optional(),
  owner_group: z.string().trim().max(120).nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  /** true = shared bookable pool (calendar); false = assigned to someone. */
  pooled: z.boolean().optional(),
  home_location: z.string().trim().max(160).nullable().optional(),
  current_location: z.string().trim().max(160).nullable().optional(),
  current_holder_label: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
};

const createAssetSchema = z.object({ action: z.literal("create_asset"), ...assetFields });

const updateAssetSchema = z.object({
  action: z.literal("update_asset"),
  asset_id: z.string().uuid(),
  name: assetFields.name.optional(),
  serial_number: assetFields.serial_number,
  category: assetFields.category.optional(),
  model: assetFields.model,
  owner_group: assetFields.owner_group,
  status: assetFields.status,
  pooled: assetFields.pooled,
  home_location: assetFields.home_location,
  current_location: assetFields.current_location,
  current_holder_label: assetFields.current_holder_label,
  notes: assetFields.notes,
});

const archiveAssetSchema = z.object({
  action: z.literal("archive_asset"),
  asset_id: z.string().uuid(),
  /** false restores a previously archived unit. */
  archived: z.boolean().default(true),
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
  claimHolderSchema,
  setRemindersSchema,
  assignSchema,
  returnToPoolSchema,
  createAssetSchema,
  updateAssetSchema,
  archiveAssetSchema,
  registerMemberSchema,
]);

type Viewer = { id: string; email: string | null; name: string; isAdmin: boolean };

async function resolveViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: displayNameFor({
      email: user.email,
      user_metadata: (user.user_metadata ?? null) as Record<string, unknown> | null,
    }),
    isAdmin: isAdminEmail(user.email ?? null),
  };
}

export async function GET(request: Request) {
  const viewer = await resolveViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boardWindow = parseBoardWindow(request, DEFAULT_WINDOW_DAYS);
  if (!boardWindow) return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  const { windowStart, windowDays } = boardWindow;

  try {
    const admin = createAdminClient();
    return NextResponse.json(await buildFleetBoard(admin, viewer, boardWindow, { autoLink: true }));
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

  let result: NextResponse;
  try {
    result = await dispatch(admin, viewer, payload, today);
  } catch (error) {
    console.error(`POST /api/fleet (${payload.action}) failed`, error);
    return NextResponse.json({ error: "Could not complete that action." }, { status: 500 });
  }

  // The write is done. Hand back the refreshed board with it, so the client does
  // not have to ask for one — that second request is a whole extra function
  // invocation and its own `auth.getUser()` round trip, on top of re-reading
  // everything this request already has a warm connection for.
  if (!result.ok) return result;
  return await withFreshBoard(result, admin, viewer, request, payload.action);
}

/**
 * Attaches a freshly built board to a successful write response.
 *
 * The write has already happened by this point, so a failure here must never
 * turn into a failed action: the original response goes back untouched and the
 * client falls back to fetching the board itself.
 */
async function withFreshBoard(
  result: NextResponse,
  admin: Admin,
  viewer: Viewer,
  request: Request,
  action: string,
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await result.clone().json()) as Record<string, unknown>;
  } catch {
    return result;
  }

  try {
    // A malformed window must not cost anyone their booking, so an unparseable
    // one falls back to the default window rather than failing the request.
    const boardWindow = parseBoardWindow(request, DEFAULT_WINDOW_DAYS) ?? {
      windowDays: DEFAULT_WINDOW_DAYS,
    };
    const board = await buildFleetBoard(admin, viewer, boardWindow, { autoLink: false });
    return NextResponse.json({ ...body, board });
  } catch (error) {
    console.error(`POST /api/fleet (${action}) succeeded but the board refresh failed`, error);
    return NextResponse.json(body);
  }
}

/** Routes one validated payload to its handler. */
async function dispatch(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof postSchema>,
  today: string,
): Promise<NextResponse> {
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
    case "claim_holder":
      return await handleClaimHolder(admin, viewer, payload);
    case "set_reminders":
      return await handleSetReminders(admin, viewer, payload);
    case "assign":
      return await handleAssign(admin, viewer, payload);
    case "return_to_pool":
      return await handleReturnToPool(admin, viewer, payload);
    case "create_asset":
      return await handleCreateAsset(admin, viewer, payload);
    case "update_asset":
      return await handleUpdateAsset(admin, viewer, payload);
    case "archive_asset":
      return await handleArchiveAsset(admin, viewer, payload);
    case "register_member":
      return await handleRegisterMember(admin, viewer);
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

  // Three independent reads, so they go together: none of them needs an answer
  // from either of the others, and run one after another they cost three round
  // trips where one will do.
  const [{ data: asset, error: assetError }, reliability, existing] = await Promise.all([
    admin
      .from("fleet_assets")
      .select("id, name, status, active, current_location")
      .eq("id", payload.asset_id)
      .maybeSingle(),
    fetchReliability(admin, viewer.id, today),
    fetchAssetSpans(admin, payload.asset_id),
  ]);
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

/**
 * Loads a reservation together with the asset it points at.
 *
 * The asset comes back through the `asset_id` foreign key rather than as a
 * second query: check-out and check-in both need the current location, and
 * asking for it separately cost a round trip for data the database can hand
 * over in the same one.
 */
async function loadReservation(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("fleet_reservations")
    .select(
      "id, asset_id, user_id, start_date, end_date, status, destination, fleet_assets(current_location, home_location)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  // PostgREST nests the embedded row under the table name; a many-to-one
  // embed is a single object, but type it defensively either way. The raw key
  // is dropped so callers have exactly one way to reach the asset.
  const { fleet_assets: embedded, ...reservation } = data as typeof data & { fleet_assets?: unknown };
  const asset = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { current_location: string | null; home_location: string | null }
    | null
    | undefined;

  return { ...reservation, asset: asset ?? null };
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

  // Cancelling frees the week: promote the top of the waitlist, which is
  // ordered by reliability score. That and the audit event are independent of
  // each other, so they go together.
  const [, promoted] = await Promise.all([
    recordAssetEvent(admin, {
      asset_id: reservation.asset_id,
      reservation_id: reservation.id,
      kind: "cancelled",
      actor_user_id: viewer.id,
    }),
    promoteWaitlist(admin, reservation.asset_id, reservation.start_date),
  ]);
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

  const asset = reservation.asset;
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

  const asset = reservation.asset;
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

  // The audit event, the waitlist promotion and the score all follow from the
  // update above but not from each other, so they go together rather than in
  // series.
  const [, promoted, score] = await Promise.all([
    recordAssetEvent(admin, {
      asset_id: reservation.asset_id,
      reservation_id: reservation.id,
      kind: "checked_in",
      actor_user_id: viewer.id,
      from_location: asset?.current_location ?? null,
      to_location: landingSpot,
      note: payload.note ?? null,
    }),
    promoteWaitlist(admin, reservation.asset_id, reservation.start_date),
    fetchReliability(admin, reservation.user_id, today),
  ]);
  return NextResponse.json({ ok: true, promoted, score });
}

/**
 * Records where a unit is now. Open to any signed-in user on purpose: the
 * person who knows where the material is is whoever is standing next to it, and
 * requiring an admin to relay that is how the old sheet went stale. Every move
 * writes an actor-stamped event, so the history says who said what.
 */
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

/** "Yes, it is still there." Open to everyone, for the same reason as `move`. */
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


/**
 * Takes ownership of every live booking filed under a free-text holder name.
 *
 * This is how the spreadsheet import resolves itself: the material was recorded
 * as "out with Wataru" before Wataru had an account, and when he signs in he
 * claims the name and those bookings become his — check-in, reminders and all.
 *
 * Authorisation is the whole story here, because claiming a name hands you
 * somebody's material and their booking history:
 *
 *   - an admin may map any label to any account;
 *   - anyone else may only claim a label that matches THEIR OWN name or email
 *     local part, per `holderLabelMatchesPerson`, which refuses group labels
 *     ("APAC team", "FPS") outright.
 */
async function handleClaimHolder(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof claimHolderSchema>,
) {
  const label = payload.label.trim();
  const normalized = normalizeHolderLabel(label);
  if (!normalized) {
    return NextResponse.json({ error: "That name is empty." }, { status: 400 });
  }

  const targetUserId = payload.user_id ?? viewer.id;

  if (targetUserId !== viewer.id && !viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can assign a name to someone else." }, { status: 403 });
  }

  // A name ALREADY mapped to somebody else is never claimable by a non-admin —
  // that would hand over a colleague's material and their booking history.
  const { data: existingAlias } = await admin
    .from("fleet_holder_aliases")
    .select("user_id")
    .eq("label", normalized)
    .maybeSingle();
  if (existingAlias && existingAlias.user_id !== targetUserId && !viewer.isAdmin) {
    return NextResponse.json(
      { error: `"${label}" already belongs to someone else. An admin can reassign it.` },
      { status: 409 },
    );
  }

  // An UNCLAIMED name is fair game: the spreadsheet spelled people inconsistently
  // ("Emil", "Emil Wallnofer", "Inga Khchoyan"), so a strict name match would
  // strand exactly the people this flow exists to onboard. Every claim is
  // recorded with who made it, so a wrong pick is visible and reversible rather
  // than prevented.
  const selfMatch = holderLabelMatchesPerson(label, { name: viewer.name, email: viewer.email });

  // Match on the normalised label so "Wataru", "wataru" and "Wataru." are one
  // name. Done in JS rather than SQL because normalisation (accent folding,
  // punctuation) lives in fleet-rules and must not be reimplemented in Postgres.
  const { data: candidates, error: readError } = await admin
    .from("fleet_reservations")
    .select("id, holder_label, asset_id")
    .is("user_id", null);
  if (readError) throw new Error(readError.message);

  const matching = (candidates ?? []).filter(
    (row) => row.holder_label && normalizeHolderLabel(row.holder_label) === normalized,
  );

  if (matching.length > 0) {
    const { error: updateError } = await admin
      .from("fleet_reservations")
      .update({ user_id: targetUserId })
      .in(
        "id",
        matching.map((row) => row.id),
      );
    if (updateError) throw new Error(updateError.message);

    // The asset's own holder pointer should follow the booking.
    for (const row of matching) {
      await admin
        .from("fleet_assets")
        .update({ current_holder_user_id: targetUserId })
        .eq("id", row.asset_id)
        .eq("status", "out");
      await recordAssetEvent(admin, {
        asset_id: row.asset_id,
        reservation_id: row.id,
        kind: "note",
        actor_user_id: viewer.id,
        // Whether the name actually matches the claimant is recorded rather
        // than enforced: picking a name that is not obviously yours is allowed
        // (the sheet spelled people inconsistently), but it should be visible.
        note: `Holder "${label}" claimed by ${viewer.name}${selfMatch ? "" : " (name does not match theirs)"}`,
      });
    }
  }

  // Assets can carry a holder name with no reservation behind them at all — an
  // assigned unit's holder lives on the asset row. Link those too, or claiming
  // "Igor Stapper" would take his bookings but leave his kit pointing at a name.
  const { data: heldAssets } = await admin
    .from("fleet_assets")
    .select("id, name, current_holder_label")
    .is("current_holder_user_id", null)
    .not("current_holder_label", "is", null);

  const heldMatches = (heldAssets ?? []).filter(
    (a) => a.current_holder_label && normalizeHolderLabel(a.current_holder_label) === normalized,
  );
  if (heldMatches.length > 0) {
    const { error: assetError } = await admin
      .from("fleet_assets")
      .update({ current_holder_user_id: targetUserId })
      .in("id", heldMatches.map((a) => a.id));
    if (assetError) throw new Error(assetError.message);
  }

  // Remember the mapping so a later import of the same name resolves directly.
  const { error: aliasError } = await admin
    .from("fleet_holder_aliases")
    .upsert(
      { label: normalized, user_id: targetUserId, claimed_by: viewer.id, claimed_at: new Date().toISOString() },
      { onConflict: "label" },
    );
  if (aliasError) throw new Error(aliasError.message);

  const parts: string[] = [];
  if (matching.length > 0) {
    parts.push(`${matching.length} booking${matching.length === 1 ? "" : "s"}`);
  }
  if (heldMatches.length > 0) {
    parts.push(`${heldMatches.length} assigned unit${heldMatches.length === 1 ? "" : "s"}`);
  }

  return NextResponse.json({
    ok: true,
    claimed: matching.length,
    assets_linked: heldMatches.length,
    message:
      parts.length > 0
        ? `${parts.join(" and ")} filed under "${label}" ${
            matching.length + heldMatches.length === 1 ? "is" : "are"
          } now yours.`
        : `"${label}" is linked, but there was nothing open under that name.`,
  });
}

/** Global on/off for return reminders. Admin only — it decides whether the app mails people. */
async function handleSetReminders(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof setRemindersSchema>,
) {
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can change the reminder setting." }, { status: 403 });
  }
  const { error } = await admin
    .from("fleet_settings")
    .upsert({ id: true, reminders_enabled: payload.enabled }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return NextResponse.json({
    ok: true,
    message: payload.enabled ? "Return reminders are now on." : "Return reminders are paused.",
  });
}


/**
 * Closes every live booking on an asset, because the asset is moving between
 * the shared pool and a fixed assignment and cannot stay booked either way.
 *
 * The two outcomes are split rather than blanket-cancelled: material that was
 * physically out is recorded as returned (and scored as such), while a booking
 * nobody ever collected is cancelled. See `closureStatusFor`.
 */
async function closeLiveReservations(admin: Admin, assetId: string) {
  const { data: live, error } = await admin
    .from("fleet_reservations")
    .select("id, status")
    .eq("asset_id", assetId)
    .in("status", ["reserved", "picked_up"]);
  if (error) throw new Error(error.message);
  if (!live || live.length === 0) return;

  const today = todayInZurich();
  const now = new Date().toISOString();

  const returned = live.filter((row) => closureStatusFor(row.status) === "returned").map((r) => r.id);
  const cancelled = live.filter((row) => closureStatusFor(row.status) === "cancelled").map((r) => r.id);

  if (returned.length > 0) {
    const { error: returnError } = await admin
      .from("fleet_reservations")
      .update({ status: "returned", returned_at: now, returned_on: today })
      .in("id", returned);
    if (returnError) throw new Error(returnError.message);
  }
  if (cancelled.length > 0) {
    const { error: cancelError } = await admin
      .from("fleet_reservations")
      .update({ status: "cancelled" })
      .in("id", cancelled);
    if (cancelError) throw new Error(cancelError.message);
  }
}

/**
 * Takes a unit out of the shared pool and assigns it to someone.
 *
 * Used for the units that are not really shared — a regional demo drone, a
 * customer loan, a unit that lives with one person. It leaves the calendar
 * (nobody can book it) and moves to the Assigned tab.
 *
 * The holder is free text on purpose: the person may have no account, which is
 * exactly the situation the sheet was in. It is recorded as an open booking so
 * the unit still has a check-in path and can be claimed later.
 *
 * Admin only, for the same reason `set_status` is: this takes material off the
 * calendar for everyone and cancels whatever was booked on it. It is reachable
 * only from Fleet -> Manage, which is already an admin-only surface.
 */
async function handleAssign(admin: Admin, viewer: Viewer, payload: z.infer<typeof assignSchema>) {
  if (!viewer.isAdmin) {
    return NextResponse.json(
      { error: "Only admins can assign material out of the shared pool." },
      { status: 403 },
    );
  }

  const { data: asset, error: readError } = await admin
    .from("fleet_assets")
    .select("id, name, status, current_location, pooled")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const location = payload.location ?? asset.current_location ?? null;

  // Every live booking has to go: the unit is leaving the pool, and leaving a
  // reservation pointing at it would strand that person on a date they can no
  // longer use. `closureStatusFor` decides how each one ends, so a booking that
  // was never collected is not filed away as a return.
  await closeLiveReservations(admin, payload.asset_id);

  const today = todayInZurich();
  const { error: insertError } = await admin.from("fleet_reservations").insert({
    asset_id: payload.asset_id,
    user_id: null,
    holder_label: payload.holder_label,
    start_date: today,
    end_date: addDays(today, 30),
    status: "picked_up",
    destination: location,
    source: "sheet_import",
    picked_up_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(insertError.message);

  const { error: assetError } = await admin
    .from("fleet_assets")
    .update({
      pooled: false,
      status: "out",
      current_holder_user_id: null,
      current_holder_label: payload.holder_label,
      current_location: location,
      location_confirmed_at: new Date().toISOString(),
    })
    .eq("id", payload.asset_id);
  if (assetError) throw new Error(assetError.message);

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "checked_out",
    actor_user_id: viewer.id,
    from_location: asset.current_location,
    to_location: location,
    note: `Assigned to ${payload.holder_label}${payload.note ? ` — ${payload.note}` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    message: `${asset.name} is now assigned to ${payload.holder_label}.`,
  });
}

/**
 * Puts an assigned unit back into the shared pool: it becomes bookable and
 * reappears in the calendar. Closes whatever open booking was holding it.
 *
 * Admin only, as the mirror of `assign`. Without the guard any signed-in user
 * could name any asset and force-close someone else's live booking — and a
 * booking closed as `returned` past its due date is scored as a late return, so
 * an open endpoint here is also a way to damage another person's reliability.
 */
async function handleReturnToPool(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof returnToPoolSchema>,
) {
  if (!viewer.isAdmin) {
    return NextResponse.json(
      { error: "Only admins can return material to the shared pool." },
      { status: 403 },
    );
  }

  const { data: asset, error: readError } = await admin
    .from("fleet_assets")
    .select("id, name, current_location, home_location")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const landingSpot = payload.location ?? asset.home_location ?? asset.current_location ?? null;

  await closeLiveReservations(admin, payload.asset_id);

  const { error: assetError } = await admin
    .from("fleet_assets")
    .update({
      pooled: true,
      status: "available",
      current_holder_user_id: null,
      current_holder_label: null,
      current_location: landingSpot,
      location_confirmed_at: new Date().toISOString(),
    })
    .eq("id", payload.asset_id);
  if (assetError) throw new Error(assetError.message);

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "checked_in",
    actor_user_id: viewer.id,
    from_location: asset.current_location,
    to_location: landingSpot,
    note: `Returned to the bookable pool${payload.note ? ` — ${payload.note}` : ""}`,
  });

  return NextResponse.json({ ok: true, message: `${asset.name} is back in the pool and bookable.` });
}


/**
 * Adds a piece of material to the fleet. Admin only — the fleet list is shared
 * reference data, and a stray entry shows up in everyone's calendar.
 */
async function handleCreateAsset(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof createAssetSchema>,
) {
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can add material." }, { status: 403 });
  }

  const serial = payload.serial_number?.trim() || null;
  const pooled = payload.pooled ?? true;
  const holder = payload.current_holder_label?.trim() || null;

  const { data, error } = await admin
    .from("fleet_assets")
    .insert({
      name: payload.name.trim(),
      serial_number: serial,
      category: payload.category,
      model: payload.model?.trim() || null,
      owner_group: payload.owner_group?.trim() || null,
      // An assigned unit is out with someone by definition; a pooled one with no
      // holder is on the shelf. Deriving this keeps the two from disagreeing.
      status: payload.status ?? (pooled ? "available" : "out"),
      pooled,
      home_location: payload.home_location?.trim() || null,
      current_location: payload.current_location?.trim() || payload.home_location?.trim() || null,
      current_holder_label: pooled ? null : holder,
      notes: payload.notes?.trim() || null,
      location_confirmed_at: new Date().toISOString(),
    })
    .select("id, name")
    .single();

  if (error) {
    // The serial has a partial unique index; a clash is a user error, not a bug.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Serial ${serial} is already on another unit.` },
        { status: 409 },
      );
    }
    throw new Error(error.message);
  }

  await recordAssetEvent(admin, {
    asset_id: data.id,
    kind: "created",
    actor_user_id: viewer.id,
    to_location: payload.current_location?.trim() || payload.home_location?.trim() || null,
    note: `Added to the fleet${holder ? ` — assigned to ${holder}` : ""}`,
  });

  return NextResponse.json({ ok: true, asset_id: data.id, message: `${data.name} added.` });
}

/** Edits a piece of material. Only the fields present in the request change. */
async function handleUpdateAsset(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof updateAssetSchema>,
) {
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can edit material." }, { status: 403 });
  }

  const { action: _action, asset_id: assetId, ...rest } = payload;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    patch[key] = typeof value === "string" ? (value.trim() || null) : value;
  }
  if (typeof patch.name === "string" && !patch.name.trim()) {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  }
  // Moving a unit into the pool means nobody holds it any more.
  if (patch.pooled === true) patch.current_holder_label = null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, message: "Nothing to change." });
  }

  const { data, error } = await admin
    .from("fleet_assets")
    .update(patch)
    .eq("id", assetId)
    .select("name")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That serial is already on another unit." }, { status: 409 });
    }
    throw new Error(error.message);
  }
  if (!data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  await recordAssetEvent(admin, {
    asset_id: assetId,
    kind: "note",
    actor_user_id: viewer.id,
    note: `Edited: ${Object.keys(patch).join(", ")}`,
  });

  return NextResponse.json({ ok: true, message: `${data.name} updated.` });
}

/**
 * Removes material from the fleet, or restores it.
 *
 * Soft: `active = false`. Every read path filters on `active`, so the unit
 * disappears from the calendar, the lists and the reminders while its rows,
 * its movement history and its bookings survive. A hard delete would cascade
 * the history away, and "this left the fleet" is not "this never existed" —
 * which also makes the action reversible from the same screen.
 */
async function handleArchiveAsset(
  admin: Admin,
  viewer: Viewer,
  payload: z.infer<typeof archiveAssetSchema>,
) {
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Only admins can remove material." }, { status: 403 });
  }

  const { data: asset, error: readError } = await admin
    .from("fleet_assets")
    .select("id, name, active")
    .eq("id", payload.asset_id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const { error } = await admin
    .from("fleet_assets")
    .update({ active: !payload.archived })
    .eq("id", payload.asset_id);
  if (error) throw new Error(error.message);

  // A live booking against a unit that just left would sit in someone's list
  // forever with no way to check it in.
  let cancelled = 0;
  if (payload.archived) {
    const { data: live } = await admin
      .from("fleet_reservations")
      .select("id")
      .eq("asset_id", payload.asset_id)
      .in("status", ["reserved", "picked_up"]);
    if (live && live.length > 0) {
      await admin
        .from("fleet_reservations")
        .update({ status: "cancelled" })
        .in("id", live.map((r) => r.id));
      cancelled = live.length;
    }
  }

  await recordAssetEvent(admin, {
    asset_id: payload.asset_id,
    kind: "status_changed",
    actor_user_id: viewer.id,
    note: payload.archived ? "Removed from the fleet" : "Restored to the fleet",
  });

  return NextResponse.json({
    ok: true,
    message: payload.archived
      ? `${asset.name} removed${cancelled > 0 ? `, ${cancelled} booking${cancelled === 1 ? "" : "s"} cancelled` : ""}.`
      : `${asset.name} restored.`,
  });
}


/**
 * Registers the signed-in user as a fleet member under their own name.
 *
 * For someone whose name is not in the spreadsheet at all — a new joiner, or
 * anyone who simply never appeared in the roadshow calendar. It creates the
 * alias so the identity prompt does not ask again, and so a LATER import that
 * does mention them resolves straight to their account.
 */
async function handleRegisterMember(admin: Admin, viewer: Viewer) {
  const label = normalizeHolderLabel(viewer.name || viewer.email || "");
  if (!label) {
    return NextResponse.json({ error: "Could not work out your name." }, { status: 400 });
  }

  const { data: taken } = await admin
    .from("fleet_holder_aliases")
    .select("user_id")
    .eq("label", label)
    .maybeSingle();
  if (taken && taken.user_id !== viewer.id) {
    return NextResponse.json(
      { error: "Someone else already registered under that name. Ask an admin to sort it out." },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("fleet_holder_aliases")
    .upsert(
      { label, user_id: viewer.id, claimed_by: viewer.id, claimed_at: new Date().toISOString() },
      { onConflict: "label" },
    );
  if (error) throw new Error(error.message);

  return NextResponse.json({
    ok: true,
    message: `You're set up as ${viewer.name}. Nothing from the old sheet is filed under you.`,
  });
}
