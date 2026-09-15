import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

/**
 * Records where a unit is now. Open to any signed-in user on purpose: the
 * person who knows where the material is is whoever is standing next to it, and
 * requiring an admin to relay that is how the old sheet went stale. Every move
 * writes an actor-stamped event, so the history says who said what.
 */
export async function handleMove(
  ctx: FleetActionContext,
  payload: FleetPayload<"move">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
