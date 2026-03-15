"use client";

import { useEffect, useRef, useState } from "react";

type ModuleKey = "mail" | "time";

type AuthNavbarProps = {
  email: string;
  gmailConnected: boolean;
  gmailEmail?: string | null;
  onDisconnectGmail: () => Promise<void> | void;
  activeModule: ModuleKey;
  onSelectModule: (module: ModuleKey) => void;
};

export function AuthNavbar({
  email,
  gmailConnected,
  gmailEmail,
  onDisconnectGmail,
  activeModule,
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
    <nav className="glass-card sticky top-3 z-30 p-2.5 md:p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-indigo-400 text-[10px] font-semibold text-slate-950">
            FA
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-200/70">Flyability Internal</p>
            <p className="text-xs font-medium md:text-sm">Flya allrounderm</p>
          </div>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs transition hover:bg-white/12"
            aria-label="Toggle navigation menu"
          >
            <span className="hidden text-slate-200/90 sm:inline">Menu</span>
            <span className="text-base leading-none">☰</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-[17.5rem] rounded-xl border border-white/15 bg-slate-950/92 p-2.5 shadow-xl backdrop-blur-xl">
              <p className="mb-1 px-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Workspace</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectModule("mail");
                    setMenuOpen(false);
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs transition ${
                    activeModule === "mail" ? "bg-cyan-400/90 font-medium text-slate-900" : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Mail automator
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectModule("time");
                    setMenuOpen(false);
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs transition ${
                    activeModule === "time" ? "bg-cyan-400/90 font-medium text-slate-900" : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  Time tracker
                </button>
              </div>

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

              <div className="mt-2 grid gap-1.5">
                {gmailConnected ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onDisconnectGmail();
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-lg border border-white/15 bg-white/8 px-2.5 py-2 text-left text-xs transition hover:bg-white/12"
                  >
                    Disconnect Gmail
                  </button>
                ) : (
                  <a
                    href="/api/gmail/connect"
                    className="w-full rounded-lg bg-cyan-400/90 px-2.5 py-2 text-left text-xs font-medium text-slate-900 transition hover:bg-cyan-300"
                  >
                    Connect Gmail
                  </a>
                )}

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
