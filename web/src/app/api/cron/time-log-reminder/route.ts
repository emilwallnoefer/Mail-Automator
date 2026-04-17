import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardAdmin } from "@/lib/admin-guard";
import {
  addDays,
  getWeekStartDate,
  sumNetMinsForUserInRange,
  toDateString,
} from "@/lib/time-tracker-queries";
import { normalizeUserRole, type UserRole } from "@/lib/user-role";
import {
  isResendConfigured,
  sendEmailViaResend,
  type SendEmailResult,
} from "@/lib/email/resend";
import { readWorkspaceSettings } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE = "Europe/Zurich";
const REMINDER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  "sales",
  "eu_pilot",
  "us_pilot",
]);

type SkipReason =
  | "not_monday"
  | "not_9am"
  | "resend_not_configured"
  | "paused"
  | null;

type Candidate = {
  user_id: string;
  email: string;
  display_name: string;
  role: UserRole;
};

type SendOutcome = {
  email: string;
  status: "sent" | "failed" | "skipped_dry_run";
  message_id?: string;
  error?: string;
};

function extractRole(metadata: unknown): UserRole | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeUserRole(record.role);
}

function extractDisplayName(user: {
  email: string;
  user_metadata?: unknown;
}): string {
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object" && !Array.isArray(user.user_metadata)
      ? (user.user_metadata as Record<string, unknown>)
      : null;
  const candidates = [
    metadata?.full_name,
    metadata?.name,
    metadata?.display_name,
    metadata?.first_name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  const local = user.email.split("@")[0] ?? "";
  if (!local) return "there";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || local;
}

function getZurichParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: map.weekday ?? "",
    hour: Number.parseInt(map.hour ?? "0", 10),
    minute: Number.parseInt(map.minute ?? "0", 10),
  };
}

function formatDateLabel(date: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: TIMEZONE,
    }).format(new Date(`${date}T00:00:00`));
  } catch {
    return date;
  }
}

function appBaseUrl(request: Request): string {
  const fromEnv = process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const origin = new URL(request.url).origin;
  return origin.replace(/\/+$/, "");
}

function buildEmail(params: {
  name: string;
  weekStart: string;
  weekEnd: string;
  dashboardUrl: string;
}) {
  const { name, weekStart, weekEnd, dashboardUrl } = params;
  const weekLabel = `${formatDateLabel(weekStart)} – ${formatDateLabel(weekEnd)}`;

  const subject = `Reminder: log your hours for last week (${weekLabel})`;

  const text = [
    `Hi ${name},`,
    "",
    `It looks like no hours were logged in the Time Tracker for last week (${weekLabel}).`,
    "Could you take a minute to fill in your days? If last week was a holiday or leave, you can mark it as such directly in the tracker.",
    "",
    `Open the tracker: ${dashboardUrl}`,
    "",
    "Thanks!",
    "— Time Tracker",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">Log your hours for last week</h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">
                  It looks like no hours were logged in the Time Tracker for last week
                  (<strong style="white-space:nowrap;">${escapeHtml(weekLabel)}</strong>).
                </p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">
                  Could you take a minute to fill in your days? If last week was a holiday or leave, you can mark it as such directly in the tracker.
                </p>
                <p style="margin:24px 0;">
                  <a href="${escapeHtml(dashboardUrl)}"
                     style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500;">
                    Open the Time Tracker
                  </a>
                </p>
                <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                  This is an automated reminder sent on Monday mornings when no time was logged in the previous week.
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type SendLogRow = {
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: string | null;
  week_start: string;
  week_end: string;
  status: "sent" | "failed" | "skipped_dry_run";
  message_id: string | null;
  error: string | null;
  mode: "cron" | "admin";
  forced: boolean;
  dry_run: boolean;
};

async function recordSend(admin: SupabaseClient, row: SendLogRow): Promise<void> {
  // Never let a logging failure break the send flow — we already performed
  // (or skipped) the Resend call at this point.
  try {
    const { error } = await admin.from("time_log_reminder_sends").insert(row);
    if (error) {
      console.error("time_log_reminder_sends insert failed", error);
    }
  } catch (err) {
    console.error("time_log_reminder_sends insert threw", err);
  }
}

function resolvePreviewWeek(url: URL, request: Request) {
  const thisWeekStart = getWeekStartDate();
  if (!thisWeekStart) return null;
  const prevWeekStart = addDays(thisWeekStart, -7);
  const prevWeekEnd = addDays(prevWeekStart, 6);
  const nameOverride = url.searchParams.get("name")?.trim();
  return {
    name: nameOverride && nameOverride.length > 0 ? nameOverride : "Emil",
    weekStart: toDateString(prevWeekStart),
    weekEnd: toDateString(prevWeekEnd),
    dashboardUrl: `${appBaseUrl(request)}/dashboard`,
  };
}

function buildPreviewResponse(request: Request, format: "html" | "text", url: URL) {
  const preview = resolvePreviewWeek(url, request);
  if (!preview) {
    return NextResponse.json({ error: "Could not compute week boundary" }, { status: 500 });
  }
  const email = buildEmail(preview);
  if (format === "text") {
    return new NextResponse(email.text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(email.html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function sendTestResponse(request: Request, to: string, url: URL) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: `Invalid 'send_test' email: ${to}` },
      { status: 400 },
    );
  }

  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "Resend is not configured (missing RESEND_API_KEY or RESEND_FROM)." },
      { status: 503 },
    );
  }

  const preview = resolvePreviewWeek(url, request);
  if (!preview) {
    return NextResponse.json({ error: "Could not compute week boundary" }, { status: 500 });
  }

  const email = buildEmail(preview);

  const result = await sendEmailViaResend({
    to,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: email.text,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    to,
    message_id: result.id,
    preview_name: preview.name,
    previous_week: { start: preview.weekStart, end: preview.weekEnd },
  });
}

