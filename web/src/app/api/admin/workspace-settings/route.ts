import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readWorkspaceSettings,
  writeWorkspaceSettings,
} from "@/lib/workspace-settings";
import { MAIL_BRIEF_MODEL_IDS } from "@/lib/mail-brief-model";
import { recordAdminAudit } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const settings = await readWorkspaceSettings(admin);
  return NextResponse.json({ settings });
}

const patchBodySchema = z
  .object({
    reminder_paused: z.boolean().optional(),
    mail_brief_model: z
      .enum(MAIL_BRIEF_MODEL_IDS as unknown as [string, ...string[]])
      .nullable()
      .optional(),
    security_alerts_enabled: z.boolean().optional(),
    security_alert_threshold: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (body) =>
      body.reminder_paused !== undefined ||
      body.mail_brief_model !== undefined ||
      body.security_alerts_enabled !== undefined ||
      body.security_alert_threshold !== undefined,
    { message: "No settings to update." },
  );

export async function PATCH(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const parsed = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const settings = await writeWorkspaceSettings(admin, parsed.data, guard.user.email);

    // Record the intent in the admin audit trail (best-effort; never blocks).
    if (parsed.data.reminder_paused !== undefined) {
      await recordAdminAudit(admin, {
        actor_email: guard.user.email,
        action: parsed.data.reminder_paused ? "reminder_pause" : "reminder_resume",
      });
    }
    if (parsed.data.mail_brief_model !== undefined) {
      await recordAdminAudit(admin, {
        actor_email: guard.user.email,
        action: "mail_brief_model_change",
        detail: { model: parsed.data.mail_brief_model },
      });
    }
    if (
      parsed.data.security_alerts_enabled !== undefined ||
      parsed.data.security_alert_threshold !== undefined
    ) {
      await recordAdminAudit(admin, {
        actor_email: guard.user.email,
        action: "security_alerts_change",
        detail: {
          enabled: settings.security_alerts_enabled,
          threshold: settings.security_alert_threshold,
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update settings." },
      { status: 500 },
    );
  }
}
