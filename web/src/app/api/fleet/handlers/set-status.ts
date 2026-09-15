import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

export async function handleSetStatus(
  ctx: FleetActionContext,
  payload: FleetPayload<"set_status">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
