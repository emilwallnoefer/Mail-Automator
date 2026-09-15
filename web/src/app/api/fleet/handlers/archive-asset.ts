import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

/**
 * Removes material from the fleet, or restores it.
 *
 * Soft: `active = false`. Every read path filters on `active`, so the unit
 * disappears from the calendar, the lists and the reminders while its rows,
 * its movement history and its bookings survive. A hard delete would cascade
 * the history away, and "this left the fleet" is not "this never existed" —
 * which also makes the action reversible from the same screen.
 */
export async function handleArchiveAsset(
  ctx: FleetActionContext,
  payload: FleetPayload<"archive_asset">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