async function authorize(request: Request): Promise<
  { ok: true; mode: "cron" | "admin" } | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, mode: "cron" };
  }

  const guard = await guardAdmin();
  if (guard.ok) return { ok: true, mode: "admin" };

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const isDryRun = url.searchParams.get("dry") === "1";
  const isForced = url.searchParams.get("force") === "1";
  const preview = url.searchParams.get("preview");
  const sendTestTo = url.searchParams.get("send_test")?.trim() ?? "";

  if (preview === "html" || preview === "text") {
    return buildPreviewResponse(request, preview, url);
  }

  if (sendTestTo) {
    return sendTestResponse(request, sendTestTo, url);
  }

  const now = new Date();
  const zurich = getZurichParts(now);

  let skipReason: SkipReason = null;
  if (!isForced) {
    if (zurich.weekday !== "Mon") skipReason = "not_monday";
    else if (zurich.hour !== 9) skipReason = "not_9am";
  }

  if (skipReason) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: skipReason,
      zurich_time: `${zurich.weekday} ${String(zurich.hour).padStart(2, "0")}:${String(zurich.minute).padStart(2, "0")}`,
    });
  }

  if (!isDryRun && !isResendConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason: "resend_not_configured" satisfies SkipReason,
      },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const settings = await readWorkspaceSettings(admin);
  // Pause is a hard kill-switch for real sends — force=1 does NOT override it,
  // admins must flip the toggle back off in Workspace Insights first. Dry runs
  // still go through so admins can preview the candidate list while paused.
  if (settings.reminder_paused && !isDryRun) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "paused" satisfies SkipReason,
      paused_at: settings.reminder_paused_at,
      paused_by: settings.reminder_paused_by,
    });
  }

  const thisWeekStart = getWeekStartDate();
  if (!thisWeekStart) {
    return NextResponse.json({ error: "Could not compute week boundary" }, { status: 500 });
  }
  const prevWeekStart = addDays(thisWeekStart, -7);
  const prevWeekEnd = addDays(prevWeekStart, 6);
  const prevWeekStartStr = toDateString(prevWeekStart);
  const prevWeekEndStr = toDateString(prevWeekEnd);

  const candidates: Candidate[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const pageUsers = data?.users ?? [];
    for (const user of pageUsers) {
      const role = extractRole(user.user_metadata);
      if (!role || !REMINDER_ROLES.has(role)) continue;
      if (!user.email) continue;
      candidates.push({
        user_id: user.id,
        email: user.email,
        role,
        display_name: extractDisplayName({
          email: user.email,
          user_metadata: user.user_metadata,
        }),
      });
    }
    if (pageUsers.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  const toRemind: Candidate[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const total = await sumNetMinsForUserInRange(
          admin,
          candidate.user_id,
          prevWeekStart,
          prevWeekEnd,
        );
        if (total === 0) toRemind.push(candidate);
      } catch (error) {
        errors.push({ email: candidate.email, error: (error as Error).message });
      }
    }),
  );

  const dashboardUrl = `${appBaseUrl(request)}/dashboard`;
  const outcomes: SendOutcome[] = [];
  for (const candidate of toRemind) {
    const email = buildEmail({
      name: candidate.display_name,
      weekStart: prevWeekStartStr,
      weekEnd: prevWeekEndStr,
      dashboardUrl,
    });

    const baseLogRow = {
      user_id: candidate.user_id,
      email: candidate.email,
      display_name: candidate.display_name,
      role: candidate.role,
      week_start: prevWeekStartStr,
      week_end: prevWeekEndStr,
      mode: auth.mode,
      forced: isForced,
      dry_run: isDryRun,
    } as const;

    if (isDryRun) {
      outcomes.push({ email: candidate.email, status: "skipped_dry_run" });
      await recordSend(admin, {
        ...baseLogRow,
        status: "skipped_dry_run",
        message_id: null,
        error: null,
      });
      continue;
    }

    const result: SendEmailResult = await sendEmailViaResend({
      to: candidate.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (result.ok) {
      outcomes.push({
        email: candidate.email,
        status: "sent",
        message_id: result.id,
      });
      await recordSend(admin, {
        ...baseLogRow,
        status: "sent",
        message_id: result.id || null,
        error: null,
      });
    } else {
      outcomes.push({
        email: candidate.email,
        status: "failed",
        error: result.error,
      });
      await recordSend(admin, {
        ...baseLogRow,
        status: "failed",
        message_id: null,
        error: result.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: auth.mode,
    dry_run: isDryRun,
    forced: isForced,
    zurich_time: `${zurich.weekday} ${String(zurich.hour).padStart(2, "0")}:${String(zurich.minute).padStart(2, "0")}`,
    previous_week: { start: prevWeekStartStr, end: prevWeekEndStr },
    considered: candidates.length,
    reminded: toRemind.length,
    scan_errors: errors,
    outcomes,
  });
}
