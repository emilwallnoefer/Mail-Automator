"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  MAIL_SIGNATURE_CUSTOM_VALUE,
  MAIL_SIGNATURE_DEFAULT_NAME,
  MAIL_SIGNATURE_NAME_PRESETS,
  isPresetSignatureName,
} from "@/lib/mail-signature-presets";
import { getUiSoundsEnabled, setUiSoundsEnabled as persistUiSoundsEnabled } from "@/lib/ui-sounds";
import type { UserRole } from "@/lib/user-role";

export type SettingsSectionId =
  | "gmail"
  | "travel_mapping"
  | "mail_signature"
  | "time_data"
  | "interface_sounds"
  | "security"
  | "readme";

const SETTINGS_NAV: { id: SettingsSectionId; label: string; pilotOnly?: boolean }[] = [
  { id: "gmail", label: "Gmail", pilotOnly: true },
  { id: "travel_mapping", label: "Travel mapping", pilotOnly: true },
  { id: "mail_signature", label: "Mail signature", pilotOnly: true },
  { id: "time_data", label: "Time data" },
  { id: "interface_sounds", label: "Interface sounds" },
  { id: "security", label: "Account & security" },
  { id: "readme", label: "Help & README" },
];

function filterSettingsNav(isSalesOnly: boolean, navFilter: string) {
  const visible = SETTINGS_NAV.filter((item) => !item.pilotOnly || !isSalesOnly);
  const q = navFilter.trim().toLowerCase();
  return q === "" ? visible : visible.filter((item) => item.label.toLowerCase().includes(q));
}

type SettingsPanelProps = {
  email: string;
  showStandaloneActions?: boolean;
  autoOpenProgramReadmeToken?: number;
  userRole?: UserRole;
};

