"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FreshnessPill } from "@/components/freshness-pill";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

type OnboardingSectionSummary = {
  id: string;
  title: string;
  totalItems: number;
  completedItems: number;
  percent: number;
};

type OnboardingUserSummary = {
  user_id: string;
  email: string;
  role: UserRole | null;
  percent: number;
  completed_items: number;
  total_items: number;
  completed_minutes: number;
  total_minutes: number;
  started_at: string | null;
  updated_at: string | null;
  sections: OnboardingSectionSummary[];
};

type OnboardingResponse = {
  total_items: number;
  users: OnboardingUserSummary[];
};

function fmtHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

function progressBarColor(percent: number) {
  if (percent >= 100) return "bg-emerald-300";
  if (percent >= 50) return "bg-cyan-300";
  if (percent > 0) return "bg-amber-300";
  return "bg-white/20";
}

export function AdminOnboardingPanel() {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/onboarding");
      const payload = (await response.json()) as OnboardingResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load onboarding progress.");
      setData(payload as OnboardingResponse);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "Failed to load onboarding progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startedCount = useMemo(
    () => data?.users.filter((user) => user.percent > 0).length ?? 0,
    [data],
  );
  const completedCount = useMemo(
    () => data?.users.filter((user) => user.percent >= 100).length ?? 0,
    [data],
  );

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-3 gap-2 sm:max-w-md">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Users</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{data?.users.length ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Started</p>
            <p className="mt-1 text-lg font-semibold text-cyan-200">{startedCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Completed</p>
            <p className="mt-1 text-lg font-semibold text-emerald-200">{completedCount}</p>
          </div>
        </div>
        <FreshnessPill updatedAt={updatedAt} loading={loading} />
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
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2 w-[34%]">Progress</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-right">Time done</th>
                <th className="px-3 py-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    Loading onboarding progress...
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    No users found.
                  </td>
                </tr>
              ) : (
                data?.users.map((user) => {
                  const isOpen = expanded === user.user_id;
                  return (
                    <Fragment key={user.user_id}>
                      <tr
                        className="cursor-pointer border-t border-white/5 align-middle transition hover:bg-white/5"
                        onClick={() => setExpanded(isOpen ? null : user.user_id)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span aria-hidden className="text-[10px] text-slate-500">
                              {isOpen ? "▾" : "▸"}
                            </span>
                            <span className="text-sm text-slate-100">{user.email || user.user_id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-300">{userRoleLabel(user.role)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-full max-w-[12rem] overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full transition-all ${progressBarColor(user.percent)}`}
                                style={{ width: `${user.percent}%` }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-200">
                              {user.percent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-300">
                          {user.completed_items}/{user.total_items}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-300">
                          {fmtHours(user.completed_minutes)} / {fmtHours(user.total_minutes)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-400">
                          {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr key={`${user.user_id}-detail`} className="border-t border-white/5 bg-slate-950/40">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {user.sections.map((section) => (
                                <div
                                  key={section.id}
                                  className="rounded-lg border border-white/10 bg-white/5 p-2.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-xs font-medium text-slate-100">{section.title}</p>
                                    <span className="shrink-0 text-[11px] tabular-nums text-cyan-200">
                                      {section.percent}%
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className={`h-full rounded-full ${progressBarColor(section.percent)}`}
                                      style={{ width: `${section.percent}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {section.completedItems}/{section.totalItems} completed
                                  </p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
