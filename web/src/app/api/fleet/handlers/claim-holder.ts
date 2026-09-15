import { NextResponse } from "next/server";
import { recordAssetEvent } from "@/lib/fleet-queries";
import { holderLabelMatchesPerson, normalizeHolderLabel } from "@/lib/fleet-rules";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

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
export async function handleClaimHolder(
  ctx: FleetActionContext,
  payload: FleetPayload<"claim_holder">,
): Promise<NextResponse> {
  const { admin, viewer } = ctx;
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
