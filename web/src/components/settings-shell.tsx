"use client";
import { SettingsPanel } from "@/components/settings-panel";
import type { UserRole } from "@/lib/user-role";

type SettingsShellProps = {
  email: string;
  userRole: UserRole | null;
};

export function SettingsShell({ email, userRole }: SettingsShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell max-w-5xl">
        <SettingsPanel email={email} showStandaloneActions userRole={userRole ?? "eu_pilot"} />
      </section>
    </main>
  );
}
