import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { OnboardingWorkspace } from "@/components/onboarding-workspace";
import { buildOnboardingSections } from "@/lib/onboarding";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sections = buildOnboardingSections();

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-surface text-ink">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell relative z-[1]">
        <div className="glass-card sticky top-3 z-[90] !overflow-visible p-2.5 md:p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-accent-soft/70">Pilot Resources</p>
              <h1 className="text-sm font-semibold md:text-base">Onboarding</h1>
            </div>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-glass/15 bg-glass/8 px-3 py-1.5 text-xs transition hover:bg-glass/12"
            >
              Back to workspace
            </a>
          </div>
        </div>
        <OnboardingWorkspace email={user.email ?? "pilot"} sections={sections} />
      </section>
    </main>
  );
}
