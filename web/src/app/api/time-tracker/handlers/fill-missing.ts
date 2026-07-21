import { NextResponse } from "next/server";
import { sanitizeMins } from "@/lib/time-tracker-queries";
import { isDateKey, TARGET_MINS, type PostActionContext } from "./shared";
import type { PostPayload } from "./schemas";

type FillMissingPayload = Extract<PostPayload, { action: "fill_missing" }>;

export async function handleFillMissing(
  ctx: PostActionContext,
  payload: FillMissingPayload,
): Promise<NextResponse> {
  const { supabase, userId, requireSnapshot } = ctx;
  const date = payload.work_date;
  if (!date || !isDateKey(date)) return NextResponse.json({ error: "Invalid work_date" }, { status: 400 });

  const snapshotErr = await requireSnapshot(`before_fill_missing_${date}`);
  if (snapshotErr) return snapshotErr;

  const dayRes = await supabase
    .from("time_day_logs")
    .select("net_mins")
    .eq("user_id", userId)
    .eq("work_date", date)
    .maybeSingle();
  if (dayRes.error) return NextResponse.json({ error: dayRes.error.message }, { status: 500 });

  const worked = sanitizeMins(dayRes.data?.net_mins);
  const need = Math.max(0, TARGET_MINS - worked);

  const currentCompRes = await supabase
    .from("time_comp_adjustments")
    .select("mins")
    .eq("user_id", userId)
    .eq("work_date", date)
    .maybeSingle();
  if (currentCompRes.error) return NextResponse.json({ error: currentCompRes.error.message }, { status: 500 });

  const current = sanitizeMins(currentCompRes.data?.mins);
  const next = current === need ? 0 : need;

  if (next > 0) {
    const upsertCompRes = await supabase
      .from("time_comp_adjustments")
      .upsert(
        {
          user_id: userId,
          work_date: date,
          mins: next,
          note: "auto-fill",
          source: "ui",
        },
        { onConflict: "user_id,work_date" },
      );
    if (upsertCompRes.error) return NextResponse.json({ error: upsertCompRes.error.message }, { status: 500 });
  } else {
    const deleteCompRes = await supabase
      .from("time_comp_adjustments")
      .delete()
      .eq("user_id", userId)
      .eq("work_date", date);
    if (deleteCompRes.error) return NextResponse.json({ error: deleteCompRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, comp_mins: next });
}
