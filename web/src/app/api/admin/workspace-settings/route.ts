import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readWorkspaceSettings,
  writeWorkspaceSettings,
} from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const settings = await readWorkspaceSettings(admin);
  return NextResponse.json({ settings });
}

const patchBodySchema = z.object({
  reminder_paused: z.boolean(),
});

export async function PATCH(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const parsed = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const settings = await writeWorkspaceSettings(
      admin,
      { reminder_paused: parsed.data.reminder_paused },
      guard.user.email,
    );
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update settings." },
      { status: 500 },
    );
  }
}
