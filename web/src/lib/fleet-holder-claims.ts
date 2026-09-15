/**
 * Fleet holder claims — the shared vocabulary for "who claimed which name".
 *
 * Claiming a free-text holder label is deliberately permissive (see
 * `app/api/fleet/handlers/claim-holder.ts`): the fleet was imported from a
 * spreadsheet that spelled people inconsistently, so refusing a label that does
 * not look like the claimant would block the very people the flow exists to
 * onboard. What the system does instead is *record* the mismatch, *mail* the
 * admins, and let them fix it from Admin → Holder claims.
 *
 * That makes three surfaces describe the same claim: the notification email,
 * the admin table, and the `fleet_asset_events` note. This module is the one
 * place the wording lives, so they cannot drift — the same split as
 * `lib/certificate-request.ts`.
 *
 * Deliberately isomorphic and dependency-free: no env, no Supabase, no DOM, and
 * no `Date.now()`. The client table imports it as happily as the route does.
 */

/** A person as the claim surfaces need them: a name, and maybe an address. */
export type ClaimPerson = {
  name: string;
  email: string | null;
};

/** How much material a label carries. Both counts come from the same match. */
export type ClaimedMaterial = {
  /** Bookings in `fleet_reservations` filed under the label. */
  bookings: number;
  /** Units in `fleet_assets` whose holder is the label (assigned, not booked). */
  assets: number;
};

export type HolderClaim = {
  /** The label as a human typed it. Falls back to the normalised form. */
  label: string;
  claimant: ClaimPerson;
  /** Did the label look like the claimant at claim time? */
  selfMatch: boolean;
  material: ClaimedMaterial;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * "3 bookings and 1 assigned unit", or "nothing" when a label is linked but
 * carries no material. Used by the email, the admin table, and the success
 * message on the claim itself.
 */
export function describeClaimedMaterial(material: ClaimedMaterial): string {
  const parts: string[] = [];
  if (material.bookings > 0) parts.push(plural(material.bookings, "booking"));
  if (material.assets > 0) parts.push(plural(material.assets, "assigned unit"));
  return parts.length > 0 ? parts.join(" and ") : "nothing";
}

/** "Emil Wallnöfer <emil@example.com>", or just the name when there is no address. */
export function describePerson(person: ClaimPerson): string {
  return person.email ? `${person.name} <${person.email}>` : person.name;
}

/**
 * The `fleet_asset_events` note written when a claim lands. The mismatch is
 * spelled out in the history itself, so someone reading an asset's timeline a
 * year later sees the same fact the admin table shows.
 */
export function claimEventNote(claim: Pick<HolderClaim, "label" | "claimant" | "selfMatch">): string {
  const suffix = claim.selfMatch ? "" : " (name does not match theirs)";
  return `Holder "${claim.label}" claimed by ${claim.claimant.name}${suffix}`;
}

/** The note written when an admin reassigns a label to a different account. */
export function reassignEventNote(params: {
  label: string;
  to: ClaimPerson;
  by: string;
}): string {
  return `Holder "${params.label}" reassigned to ${params.to.name} by ${params.by}`;
}

/** The note written when an admin releases a label back to unclaimed. */
export function releaseEventNote(params: { label: string; by: string }): string {
  return `Holder "${params.label}" released back to unclaimed by ${params.by}`;
}

export function holderClaimMismatchSubject(claim: HolderClaim): string {
  return `Fleet: ${claim.claimant.name} claimed "${claim.label}"`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROW_LABEL_STYLE = "padding:6px 12px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;";
const ROW_VALUE_STYLE = "padding:6px 0;font-size:14px;color:#111827;font-weight:500;";

/**
 * The admin notification for a claim whose label did not look like the
 * claimant. It is a heads-up, not an alarm: the claim already succeeded, and
 * the mail exists so a wrong pick is noticed and corrected rather than
 * prevented (which would break onboarding for everyone else).
 *
 * `adminUrl` deep-links the Holder claims table so fixing it is one click.
 */
export function buildHolderClaimMismatchEmail(
  claim: HolderClaim,
  adminUrl: string,
): { subject: string; text: string; html: string } {
  const subject = holderClaimMismatchSubject(claim);
  const moved = describeClaimedMaterial(claim.material);

  const text = [
    `${describePerson(claim.claimant)} claimed the fleet holder name "${claim.label}".`,
    "",
    "That name does not look like theirs, so this is worth a glance.",
    "",
    `Moved to them: ${moved}.`,
    "",
    "Claiming is deliberately permissive — the material was imported from a",
    "spreadsheet that spelled people inconsistently, so a strict match would",
    "block the people this flow exists to onboard. Nothing is broken; if the",
    "claim is wrong you can reassign or release the name here:",
    adminUrl,
  ].join("\n");

  const rows: Array<[string, string]> = [
    ["Name claimed", claim.label],
    ["Claimed by", describePerson(claim.claimant)],
    ["Moved", moved],
  ];

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <tr>
              <td>
                <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">Fleet holder claim to check</h1>
                <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
                  ${escapeHtml(claim.claimant.name)} claimed a name that does not look like theirs.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:4px 0;">
                  ${rows
                    .map(
                      ([label, value]) =>
                        `<tr><td style="${ROW_LABEL_STYLE}">${escapeHtml(label)}</td><td style="${ROW_VALUE_STYLE}">${escapeHtml(value)}</td></tr>`,
                    )
                    .join("\n                  ")}
                </table>

                <p style="margin:20px 0 0;font-size:13px;color:#374151;line-height:1.6;">
                  Claiming a holder name is deliberately permissive: the fleet was imported from a
                  spreadsheet that spelled people inconsistently, so a strict name match would block
                  the people the flow exists to onboard. The claim has gone through. If it is wrong,
                  reassign the name to the right person or release it.
                </p>

                <p style="margin:24px 0 0;">
                  <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px;">Open Holder claims</a>
                </p>

                <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                  This notification goes to admins only.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
