import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import { loadReservation, type FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

export async function handleCheckOut(
  ctx: FleetActionContext,
  payload: FleetPayload<"check_out">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
