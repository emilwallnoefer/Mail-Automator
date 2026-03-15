import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");
  redirect("/login");
}