export function SettingsPanel({
  email: _email,
  showStandaloneActions = false,
  autoOpenProgramReadmeToken = 0,
  userRole = "eu_pilot",
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    userRole === "sales" ? "time_data" : "gmail",
  );
  const [navFilter, setNavFilter] = useState("");
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
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const isSalesOnly = userRole === "sales" || userRole === "hr";
  const [mailSigPreset, setMailSigPreset] = useState<string>(MAIL_SIGNATURE_NAME_PRESETS[0]);
  const [mailSigCustom, setMailSigCustom] = useState("");
  const [mailSigSaving, setMailSigSaving] = useState(false);
  const [uiSoundsOn, setUiSoundsOn] = useState(true);

  useEffect(() => {
    setUiSoundsOn(getUiSoundsEnabled());
    function onUiSoundsChanged(e: Event) {
      const d = (e as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof d?.enabled === "boolean") setUiSoundsOn(d.enabled);
    }
    window.addEventListener("ma-ui-sounds-changed", onUiSoundsChanged);
    return () => window.removeEventListener("ma-ui-sounds-changed", onUiSoundsChanged);
  }, []);

  useEffect(() => {
    (async () => {
      if (isSalesOnly) return;
      const [gmailResponse, mappingResponse, sigResponse] = await Promise.all([
        fetch("/api/gmail/status"),
        fetch("/api/settings/travel-mapping"),
        fetch("/api/settings/mail-signature"),
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
      if (sigResponse.ok) {
        const sig = (await sigResponse.json()) as { signature_name?: string };
        const name = (sig.signature_name ?? "").trim() || MAIL_SIGNATURE_DEFAULT_NAME;
        if (isPresetSignatureName(name)) {
          setMailSigPreset(name);
          setMailSigCustom("");
        } else {
          setMailSigPreset(MAIL_SIGNATURE_CUSTOM_VALUE);
          setMailSigCustom(name);
        }
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

  async function handleSaveMailSignature() {
    const effective =
      mailSigPreset === MAIL_SIGNATURE_CUSTOM_VALUE ? mailSigCustom.trim() : mailSigPreset.trim();
    if (!effective) {
      setError("Enter a name for the email signature.");
      setMessage(null);
      return;
    }
    setMailSigSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/mail-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_name: effective }),
      });
      const data = (await response.json()) as { error?: string; signature_name?: string };
      if (!response.ok) throw new Error(data.error || "Could not save signature name.");
      setMessage("Mail signature name saved.");
      window.dispatchEvent(
        new CustomEvent("mail-signature-saved", { detail: { signature_name: data.signature_name ?? effective } }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMailSigSaving(false);
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
    setActiveSection("readme");
    setOpenReadme("program");
  }, [autoOpenProgramReadmeToken]);

  const filteredNavItems = useMemo(
    () => filterSettingsNav(isSalesOnly, navFilter),
    [isSalesOnly, navFilter],
  );

  useEffect(() => {
    if (filteredNavItems.length === 0) return;
    if (!filteredNavItems.some((item) => item.id === activeSection)) {
      setActiveSection(filteredNavItems[0].id);
    }
  }, [filteredNavItems, activeSection]);

  return (
    <section className="underwater-panel relative overflow-hidden rounded-2xl">
      <div className="relative min-h-0 min-w-0 w-full">
        <div className="bubble-layer pointer-events-none absolute inset-0 z-0" aria-hidden="true">
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

        <section className="glass-card hourlogger-surface relative z-[1] w-full min-w-0 overflow-hidden rounded-2xl">
        <div className="flex min-h-[min(70vh,560px)] flex-col md:flex-row">
          <nav
            className="shrink-0 border-b border-white/10 bg-slate-950/40 md:w-[min(100%,240px)] md:border-b-0 md:border-r md:border-white/10"
            aria-label="Settings categories"
          >
            <div className="border-b border-white/10 px-3 pb-3 pt-3 md:px-4 md:pb-4 md:pt-5">
              <h1 className="text-base font-semibold uppercase tracking-[0.14em] text-slate-100 md:text-lg">
                Settings
              </h1>
              {showStandaloneActions ? (
                <a
                  href="/dashboard"
                  className="mt-2 inline-block rounded-md border border-white/15 bg-white/8 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/12"
                >
                  Back to dashboard
                </a>
              ) : null}
            </div>
            <div className="p-3 pb-2 md:px-4">
              <label className="sr-only" htmlFor="settings-find">
                Find a setting
              </label>
              <input
                id="settings-find"
                type="search"
                value={navFilter}
                onChange={(e) => setNavFilter(e.target.value)}
                placeholder="Find a setting"
                autoComplete="off"
                className="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-3 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
              />
            </div>
            {filteredNavItems.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500 md:px-4">No settings match your search.</p>
            ) : (
              <ul className="max-h-[42vh] overflow-y-auto px-0 pb-3 md:max-h-[calc(70vh-120px)] md:pb-4" role="list">
                {filteredNavItems.map((item) => {
                  const active = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={`flex w-full items-center border-l-[3px] px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "border-cyan-400 bg-cyan-500/15 font-medium text-white"
                            : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="min-h-[280px] min-w-0 flex-1 overflow-y-auto border-t border-white/5 bg-slate-950/20 p-4 md:border-t-0 md:p-6">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
                {SETTINGS_NAV.find((n) => n.id === activeSection)?.label ?? "Settings"}
              </h2>

              {!isSalesOnly && activeSection === "gmail" ? (
                <div className="mt-5">
                  <p className="text-sm text-slate-400">Connect Google so generated training mails can be saved as Gmail drafts.</p>
                  <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4">
                    <p className="text-sm text-slate-200/90">
                      Status: <span className="font-medium">{gmailStatus.connected ? "Connected" : "Disconnected"}</span>
                      {gmailStatus.gmail_email ? ` (${gmailStatus.gmail_email})` : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {gmailStatus.connected ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDisconnectGmail();
                          }}
                          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15"
                        >
                          Disconnect Gmail
                        </button>
                      ) : (
                        <a
                          href="/api/gmail/connect"
                          className="rounded-lg bg-cyan-400/90 px-3 py-2 text-center text-xs font-medium text-slate-900 transition hover:bg-cyan-300"
                        >
                          Connect Gmail
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {!isSalesOnly && activeSection === "mail_signature" ? (
                <div className="mt-5">
                  <p className="text-sm text-slate-400">
                    This name appears in the closing of generated training emails (e.g. &ldquo;Best regards, …&rdquo;).
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block min-w-0 flex-1">
                      <span className="mb-1 block text-xs text-slate-200/90">Preset</span>
                      <select
                        value={mailSigPreset}
                        onChange={(event) => setMailSigPreset(event.target.value)}
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                      >
                        {MAIL_SIGNATURE_NAME_PRESETS.map((preset) => (
                          <option key={preset} value={preset}>
                            {preset}
                          </option>
                        ))}
                        <option value={MAIL_SIGNATURE_CUSTOM_VALUE}>Custom name…</option>
                      </select>
                    </label>
                    {mailSigPreset === MAIL_SIGNATURE_CUSTOM_VALUE ? (
                      <label className="block min-w-0 flex-1">
                        <span className="mb-1 block text-xs text-slate-200/90">Custom name</span>
                        <input
                          value={mailSigCustom}
                          onChange={(event) => setMailSigCustom(event.target.value)}
                          placeholder="Your name"
                          maxLength={120}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={mailSigSaving}
                      onClick={() => void handleSaveMailSignature()}
                      className="rounded-lg bg-cyan-400/90 px-4 py-2 text-xs font-medium text-slate-900 transition hover:bg-cyan-300 disabled:opacity-50"
                    >
                      {mailSigSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : null}

              {!isSalesOnly && activeSection === "travel_mapping" ? (
                <div className="mt-5">
                  <p className="text-sm text-slate-400">Configure per-user columns for travel import. Date columns stay unchanged.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                    className="mt-4 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs transition hover:bg-white/15 disabled:opacity-60"
                  >
                    {mappingSaving ? "Saving..." : "Save travel mapping"}
                  </button>
                </div>
              ) : null}

              {activeSection === "time_data" ? (
                <div className="mt-5">
                  <p className="text-sm text-slate-400">
                    One-time import: upload your previous <code className="rounded bg-white/10 px-1">hourlogger-data.json</code> file to
                    migrate old tracking history into this account. You can also export your current data.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
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
                </div>
              ) : null}

              {activeSection === "interface_sounds" ? (
                <div className="mt-5">
                  <div className="rounded-xl border border-white/15 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 pr-1">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400/90">Interface sounds</p>
                        <p className="mt-1.5 text-[15px] font-semibold leading-none text-slate-50">{uiSoundsOn ? "On" : "Off"}</p>
                        <p className="mt-2 text-[10px] leading-snug tracking-wide text-slate-400/90">
                          Module switches, mail actions, live preview typing, and time tracker feedback. Stored on this device.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={uiSoundsOn}
                        aria-label={uiSoundsOn ? "Turn interface sounds off" : "Turn interface sounds on"}
                        onClick={() => {
                          const next = !uiSoundsOn;
                          setUiSoundsOn(next);
                          persistUiSoundsEnabled(next);
                        }}
                        className={`relative h-7 w-[46px] shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/80 ${
                          uiSoundsOn
                            ? "border-cyan-500/25 bg-[rgb(22_58_68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "border-white/15 bg-white/[0.07]"
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                            uiSoundsOn ? "translate-x-[22px]" : "translate-x-0"
                          }`}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === "security" ? (
                <div className="mt-5">
                  <div className="rounded-xl border border-rose-400/35 bg-rose-950/25 p-4">
                    <p className="text-sm font-medium text-rose-200">Delete account</p>
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
              ) : null}

              {activeSection === "readme" ? (
                <div className="mt-5 space-y-2">
                  <p className="text-sm text-slate-400">In-app guides for integrations and workflows.</p>
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
                        <li>
                          Open <strong>Gmail</strong> in the settings list on the left.
                        </li>
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
                        <li>
                          Open <strong>Travel mapping</strong> in the settings list.
                        </li>
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
                        <li>
                          Open <strong>Time data</strong> in the settings list.
                        </li>
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

              {message ? <p className="mt-8 text-sm text-emerald-300">{message}</p> : null}
              {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
            </div>
          </div>
        </div>
        </section>
      </div>
    </section>
  );
}
