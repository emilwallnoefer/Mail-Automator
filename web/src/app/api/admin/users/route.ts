import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUserRole, type UserRole } from "@/lib/user-role";
import { recordAdminAudit } from "@/lib/admin-audit";

type ListedUser = {
  id: string;
  email: string;
  role: UserRole | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

function extractRoleFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeUserRole(record.role);
}

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const users: ListedUser[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const pageUsers = data?.users ?? [];
    for (const user of pageUsers) {
      users.push({
        id: user.id,
        email: user.email ?? "",
        role: extractRoleFromMetadata(user.app_metadata),
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }
    if (pageUsers.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  users.sort((a, b) => a.email.localeCompare(b.email));
  return NextResponse.json({ users });
}

const patchBodySchema = z.object({
  user_id: z.string().uuid(),
  role: z.union([
    z.literal("sales"),
    z.literal("eu_pilot"),
    z.literal("us_pilot"),
    z.literal("hr"),
    z.null(),
  ]),
});

export async function PATCH(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const parsed = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const { user_id, role } = parsed.data;

  const admin = createAdminClient();
  const current = await admin.auth.admin.getUserById(user_id);
  if (current.error || !current.data?.user) {
    return NextResponse.json({ error: current.error?.message ?? "User not found" }, { status: 404 });
  }
  // Role lives in app_metadata, which is writable only via the service-role key
  // (users cannot rewrite it themselves via updateUser). See SECURITY.md T0.1.
  const existingAppMetadata =
    current.data.user.app_metadata && typeof current.data.user.app_metadata === "object"
      ? (current.data.user.app_metadata as Record<string, unknown>)
      : {};
  const previousRole = normalizeUserRole(existingAppMetadata.role);

  const nextAppMetadata = { ...existingAppMetadata, role };

  const updateRes = await admin.auth.admin.updateUserById(user_id, {
    app_metadata: nextAppMetadata,
  });
  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
  }

  // Record the role change in the admin audit trail (best-effort; never blocks).
  if (previousRole !== role) {
    await recordAdminAudit(admin, {
      actor_email: guard.user.email,
      action: "role_change",
      target: current.data.user.email ?? user_id,
      detail: { from: previousRole, to: role },
    });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updateRes.data.user?.id ?? user_id,
      email: updateRes.data.user?.email ?? "",
      role,
    },
  });
}
