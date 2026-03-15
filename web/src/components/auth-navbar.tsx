"use client";

import { useEffect, useRef, useState } from "react";

type AuthNavbarProps = {
  email: string;
  gmailConnected: boolean;
  gmailEmail?: string | null;
  onDisconnectGmail: () => Promise<void> | void;
};

export function AuthNavbar({ email, gmailConnected, gmailEmail, onDisconnectGmail }: AuthNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <nav className="glass-card sticky top-4 z-30 p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-indigo-400 text-sm font-bold text-slate-950">
            MA
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/80">Flyability Internal</p>
            <p className="text-sm font-semibold md:text-base">Flya allrounderm</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm md:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>

        <div className="hidden items-center gap-3 md:flex">
          <span
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              gmailConnected
                ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                : "border-rose-300/40 bg-rose-500/15 text-rose-100"
            }`}
          >
            {statusLabel}
          </span>
          {gmailConnected ? (
            <button
              type="button"
              onClick={onDisconnectGmail}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15"
            >
              Disconnect Gmail
            </button>
          ) : (
            <a
              href="/api/gmail/connect"
              className="rounded-lg bg-cyan-400/90 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
            >
              Connect Gmail
            </a>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 transition hover:bg-white/15"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-indigo-400 text-xs font-semibold text-slate-950">
                {initials}
              </span>
              <span className="max-w-40 truncate text-xs text-slate-100/90">{email}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/20 bg-slate-950/90 p-2 shadow-xl backdrop-blur-xl">
                <p className="px-2 py-1 text-xs text-slate-300">{email}</p>
                {gmailEmail ? <p className="px-2 pb-2 text-[11px] text-slate-400">{gmailEmail}</p> : null}
                <form action="/logout" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-sm transition hover:bg-white/15"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 md:hidden">
          <p
            className={`rounded-lg border px-3 py-2 text-xs ${
              gmailConnected
                ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                : "border-rose-300/40 bg-rose-500/15 text-rose-100"
            }`}
          >
            {statusLabel}
          </p>
          {gmailConnected ? (
            <button
              type="button"
              onClick={onDisconnectGmail}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-sm"
            >
              Disconnect Gmail
            </button>
          ) : (
            <a
              href="/api/gmail/connect"
              className="block w-full rounded-lg bg-cyan-400/90 px-3 py-2 text-left text-sm font-semibold text-slate-900"
            >
              Connect Gmail
            </a>
          )}
          <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-200/90">{email}</div>
          <form action="/logout" method="post">
            <button type="submit" className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-sm">
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
