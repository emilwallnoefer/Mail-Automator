import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const metadata = user.user_metadata ?? {};
  return NextResponse.json({
    connected: Boolean(metadata.gmail_refresh_token),
    gmail_email: metadata.gmail_email ?? null,
  });
}
