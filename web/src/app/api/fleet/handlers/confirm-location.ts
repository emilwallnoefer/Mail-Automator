import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

/** "Yes, it is still there." Open to everyone, for the same reason as `move`. */
export async function handleConfirmLocation(
  ctx: FleetActionContext,
  payload: FleetPayload<"confirm_location">,
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
