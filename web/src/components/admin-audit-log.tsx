"use client";

import { useCallback, useEffect, useState } from "react";
import { FreshnessPill } from "@/components/freshness-pill";
import { fmtRelative } from "@/lib/admin-format";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

type AuditEntry = {
  id: number;
  actor_email: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  role_change: "Role change",
  reminder_pause: "Reminder paused",
  reminder_resume: "Reminder resumed",
  mail_brief_model_change: "Mail model change",
};

function roleText(value: unknown): string {
  if (value === null || value === undefined) return "Not selected";
  if (value === "sales" || value === "eu_pilot" || value === "us_pilot" || value === "hr") {
    return userRoleLabel(value as UserRole);
  }
  return String(value);
}

function describeDetail(entry: AuditEntry): string | null {
  const detail = entry.detail;
  if (!detail) return null;
  if (entry.action === "role_change") {
    return `${roleText(detail.from)} → ${roleText(detail.to)}`;
  }
  if (entry.action === "mail_brief_model_change") {
    return detail.model ? `→ ${String(detail.model)}` : null;
  }
  return null;
}

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/audit", { cache: "no-store" });
      const payload = (await response.json()) as { entries: AuditEntry[] } | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load audit log.");
      setEntries((payload as { entries: AuditEntry[] }).entries);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Recent deliberate admin actions — role changes, reminder pauses, and mail-model changes.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <FreshnessPill updatedAt={updatedAt} loading={loading} />
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            disabled={loading}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="relative">
        {updatedAt != null ? (
          <span key={`sweep-${updatedAt}`} aria-hidden className="data-refresh-sweep" />
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300/80">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    Loading audit log…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    No admin activity recorded yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const detailText = describeDetail(entry);
                  return (
                    <tr key={entry.id} className="border-t border-white/5 align-middle">
                      <td
                        className="px-3 py-2 text-xs text-slate-400"
                        title={new Date(entry.created_at).toLocaleString()}
                      >
                        {fmtRelative(entry.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-200">{entry.actor_email || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-100">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">{entry.target || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{detailText || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
