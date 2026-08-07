/**
 * Certificate requests — the structured form a team member fills in from the
 * Team Chat composer ("Certificate" mode) to ask the admins to issue training
 * certificates.
 *
 * This module is deliberately isomorphic and dependency-free: the modal
 * (client) needs the option lists and the live preview, the API route (server)
 * needs the same formatter so the chat message, the admin email and the
 * preview can never drift apart. Nothing here touches env, Supabase, or the
 * DOM — see `app/api/chat/certificate-request/route.ts` for the server side.
 */

export const TRAINING_PROGRAMMES = [
  { id: "intro", label: "Intro" },
  { id: "aiim", label: "AIIM" },
] as const;
export type TrainingProgramme = (typeof TRAINING_PROGRAMMES)[number]["id"];

export const TRAINING_LOCATIONS = [
  { id: "flya_hq", label: "Flya HQ" },
  { id: "customer_account", label: "Customer account" },
] as const;
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number]["id"];

/** Upper bounds mirrored by the zod schema on the route. Generous enough for a
 *  real training class, tight enough that a single request can't be used to
 *  blast an unbounded payload into the chat table or the admin mailbox. */
export const MAX_PARTICIPANTS = 30;
export const MAX_FIELD_LEN = 120;

export type CertificateParticipant = {
  name: string;
  email: string;
};

/** What the modal collects. The trainer is NOT part of this — it is derived
 *  server-side from the authenticated sender so it cannot be spoofed. */
export type CertificateRequestInput = {
  customerAccount: string;
  participants: CertificateParticipant[];
  /** ISO calendar date, `YYYY-MM-DD`. */
  trainingDate: string;
  programme: TrainingProgramme;
  location: TrainingLocation;
};

export type CertificateRequestDetails = CertificateRequestInput & {
  trainer: CertificateParticipant;
};

export function programmeLabel(id: TrainingProgramme): string {
  return TRAINING_PROGRAMMES.find((p) => p.id === id)?.label ?? id;
}

export function locationLabel(id: TrainingLocation): string {
  return TRAINING_LOCATIONS.find((l) => l.id === id)?.label ?? id;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `2026-08-12` -> `12 Aug 2026`. Formatted by hand rather than via
 * `toLocaleDateString` so the string is identical in the browser, in the
 * lambda, and in the email — no locale or timezone shifting a training date to
 * the previous day.
 */
export function formatTrainingDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return iso;
  return `${Number(day)} ${monthName} ${year}`;
}

function person(p: CertificateParticipant): string {
  return p.email ? `${p.name} <${p.email}>` : p.name;
}

/**
 * The compact, copy-ready summary. This exact string is stored as the chat
 * message body and repeated verbatim in the admin email's copy block, so an
 * admin can paste it straight into the certificate tooling.
 */
export function formatCertificateSummary(details: CertificateRequestDetails): string {
  const lines = [
    `Certificate request — ${details.customerAccount}`,
    "",
    `Programme:    ${programmeLabel(details.programme)}`,
    `Training date: ${formatTrainingDate(details.trainingDate)}`,
    `Location:     ${locationLabel(details.location)}`,
    `Trainer:      ${person(details.trainer)}`,
    "",
    `Participants (${details.participants.length}):`,
    ...details.participants.map((p, i) => `  ${i + 1}. ${person(p)}`),
  ];
  return lines.join("\n");
}

export function certificateEmailSubject(details: CertificateRequestDetails): string {
  return `Certificate request — ${details.customerAccount} (${programmeLabel(
    details.programme,
  )}, ${formatTrainingDate(details.trainingDate)})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ROW_LABEL_STYLE =
  "padding:6px 12px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;";
const ROW_VALUE_STYLE = "padding:6px 0;font-size:14px;color:#111827;font-weight:500;";

/**
 * The admin notification email. Renders the request as a readable card, then
 * repeats `formatCertificateSummary` verbatim in a monospace block so the
 * whole thing can be selected and copied in one go.
 */
export function buildCertificateEmail(details: CertificateRequestDetails): {
  subject: string;
  text: string;
  html: string;
} {
  const summary = formatCertificateSummary(details);
  const subject = certificateEmailSubject(details);

  const text = [
    `${details.trainer.name} submitted a certificate request from Team Chat.`,
    "",
    summary,
  ].join("\n");

  const rows: Array<[string, string]> = [
    ["Customer", details.customerAccount],
    ["Programme", programmeLabel(details.programme)],
    ["Training date", formatTrainingDate(details.trainingDate)],
    ["Location", locationLabel(details.location)],
    ["Trainer", person(details.trainer)],
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
                <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">Certificate request</h1>
                <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
                  Submitted by ${escapeHtml(person(details.trainer))} from Team Chat.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:4px 0;">
                  ${rows
                    .map(
                      ([label, value]) =>
                        `<tr><td style="${ROW_LABEL_STYLE}">${escapeHtml(label)}</td><td style="${ROW_VALUE_STYLE}">${escapeHtml(value)}</td></tr>`,
                    )
                    .join("\n                  ")}
                </table>

                <h2 style="margin:24px 0 8px;font-size:14px;font-weight:600;">
                  Participants (${details.participants.length})
                </h2>
                <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#111827;">
                  ${details.participants
                    .map((p) => `<li>${escapeHtml(person(p))}</li>`)
                    .join("\n                  ")}
                </ol>

                <h2 style="margin:24px 0 8px;font-size:14px;font-weight:600;">Copy-ready summary</h2>
                <pre style="margin:0;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;color:#111827;white-space:pre-wrap;word-break:break-word;">${escapeHtml(summary)}</pre>

                <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                  This notification goes to admins only. The request is also visible in Team Chat under the “Certificate” filter.
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
