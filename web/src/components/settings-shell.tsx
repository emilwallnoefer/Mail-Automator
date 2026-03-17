"use client";
import { SettingsPanel } from "@/components/settings-panel";

type SettingsShellProps = {
  email: string;
};

export function SettingsShell({ email }: SettingsShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell max-w-5xl">
        <SettingsPanel email={email} showStandaloneActions />
      </section>
    </main>
  );
}
