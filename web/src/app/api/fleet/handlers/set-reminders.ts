import { NextResponse } from "next/server";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

/** Global on/off for return reminders. Admin only — it decides whether the app mails people. */
export async function handleSetReminders(
  ctx: FleetActionContext,
  payload: FleetPayload<"set_reminders">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
