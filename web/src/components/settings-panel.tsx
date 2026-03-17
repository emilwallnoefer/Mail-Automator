"use client";

import { useEffect, useRef, useState } from "react";

type SettingsPanelProps = {
  email: string;
  showStandaloneActions?: boolean;
};

export function SettingsPanel({ email, showStandaloneActions = false }: SettingsPanelProps) {
  const [openSetting, setOpenSetting] = useState<"gmail" | "mapping" | "import" | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; gmail_email?: string | null }>({
    connected: false,
  });
  const [travelMapping, setTravelMapping] = useState({
    clientColumn: "",
    locationColumn: "",
    responsibleColumn: "",
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [openReadme, setOpenReadme] = useState<"program" | "gmail" | "mapping" | "import" | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const [gmailResponse, mappingResponse] = await Promise.all([
        fetch("/api/gmail/status"),
        fetch("/api/settings/travel-mapping"),
      ]);
      if (gmailResponse.ok) {
        const data = (await gmailResponse.json()) as { connected: boolean; gmail_email?: string | null };
        setGmailStatus(data);
      }
      if (mappingResponse.ok) {
        const mapping = (await mappingResponse.json()) as {
          clientColumn?: string;
          locationColumn?: string;
          responsibleColumn?: string;
        };
        setTravelMapping({
          clientColumn: String(mapping.clientColumn ?? ""),
          locationColumn: String(mapping.locationColumn ?? ""),
          responsibleColumn: String(mapping.responsibleColumn ?? ""),
        });
      }
    })();
  }, []);

  function normalizeColumnInput(value: string) {
    return value.toUpperCase().replace(/[^A-Z]/g, "");
  }

  async function handleSaveTravelMapping() {
    setMappingSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/travel-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(travelMapping),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save mapping.");
      setMessage("Travel column mapping saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMappingSaving(false);
    }
  }

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

  function toggleReadme(key: "program" | "gmail" | "mapping" | "import") {
    setOpenReadme((prev) => (prev === key ? null : key));
  }

  return (
    <section className="space-y-4">
      <header className="glass-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Flyability Internal</p>
          <h1 className="text-lg font-semibold md:text-xl">Settings</h1>
          <p className="text-xs text-slate-300/85">{email}</p>
        </div>
        {showStandaloneActions ? (
          <a
            href="/dashboard"
            className="rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-xs transition hover:bg-white/12"
          >
            Back to dashboard
          </a>
        ) : null}
      </header>

      <section className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Overview</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300/80">Gmail</p>
            <p className="mt-1 text-sm">{gmailStatus.connected ? "Connected" : "Disconnected"}</p>
            <p className="mt-1 truncate text-xs text-slate-300/80">{gmailStatus.gmail_email ?? "No account connected"}</p>
            <button
              type="button"
              onClick={() => setOpenSetting((prev) => (prev === "gmail" ? null : "gmail"))}
              className="mt-3 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] transition hover:bg-white/15"
            >
              {openSetting === "gmail" ? "Hide Gmail settings" : "Open Gmail settings"}
            </button>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300/80">Travel Mapping</p>
            <p className="mt-1 text-sm">
              {travelMapping.clientColumn && travelMapping.locationColumn && travelMapping.responsibleColumn
                ? "Configured"
                : "Using defaults"}
            </p>
            <p className="mt-1 text-xs text-slate-300/80">
              Client {travelMapping.clientColumn || "-"} · Location {travelMapping.locationColumn || "-"} · Responsible{" "}
              {travelMapping.responsibleColumn || "-"}
            </p>
            <button
              type="button"
              onClick={() => setOpenSetting((prev) => (prev === "mapping" ? null : "mapping"))}
              className="mt-3 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] transition hover:bg-white/15"
            >
              {openSetting === "mapping" ? "Hide mapping settings" : "Open mapping settings"}
            </button>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300/80">Time Import</p>
            <p className="mt-1 text-sm">One-time migration</p>
            <p className="mt-1 text-xs text-slate-300/80">Upload your legacy `hourlogger-data.json` when needed.</p>
            <button
              type="button"
              onClick={() => setOpenSetting((prev) => (prev === "import" ? null : "import"))}
              className="mt-3 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] transition hover:bg-white/15"
            >
              {openSetting === "import" ? "Hide import settings" : "Open import settings"}
            </button>
          </div>
        </div>
      </section>

      {openSetting === "gmail" ? (
      <section className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Integrations</h2>
        <div className="mt-3 rounded-xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs text-slate-200/90">
            Gmail status: <span className="font-medium">{gmailStatus.connected ? "Connected" : "Disconnected"}</span>
            {gmailStatus.gmail_email ? ` (${gmailStatus.gmail_email})` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {gmailStatus.connected ? (
              <button
                type="button"
                onClick={() => {
                  void handleDisconnectGmail();
                }}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 sm:w-auto"
              >
                Disconnect Gmail
              </button>
            ) : (
              <a
                href="/api/gmail/connect"
                className="w-full rounded-lg bg-cyan-400/90 px-3 py-2 text-center text-xs font-medium text-slate-900 transition hover:bg-cyan-300 sm:w-auto"
              >
                Connect Gmail
              </a>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {openSetting === "mapping" ? (
      <section className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Travel Column Mapping</h2>
        <p className="mt-2 text-xs text-slate-300/90">
          Configure per-user columns for travel import. Date columns stay unchanged.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-200/90">Client column</span>
            <input
              value={travelMapping.clientColumn}
              onChange={(event) => {
                const value = normalizeColumnInput(event.target.value);
                setTravelMapping((prev) => ({ ...prev, clientColumn: value }));
              }}
              placeholder="P"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-200/90">Location column</span>
            <input
              value={travelMapping.locationColumn}
              onChange={(event) => {
                const value = normalizeColumnInput(event.target.value);
                setTravelMapping((prev) => ({ ...prev, locationColumn: value }));
              }}
              placeholder="Q"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-200/90">Responsible column</span>
            <input
              value={travelMapping.responsibleColumn}
              onChange={(event) => {
                const value = normalizeColumnInput(event.target.value);
                setTravelMapping((prev) => ({ ...prev, responsibleColumn: value }));
              }}
              placeholder="R"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSaveTravelMapping();
          }}
          disabled={mappingSaving}
          className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
        >
          {mappingSaving ? "Saving..." : "Save travel mapping"}
        </button>
      </section>
      ) : null}

      {openSetting === "import" ? (
      <section className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Data</h2>
        <p className="mt-2 text-xs text-slate-300/90">
          One-time import: upload your previous <code>hourlogger-data.json</code> file to migrate old tracking history
          into this account.
        </p>
        <button
          type="button"
          onClick={() => {
            importFileRef.current?.click();
          }}
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
      ) : null}

      <section className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">README</h2>
        <p className="mt-2 text-xs text-slate-300/90">Compact guides for users: what this app does and how to set up each part.</p>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => toggleReadme("program")}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Program README (what it is for)</span>
            <span>{openReadme === "program" ? "Hide" : "Show"}</span>
          </button>
          {openReadme === "program" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <ul className="list-disc space-y-1 pl-4">
                <li>Mail Automator generates pre/post training emails with configurable content blocks.</li>
                <li>Time Tracker logs workdays, compensation time, and overtime balance per user.</li>
                <li>Settings manages Gmail connection, travel sheet mapping, and one-time time-data import.</li>
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => toggleReadme("gmail")}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Gmail setup README</span>
            <span>{openReadme === "gmail" ? "Hide" : "Show"}</span>
          </button>
          {openReadme === "gmail" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <ol className="list-decimal space-y-1 pl-4">
                <li>Open Gmail settings above and click <strong>Connect Gmail</strong>.</li>
                <li>Choose account and grant draft permissions.</li>
                <li>Verify status changes to connected.</li>
              </ol>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => toggleReadme("mapping")}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Travel mapping setup README</span>
            <span>{openReadme === "mapping" ? "Hide" : "Show"}</span>
          </button>
          {openReadme === "mapping" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <ol className="list-decimal space-y-1 pl-4">
                <li>Open mapping settings above.</li>
                <li>Enter column letters for Client, Location, Responsible.</li>
                <li>Save mapping; user-specific override is applied immediately.</li>
              </ol>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => toggleReadme("import")}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Time import setup README</span>
            <span>{openReadme === "import" ? "Hide" : "Show"}</span>
          </button>
          {openReadme === "import" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <ol className="list-decimal space-y-1 pl-4">
                <li>Open import settings above.</li>
                <li>Upload your old <code>hourlogger-data.json</code> file.</li>
                <li>Wait for success message and refresh tracker week if needed.</li>
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
