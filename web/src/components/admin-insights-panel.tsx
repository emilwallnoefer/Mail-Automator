"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

type Insights = {
  generated_at: string;
  settings: {
    reminder_paused: boolean;
    reminder_paused_at: string | null;
    reminder_paused_by: string | null;
    updated_at: string;
  };
  reminders: {
    total_logged: number;
    last_cron_run:
      | {
          sent_at: string;
          sent: number;
          failed: number;
          skipped_dry_run: number;
        }
      | null;
    last_7_days: { sent: number; failed: number; skipped_dry_run: number };
    last_30_days: { sent: number; failed: number; skipped_dry_run: number; total: number };
    failure_rate_30d: number;
    top_reminded_90d: Array<{ email: string; count: number }>;
  };
  workspace: {
    total_users: number;
    users_by_role: Record<string, number>;
    active_last_7_days: number;
    hours_logged_last_7_days: number;
    hours_logged_this_month: number;
  };
};

const ROLE_ORDER: Array<UserRole | "none"> = ["sales", "eu_pilot", "us_pilot", "hr", "none"];

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const diffMs = Date.now() - then;
  const abs = Math.abs(diffMs);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return "just now";
  if (abs < hour) return `${Math.floor(abs / min)}m ${diffMs > 0 ? "ago" : "from now"}`;
  if (abs < day) return `${Math.floor(abs / hour)}h ${diffMs > 0 ? "ago" : "from now"}`;
  if (abs < 30 * day) return `${Math.floor(abs / day)}d ${diffMs > 0 ? "ago" : "from now"}`;
  return new Date(iso).toLocaleDateString();
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtPct(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const pct = value * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400/80">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function AdminInsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pausePending, setPausePending] = useState(false);
  const [actionPending, setActionPending] = useState<null | "dry" | "test">(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/insights", { cache: "no-store" });
      const payload = (await response.json()) as Insights | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load insights.");
      setData(payload as Insights);
    } catch (err) {
      setError((err as Error).message || "Failed to load insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePause = useCallback(
    async (next: boolean) => {
      setPausePending(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/workspace-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminder_paused: next }),
        });
        const payload = (await response.json()) as
          | { settings: Insights["settings"] }
          | { error: string };
        if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to update.");
        setData((prev) => (prev ? { ...prev, settings: (payload as { settings: Insights["settings"] }).settings } : prev));
      } catch (err) {
        setError((err as Error).message || "Failed to update.");
      } finally {
        setPausePending(false);
      }
    },
    [],
  );

  const runDryRun = useCallback(async () => {
    setActionPending("dry");
    setActionResult(null);
    setError(null);
    try {
      const response = await fetch("/api/cron/time-log-reminder?dry=1&force=1", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: boolean; considered?: number; reminded?: number; skipped?: boolean; reason?: string }
        | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Dry run failed.");
      const summary = payload as {
        considered?: number;
        reminded?: number;
        skipped?: boolean;
        reason?: string;
      };
      if (summary.skipped) {
        setActionResult(`Skipped (${summary.reason ?? "unknown reason"}).`);
      } else {
        setActionResult(
          `Dry run OK — considered ${summary.considered ?? 0} user${
            summary.considered === 1 ? "" : "s"
          }, would remind ${summary.reminded ?? 0}.`,
        );
      }
      await load();
    } catch (err) {
      setError((err as Error).message || "Dry run failed.");
    } finally {
      setActionPending(null);
    }
  }, [load]);

  const sendTest = useCallback(async () => {
    const target = testEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError("Enter a valid email address for the test send.");
      return;
    }
    setActionPending("test");
    setActionResult(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/cron/time-log-reminder?send_test=${encodeURIComponent(target)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | { ok: boolean; to?: string; message_id?: string; error?: string }
        | { error: string };
      if (!response.ok || !("ok" in payload) || !payload.ok) {
        throw new Error(
          ("error" in payload && payload.error) || "Test send failed.",
        );
      }
      setActionResult(`Test sent to ${payload.to ?? target} (message ${payload.message_id ?? "?"}).`);
    } catch (err) {
      setError((err as Error).message || "Test send failed.");
    } finally {
      setActionPending(null);
    }
  }, [testEmail]);

  const usersByRole = useMemo(() => {
    if (!data) return [] as Array<{ role: UserRole | "none"; count: number }>;
    return ROLE_ORDER.map((role) => ({
      role,
      count: data.workspace.users_by_role[role] ?? 0,
    }));
  }, [data]);

  const reminders = data?.reminders;
  const workspace = data?.workspace;
  const settings = data?.settings;

  return (
    <div className="mt-5 space-y-6">
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <section aria-label="Statistics" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Statistics</p>
            <h3 className="text-base font-semibold text-slate-100">Workspace activity at a glance</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            disabled={loading}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Last reminder run"
            value={
              reminders?.last_cron_run
                ? `${reminders.last_cron_run.sent} sent`
                : loading
                  ? "…"
                  : "never"
            }
            hint={
              reminders?.last_cron_run
                ? `${fmtRelative(reminders.last_cron_run.sent_at)} · ${reminders.last_cron_run.failed} failed${
                    reminders.last_cron_run.skipped_dry_run > 0
                      ? ` · ${reminders.last_cron_run.skipped_dry_run} dry`
                      : ""
                  }`
                : "Migration + first Monday cron needed"
            }
          />
          <StatCard
            label="Sent in last 7 days"
            value={String(reminders?.last_7_days.sent ?? 0)}
            hint={
              reminders
                ? `${reminders.last_7_days.failed} failed`
                : loading
                  ? "…"
                  : "—"
            }
          />
          <StatCard
            label="30-day failure rate"
            value={reminders ? fmtPct(reminders.failure_rate_30d) : loading ? "…" : "0%"}
            hint={
              reminders
                ? `${reminders.last_30_days.total} sends recorded`
                : "No data yet"
            }
          />
          <StatCard
            label="Active users (7d)"
            value={workspace ? String(workspace.active_last_7_days) : loading ? "…" : "0"}
            hint={workspace ? `of ${workspace.total_users} total` : undefined}
          />
          <StatCard
            label="Hours logged this month"
            value={workspace ? `${workspace.hours_logged_this_month}h` : loading ? "…" : "0h"}
            hint={workspace ? `${workspace.hours_logged_last_7_days}h in last 7d` : undefined}
          />
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2 lg:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400/80">Users by role</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {usersByRole.length === 0 ? (
                <span className="text-xs text-slate-400">
                  {loading ? "Loading…" : "No users found."}
                </span>
              ) : (
                usersByRole.map(({ role, count }) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-200"
                  >
                    <span className="text-slate-300">{userRoleLabel(role === "none" ? null : (role as UserRole))}</span>
                    <span className="tabular-nums text-slate-100">{count}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400/80">
            Most reminded in last 90 days
          </p>
          {reminders && reminders.top_reminded_90d.length > 0 ? (
            <ul className="mt-2 divide-y divide-white/5">
              {reminders.top_reminded_90d.map((entry) => (
                <li
                  key={entry.email}
                  className="flex items-center justify-between gap-3 py-1.5 text-sm text-slate-200"
                >
                  <span className="truncate">{entry.email}</span>
                  <span className="tabular-nums text-slate-100">
                    {entry.count} reminder{entry.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              {loading ? "Loading…" : "No reminders sent in the last 90 days — nice."}
            </p>
          )}
        </div>
      </section>

      <section aria-label="Settings" className="space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Settings</p>
          <h3 className="text-base font-semibold text-slate-100">Reminder controls</h3>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-slate-100">
                Monday reminder email
              </p>
              <p className="text-xs text-slate-400">
                When paused, the weekly cron and any <code>?force=1</code> run will skip sending.
                Dry runs still work for previewing the candidate list.
              </p>
              {settings?.reminder_paused ? (
                <p className="text-xs text-amber-200/90">
                  Paused {fmtRelative(settings.reminder_paused_at)} by{" "}
                  {settings.reminder_paused_by || "unknown"} ({fmtAbsolute(settings.reminder_paused_at)})
                </p>
              ) : settings ? (
                <p className="text-xs text-emerald-200/85">Active — next run Monday 09:00 Europe/Zurich.</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!settings) return;
                void togglePause(!settings.reminder_paused);
              }}
              disabled={pausePending || !settings}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                settings?.reminder_paused
                  ? "border-emerald-300/55 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
                  : "border-amber-300/55 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
              }`}
            >
              {pausePending
                ? "Saving…"
                : settings?.reminder_paused
                  ? "Resume reminder"
                  : "Pause reminder"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-medium text-slate-100">Force-run (dry)</p>
            <p className="mt-1 text-xs text-slate-400">
              Runs the candidate scan right now without sending any real emails. Rows are recorded
              in the audit log as <code>skipped_dry_run</code>.
            </p>
            <button
              type="button"
              onClick={() => {
                void runDryRun();
              }}
              disabled={actionPending === "dry"}
              className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-60"
            >
              {actionPending === "dry" ? "Running…" : "Run dry"}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-medium text-slate-100">Send test to an address</p>
            <p className="mt-1 text-xs text-slate-400">
              Sends one real email via Resend (subject prefixed with <code>[TEST]</code>) to the
              address you enter. Does not touch the normal candidate list or the audit log.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                placeholder="you@flyability.com"
                className="min-w-[180px] flex-1 rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => {
                  void sendTest();
                }}
                disabled={actionPending === "test" || testEmail.trim().length === 0}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-60"
              >
                {actionPending === "test" ? "Sending…" : "Send test"}
              </button>
            </div>
          </div>
        </div>

        {actionResult ? (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {actionResult}
          </p>
        ) : null}
      </section>
    </div>
  );
}
