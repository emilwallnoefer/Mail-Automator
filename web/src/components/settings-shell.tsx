"use client";

import { useEffect, useRef, useState } from "react";

type SettingsShellProps = {
  email: string;
};

export function SettingsShell({ email }: SettingsShellProps) {
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; gmail_email?: string | null }>({
    connected: false,
  });
  const [showSetup, setShowSetup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/gmail/status");
      if (!response.ok) return;
      const data = (await response.json()) as { connected: boolean; gmail_email?: string | null };
      setGmailStatus(data);
    })();
  }, []);

  async function handleDisconnectGmail() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/gmail/disconnect", { method: "POST" });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setError(data.error || "Could not disconnect Gmail.");
      return;
    }
    setGmailStatus({ connected: false });
    setMessage("Gmail disconnected.");
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const response = await fetch("/api/time-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_json", data: parsed }),
      });
      const payload = (await response.json()) as { imported_day_logs?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Import failed");
      const imported = payload.imported_day_logs ?? 0;
      setMessage(`Imported ${String(imported)} days.`);
      window.dispatchEvent(new CustomEvent("time-tracker-imported", { detail: { imported_day_logs: imported } }));
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      window.dispatchEvent(new CustomEvent("time-tracker-imported", { detail: { error: msg } }));
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-5 py-8 md:px-8">
        <header className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Flyability Internal</p>
            <h1 className="text-lg font-semibold md:text-xl">Settings</h1>
            <p className="text-xs text-slate-300/85">{email}</p>
          </div>
          <a
            href="/dashboard"
            className="rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-xs transition hover:bg-white/12"
          >
            Back to dashboard
          </a>
        </header>

        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Gmail</h2>
          <p className="mt-2 text-sm text-slate-200/90">
            Status: {gmailStatus.connected ? "Connected" : "Disconnected"}
            {gmailStatus.gmail_email ? ` (${gmailStatus.gmail_email})` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            {gmailStatus.connected ? (
              <button
                type="button"
                onClick={handleDisconnectGmail}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15"
              >
                Disconnect Gmail
              </button>
            ) : (
              <a
                href="/api/gmail/connect"
                className="rounded-lg bg-cyan-400/90 px-3 py-2 text-xs font-medium text-slate-900 transition hover:bg-cyan-300"
              >
                Connect Gmail
              </a>
            )}
          </div>
        </section>

        <section className="glass-card p-5">
          <button
            type="button"
            onClick={() => setShowSetup((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Gmail setup README</span>
            <span>{showSetup ? "Hide" : "Show"}</span>
          </button>

          {showSetup && (
            <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <p className="font-medium text-cyan-200">How to connect Mail Automator to Gmail</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>Sign in to this app and open the dashboard.</li>
                <li>Click <strong>Connect Gmail</strong>.</li>
                <li>In Google popup, choose your Gmail account.</li>
                <li>Allow draft access permission.</li>
                <li>Confirm status shows <strong>Gmail connected</strong>.</li>
                <li>Generate mail and click <strong>Create Gmail draft</strong>.</li>
              </ol>
            </div>
          )}
        </section>

        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">
            Historical Time Data
          </h2>
          <p className="mt-2 text-xs text-slate-300/90">
            One-time import: upload your previous <code>hourlogger-data.json</code> file to migrate old tracking
            history into this account.
          </p>
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
          >
            {importing ? "Importing..." : "Upload old time tracking data"}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
              event.currentTarget.value = "";
            }}
          />
        </section>

        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </section>
    </main>
  );
}
