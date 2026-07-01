"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { DEFAULT_MAIL_BRIEF_MODEL, MAIL_BRIEF_MODELS } from "@/lib/mail-brief-model";

export function AdminMailSettings() {
  const [model, setModel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/workspace-settings", { cache: "no-store" });
      const payload = (await response.json()) as
        | { settings: { mail_brief_model: string | null } }
        | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load settings.");
      setModel((payload as { settings: { mail_brief_model: string | null } }).settings.mail_brief_model);
      setLoaded(true);
    } catch (err) {
      setError((err as Error).message || "Failed to load settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setBriefModel = useCallback(async (next: string) => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/workspace-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mail_brief_model: next }),
      });
      const payload = (await response.json()) as
        | { settings: { mail_brief_model: string | null } }
        | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to update.");
      setModel((payload as { settings: { mail_brief_model: string | null } }).settings.mail_brief_model);
    } catch (err) {
      setError((err as Error).message || "Failed to update.");
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-slate-400">
        Workspace-wide settings for the mail composer. Applies to everyone, immediately.
      </p>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-slate-100">Mail brief model</p>
              <InfoTooltip label="About the mail brief model">
                Which Claude model writes emails in the composer&apos;s AI Brief mode. Opus 4.8 gives the
                best prose; Sonnet 5 is faster and cheaper. Applies workspace-wide, immediately.
              </InfoTooltip>
            </div>
            <p className="text-xs text-slate-400">Used only by AI Brief mode; Guided mode is unaffected.</p>
          </div>
          <select
            value={model ?? DEFAULT_MAIL_BRIEF_MODEL}
            onChange={(event) => {
              void setBriefModel(event.target.value);
            }}
            disabled={pending || !loaded}
            className="shrink-0 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-100 transition disabled:opacity-60"
          >
            {MAIL_BRIEF_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
