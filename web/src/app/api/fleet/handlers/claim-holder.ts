import { NextResponse } from "next/server";
import { getAdminEmails } from "@/lib/admin";
import { isResendConfigured, sendEmailViaResend } from "@/lib/email/resend";
import { recordAssetEvent } from "@/lib/fleet-queries";
import {
  buildHolderClaimMismatchEmail,
  claimEventNote,
  describeClaimedMaterial,
  type HolderClaim,
} from "@/lib/fleet-holder-claims";
import { holderLabelMatchesPerson, normalizeHolderLabel } from "@/lib/fleet-rules";
import type { FleetActionContext } from "./shared";
import type { FleetPayload } from "./schemas";

/** Deep link to Admin → Holder claims, for the mismatch notification. */
export const HOLDER_CLAIMS_PATH = "/dashboard?module=admin&section=holder_claims";

/**
 * Tells the admins that somebody claimed a name that does not look like theirs.
 *
 * Best-effort on purpose, exactly like `api/chat/certificate-request`: by the
 * time this runs the claim has already succeeded and is already recorded on the
 * alias row. A missing Resend key, an empty `ADMIN_EMAILS`, a network blip or a
 * 500 from Resend must never turn into a failed claim — a mail outage cannot be
 * allowed to block onboarding, which is the one thing this flow exists to do.
 * Failures are logged, and that is all.
 */
async function notifyAdminsOfMismatch(claim: HolderClaim, origin: string): Promise<void> {
  try {
    const recipients = getAdminEmails();
    if (recipients.length === 0 || !isResendConfigured()) {
      console.warn(
        "claim_holder: no admin notification sent (ADMIN_EMAILS empty or Resend unconfigured)",
      );
      return;
    }
    const email = buildHolderClaimMismatchEmail(claim, `${origin}${HOLDER_CLAIMS_PATH}`);
    const results = await Promise.all(
      recipients.map((to) =>
        sendEmailViaResend({ to, subject: email.subject, html: email.html, text: email.text }),
      ),
    );
    for (const [i, result] of results.entries()) {
      if (!result.ok) {
        console.error(`claim_holder: mail to ${recipients[i]} failed — ${result.error}`);
      }
    }
  } catch (error) {
    console.error("claim_holder: admin notification threw", error);
  }
}

/**
 * Takes ownership of every live booking filed under a free-text holder name.
 *
 * This is how the spreadsheet import resolves itself: the material was recorded
 * as "out with Wataru" before Wataru had an account, and when he signs in he
 * claims the name and those bookings become his — check-in, reminders and all.
 *
 * Claiming an UNCLAIMED name is deliberately permissive: any signed-in user may
 * claim any free label, whether or not it looks like theirs. That is not an
 * oversight. The sheet spelled people inconsistently ("Emil", "Emil Wallnofer",
 * "Inga Khchoyan") and filed real, one-person material under group labels
 * ("APAC team", "FPS"), so a strict name match would strand exactly the people
 * this flow exists to onboard. Do not "fix" it back into a match check.
 *
 * What is enforced instead is visibility and reversibility:
 *
 *   - an admin may map any label to any account;
 *   - a label ALREADY mapped to somebody else is never claimable by a non-admin,
 *     because that would hand over a colleague's material and their history;
 *   - every claim records who made it, the label as typed, and whether it looked
 *     like the claimant (`holderLabelMatchesPerson`) on the alias row;
 *   - a mismatch is written into the asset history AND mailed to the admins;
 *   - Admin → Holder claims lists every claim and lets an admin reassign the
 *     label to the right account or release it back to unclaimed.
 */
export async function handleClaimHolder(
  ctx: FleetActionContext,
  payload: FleetPayload<"claim_holder">,
): Promise<NextResponse> {
  const { admin, viewer, origin } = ctx;
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
  // than prevented. Mismatches additionally land in the admins' inbox below.
  //
  // An admin filing a label under SOMEBODY ELSE is not a self-match question at
  // all — it is the correction, not the thing to report — so the check runs
  // against whoever the label is being filed under, and an admin acting for a
  // third party is never treated as a suspicious claim.
  const claimingForSelf = targetUserId === viewer.id;
  const selfMatch = claimingForSelf
    ? holderLabelMatchesPerson(label, { name: viewer.name, email: viewer.email })
    : true;

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
        // Wording shared with the admin table and the mail — see
        // `lib/fleet-holder-claims.ts`.
        note: claimEventNote({ label, claimant: { name: viewer.name, email: viewer.email }, selfMatch }),
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
  //
  // `claimed_label` keeps the human spelling, which the primary key cannot: it
  // is the normalised form, so "Emil Wallnöfer" is stored as "emil wallnofer"
  // and the admin table would otherwise have no way to show what was typed.
  const { error: aliasError } = await admin
    .from("fleet_holder_aliases")
    .upsert(
      {
        label: normalized,
        user_id: targetUserId,
        claimed_by: viewer.id,
        claimed_at: new Date().toISOString(),
        self_match: selfMatch,
        claimed_label: label,
      },
      { onConflict: "label" },
    );
  if (aliasError) throw new Error(aliasError.message);

  const material = { bookings: matching.length, assets: heldMatches.length };

  // The claim is committed. Everything after this point is reporting, and must
  // not be able to undo it.
  if (!selfMatch) {
    await notifyAdminsOfMismatch(
      {
        label,
        claimant: { name: viewer.name, email: viewer.email },
        selfMatch,
        material,
      },
      origin,
    );
  }

  const moved = describeClaimedMaterial(material);

  return NextResponse.json({
    ok: true,
    claimed: matching.length,
    assets_linked: heldMatches.length,
    self_match: selfMatch,
    message:
      material.bookings + material.assets > 0
        ? `${moved} filed under "${label}" ${
            material.bookings + material.assets === 1 ? "is" : "are"
          } now yours.`
        : `"${label}" is linked, but there was nothing open under that name.`,
  });
}
