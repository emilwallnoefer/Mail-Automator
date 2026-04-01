"use client";

import { useEffect, useRef, useState } from "react";
import { playUiSound } from "@/lib/ui-sounds";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

type ModuleKey = "mail" | "time" | "settings";

type AuthNavbarProps = {
  email: string;
  gmailConnected: boolean;
  gmailEmail?: string | null;
  activeModule: ModuleKey;
  availableModules?: ModuleKey[];
  showGmailStatus?: boolean;
  userRole?: UserRole | null;
  onSelectModule: (module: ModuleKey) => void;
};

export function AuthNavbar({
  email,
  gmailConnected,
  gmailEmail,
  activeModule,
  availableModules = ["mail", "time", "settings"],
  showGmailStatus = true,
  userRole = null,
  onSelectModule,
}: AuthNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const initials = email.slice(0, 2).toUpperCase();
  const statusLabel = gmailConnected ? "Gmail connected" : "Gmail disconnected";

  return (
    <nav className="glass-card sticky top-3 z-[90] !overflow-visible p-2.5 md:p-3">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-indigo-400 text-[10px] font-semibold text-slate-950">
            FA
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-200/70">Flyability Internal</p>
            <p className="truncate text-xs font-medium md:text-sm">Flya Allrounder</p>
          </div>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs transition hover:bg-white/12"
            aria-label="Toggle navigation menu"
          >
            <span className="hidden text-slate-200/90 sm:inline">Menu</span>
            <span className="text-base leading-none">☰</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-[100] mt-2 w-[min(92vw,17.5rem)] rounded-xl border border-white/15 bg-slate-950/92 p-2.5 shadow-xl backdrop-blur-xl">
              <p className="mb-1 px-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Workspace</p>
              <div className="space-y-1" role="tablist" aria-label="Workspace tabs">
                {availableModules.includes("mail") ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModule !== "mail") playUiSound("switchWhoosh");
                      onSelectModule("mail");
                      setMenuOpen(false);
                    }}
                    role="tab"
                    aria-selected={activeModule === "mail"}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs font-medium text-slate-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 ${
                      activeModule === "mail" ? "border-cyan-300/55 bg-white/12" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span>Mail Automator</span>
                    {activeModule === "mail" ? <span className="text-[10px] opacity-80">Active</span> : null}
                  </button>
                ) : null}
                {availableModules.includes("time") ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModule !== "time") playUiSound("switchWhoosh");
                      onSelectModule("time");
                      setMenuOpen(false);
                    }}
                    role="tab"
                    aria-selected={activeModule === "time"}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs font-medium text-slate-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 ${
                      activeModule === "time" ? "border-cyan-300/55 bg-white/12" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span>Time Tracker</span>
                    {activeModule === "time" ? <span className="text-[10px] opacity-80">Active</span> : null}
                  </button>
                ) : null}
                {availableModules.includes("settings") ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModule !== "settings") playUiSound("switchWhoosh");
                      onSelectModule("settings");
                      setMenuOpen(false);
                    }}
                    role="tab"
                    aria-selected={activeModule === "settings"}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs font-medium text-slate-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 ${
                      activeModule === "settings" ? "border-cyan-300/55 bg-white/12" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span>Settings</span>
                    {activeModule === "settings" ? <span className="text-[10px] opacity-80">Active</span> : null}
                  </button>
                ) : null}
              </div>

              {showGmailStatus ? (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${gmailConnected ? "bg-emerald-300" : "bg-rose-300"}`}
                      aria-hidden="true"
                    />
                    <p className="text-xs text-slate-100/90">{statusLabel}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-indigo-400 text-[10px] font-semibold text-slate-950">
                      {initials}
                    </span>
                    <p className="truncate text-xs text-slate-200/85">{gmailEmail ?? email}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-indigo-400 text-[10px] font-semibold text-slate-950">
                      {initials}
                    </span>
                    <p className="truncate text-xs text-slate-200/85">{email}</p>
                  </div>
                </div>
              )}

              <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300/75">Logged in as</p>
                <p className="mt-1 text-xs font-medium text-slate-100">
                  {userRoleLabel(userRole ?? null)}
                </p>
              </div>

              <div className="mt-2 grid gap-1.5">
                <form action="/logout" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-white/15 bg-white/8 px-2.5 py-2 text-left text-xs transition hover:bg-white/12"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
