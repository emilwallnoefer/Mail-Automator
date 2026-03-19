"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

type SettingsPanelProps = {
  email: string;
  showStandaloneActions?: boolean;
  autoOpenProgramReadmeToken?: number;
  userRole?: "pilot" | "sales";
};

export function SettingsPanel({
  email,
  showStandaloneActions = false,
  autoOpenProgramReadmeToken = 0,
  userRole = "pilot",
}: SettingsPanelProps) {
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
  const [showReadmeSection, setShowReadmeSection] = useState(false);
  const [openReadme, setOpenReadme] = useState<"program" | "gmail" | "mapping" | "import" | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const isSalesOnly = userRole === "sales";

  useEffect(() => {
    (async () => {
      if (isSalesOnly) return;
      const [gmailResponse, mappingResponse] = await Promise.all([fetch("/api/gmail/status"), fetch("/api/settings/travel-mapping")]);
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
  }, [isSalesOnly]);

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

  async function handleExportData() {
    setExporting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/time-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_json" }),
      });
      const payload = (await response.json()) as { error?: string; work?: unknown; comp?: unknown };
      if (!response.ok) throw new Error(payload.error || "Export failed");

      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `hourlogger-data-${stamp}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${fileName}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      setMessage(null);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setMessage(null);
      return;
    }
    setPasswordSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setMessage("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError((err as Error).message || "Could not update password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      setMessage(null);
      return;
    }
    setDeletingAccount(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not delete account.");
      window.location.href = "/login";
    } catch (err) {
      setError((err as Error).message || "Could not delete account.");
      setDeletingAccount(false);
    }
  }

  function toggleReadme(key: "program" | "gmail" | "mapping" | "import") {
    setOpenReadme((prev) => (prev === key ? null : key));
  }

  useEffect(() => {
    if (autoOpenProgramReadmeToken <= 0) return;
    setShowReadmeSection(true);
    setOpenReadme("program");
  }, [autoOpenProgramReadmeToken]);

  return (
    <section className="underwater-panel space-y-4 rounded-2xl p-2">
      <div className="bubble-layer" aria-hidden="true">
        {[
          { left: "7%", size: "8px", duration: "9.5s", delay: "0s" },
          { left: "24%", size: "7px", duration: "11s", delay: "-2.2s" },
          { left: "39%", size: "10px", duration: "10.2s", delay: "-1.4s" },
          { left: "57%", size: "8px", duration: "12.4s", delay: "-3.6s" },
          { left: "73%", size: "9px", duration: "9.2s", delay: "-2.8s" },
          { left: "88%", size: "11px", duration: "13.5s", delay: "-5s" },
        ].map((bubble, idx) => (
          <span
            key={`${bubble.left}-${idx}`}
            className="bubble"
            style={
              {
                "--bubble-left": bubble.left,
                "--bubble-size": bubble.size,
                "--bubble-duration": bubble.duration,
                "--bubble-delay": bubble.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <header className="glass-card hourlogger-surface flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
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

      <section className="glass-card hourlogger-surface p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Overview</h2>
        <div className={`mt-3 grid gap-3 ${isSalesOnly ? "md:grid-cols-1" : "md:grid-cols-3"}`}>
          {!isSalesOnly ? (
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
          ) : null}
          {!isSalesOnly ? (
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
          ) : null}
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

      <section className="glass-card hourlogger-surface p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Security and Access</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-xs font-medium text-slate-100">Change password</p>
            <div className="mt-2 space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void handleChangePassword();
              }}
              disabled={passwordSaving}
              className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
            >
              {passwordSaving ? "Saving..." : "Update password"}
            </button>
          </div>

          <div className="rounded-xl border border-rose-400/35 bg-rose-950/25 p-3">
            <p className="text-xs font-medium text-rose-200">Delete account</p>
            <p className="mt-1 text-xs text-rose-100/80">
              This permanently removes your account and all app access for this login.
            </p>
            <div className="mt-2">
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="w-full rounded-lg border border-rose-200/35 bg-white/10 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void handleDeleteAccount();
              }}
              disabled={deletingAccount}
              className="mt-3 rounded-lg border border-rose-300/45 bg-rose-500/20 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-60"
            >
              {deletingAccount ? "Deleting account..." : "Delete account"}
            </button>
          </div>
        </div>
      </section>

      {!isSalesOnly && openSetting === "gmail" ? (
      <section className="glass-card hourlogger-surface p-4 md:p-5">
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

      {!isSalesOnly && openSetting === "mapping" ? (
      <section className="glass-card hourlogger-surface p-4 md:p-5">
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
      <section className="glass-card hourlogger-surface p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/75">Data</h2>
        <p className="mt-2 text-xs text-slate-300/90">
          One-time import: upload your previous <code>hourlogger-data.json</code> file to migrate old tracking history
          into this account.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              importFileRef.current?.click();
            }}
            disabled={importing}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
          >
            {importing ? "Importing..." : "Upload old time tracking data"}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleExportData();
            }}
            disabled={exporting}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export time tracking data"}
          </button>
        </div>
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

      <div className="flex justify-start">
      <section
        className={`glass-card hourlogger-surface transition-all duration-300 ease-out ${
          showReadmeSection ? "w-full p-4 md:p-5" : "w-fit p-3"
        }`}
      >
        <button
          type="button"
          onClick={() => setShowReadmeSection((prev) => !prev)}
          className={`rounded-lg border border-white/15 bg-white/8 text-xs font-medium transition hover:bg-white/12 ${
            showReadmeSection
              ? "flex w-full items-center justify-between px-3 py-2 text-left"
              : "inline-flex items-center gap-3 px-3 py-2"
          }`}
        >
          <span>README</span>
          <span>{showReadmeSection ? "Hide" : "Show"}</span>
        </button>
        {showReadmeSection ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => toggleReadme("program")}
            className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
          >
            <span>Program functionality README</span>
            <span>{openReadme === "program" ? "Hide" : "Show"}</span>
          </button>
          {openReadme === "program" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <p className="font-medium text-cyan-200">What this program does</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {!isSalesOnly ? (
                  <li>
                    <strong>Mail Automator</strong> creates pre/post training mails from structured inputs (language,
                    context, materials, and custom notes).
                  </li>
                ) : null}
                {!isSalesOnly ? (
                  <li>
                    <strong>Gmail Draft Mode</strong> allows generated mails to be saved as drafts directly in the
                    connected Gmail account.
                  </li>
                ) : null}
                <li>
                  <strong>Time Tracker</strong> records work logs, compensation, and overtime bank per authenticated
                  user.
                </li>
                {!isSalesOnly ? (
                  <li>
                    <strong>Travel Integration</strong> enriches tracker days with travel context from Google Sheets using
                    per-user mapping.
                  </li>
                ) : null}
                <li>
                  <strong>Settings</strong> provides integration setup, mapping control, and legacy time-data import.
                </li>
              </ul>
            </div>
          ) : null}

          {!isSalesOnly ? (
            <button
              type="button"
              onClick={() => toggleReadme("gmail")}
              className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
            >
              <span>Gmail setup README</span>
              <span>{openReadme === "gmail" ? "Hide" : "Show"}</span>
            </button>
          ) : null}
          {!isSalesOnly && openReadme === "gmail" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <p className="font-medium text-cyan-200">What it does</p>
              <p className="mt-1 text-slate-300/90">
                Gmail setup enables draft creation from generated mails so users can review and send from Gmail.
              </p>
              <p className="mt-2 font-medium text-cyan-200">Steps</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Open <strong>Gmail settings</strong> above.</li>
                <li>Click <strong>Connect Gmail</strong>.</li>
                <li>Select the correct Google account.</li>
                <li>Approve required permissions for draft creation.</li>
                <li>Return to app and confirm status is <strong>Connected</strong>.</li>
                <li>Generate a mail draft and run <strong>Create Gmail draft</strong> as final verification.</li>
              </ol>
            </div>
          ) : null}

          {!isSalesOnly ? (
            <button
              type="button"
              onClick={() => toggleReadme("mapping")}
              className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-left text-xs font-medium transition hover:bg-white/12"
            >
              <span>Travel mapping setup README</span>
              <span>{openReadme === "mapping" ? "Hide" : "Show"}</span>
            </button>
          ) : null}
          {!isSalesOnly && openReadme === "mapping" ? (
            <div className="rounded-lg border border-white/10 bg-slate-900/45 p-3 text-xs text-slate-200/90">
              <p className="font-medium text-cyan-200">What it does</p>
              <p className="mt-1 text-slate-300/90">
                Mapping defines where Client/Location/Responsible values are read in your travel sheet.
              </p>
              <p className="mt-2 font-medium text-cyan-200">Steps</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Open <strong>Mapping settings</strong>.</li>
                <li>Enter sheet column letters for Client, Location, and Responsible.</li>
                <li>Use letters only (examples: <code>P</code>, <code>Q</code>, <code>R</code>, <code>AA</code>).</li>
                <li>Click <strong>Save travel mapping</strong>.</li>
                <li>Open Time Tracker and verify travel info appears for expected dates.</li>
                <li>If values are missing, adjust letters and save again.</li>
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
              <p className="font-medium text-cyan-200">What it does</p>
              <p className="mt-1 text-slate-300/90">
                Import migrates old `hourlogger-data.json` records into this account&apos;s time tracker history.
              </p>
              <p className="mt-2 font-medium text-cyan-200">Steps</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Open <strong>Import settings</strong>.</li>
                <li>Prepare a valid <code>hourlogger-data.json</code> export file.</li>
                <li>Upload the file using <strong>Upload old time tracking data</strong>.</li>
                <li>Wait until the success message confirms imported days.</li>
                <li>Open Time Tracker and navigate weeks to verify imported entries.</li>
                <li>If needed, rerun with corrected data file.</li>
              </ol>
            </div>
          ) : null}
        </div>
        ) : null}
      </section>
      </div>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
