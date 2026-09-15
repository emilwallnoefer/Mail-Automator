import { NextResponse } from "next/server";
import { normalizeHolderLabel } from "@/lib/fleet-rules";
import type { FleetActionContext } from "./shared";

/**
 * Registers the signed-in user as a fleet member under their own name.
 *
 * For someone whose name is not in the spreadsheet at all — a new joiner, or
 * anyone who simply never appeared in the roadshow calendar. It creates the
 * alias so the identity prompt does not ask again, and so a LATER import that
 * does mention them resolves straight to their account.
 */
export async function handleRegisterMember(ctx: FleetActionContext): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
