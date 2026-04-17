"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TimeTrackerPanel } from "@/components/time-tracker-panel";
import { AdminInsightsPanel } from "@/components/admin-insights-panel";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

type AdminUser = {
  id: string;
  email: string;
  role: UserRole | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type TimeOverviewUser = {
  user_id: string;
  email: string;
  role: UserRole | null;
  weekly_total_mins: number;
  overtime_bank_mins: number;
  missing_days: number;
  target_mins: number;
  error?: string;
};

type TimeOverviewResponse = {
  week_start: string;
  users: TimeOverviewUser[];
};

type UsersResponse = {
  users: AdminUser[];
};

type AdminTab = "users" | "overview" | "insights";

const ROLE_OPTIONS: Array<{ value: UserRole | "none"; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "eu_pilot", label: "EU Pilot" },
  { value: "us_pilot", label: "US Pilot" },
  { value: "hr", label: "HR" },
  { value: "none", label: "Not selected" },
];

export type AdminPanelProps = {
  /** When false, the Users & roles tab is hidden (HR read-only view). */
  canManageUsers?: boolean;
};

function fmtHM(mins: number) {
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = String(safe % 60).padStart(2, "0");
  return `${h}h ${m}m`;
}

function fmtSignedHM(mins: number) {
  const sign = mins < 0 ? "-" : "";
  return `${sign}${fmtHM(Math.abs(mins))}`;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(value: string) {
  const [y, m, d] = value.split("-").map((item) => Number.parseInt(item, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function getMonday(value?: string) {
  const base = value ? fromDateKey(value) : new Date();
  const day = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - day);
  base.setHours(0, 0, 0, 0);
  return base;
}

function addDays(value: Date, delta: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + delta);
  return next;
}

export function AdminPanel({ canManageUsers = true }: AdminPanelProps = {}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState<Record<string, boolean>>({});
  const [roleError, setRoleError] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState<string>(toDateKey(getMonday()));
  const [overview, setOverview] = useState<TimeOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [drilldownUserId, setDrilldownUserId] = useState<string | null>(null);
  const [drilldownEmail, setDrilldownEmail] = useState<string>("");

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as UsersResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load users.");
      setUsers((payload as UsersResponse).users);
    } catch (error) {
      setUsersError((error as Error).message || "Failed to load users.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadOverview = useCallback(
    async (week: string) => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const response = await fetch(`/api/admin/time-overview?week=${encodeURIComponent(week)}`);
        const payload = (await response.json()) as TimeOverviewResponse | { error: string };
        if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load overview.");
        setOverview(payload as TimeOverviewResponse);
      } catch (error) {
        setOverviewError((error as Error).message || "Failed to load overview.");
      } finally {
        setOverviewLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canManageUsers) return;
    void loadUsers();
  }, [loadUsers, canManageUsers]);

  useEffect(() => {
    void loadOverview(weekStart);
  }, [loadOverview, weekStart]);

  useEffect(() => {
    if (!canManageUsers && (tab === "users" || tab === "insights")) setTab("overview");
  }, [canManageUsers, tab]);

  const changeRole = useCallback(async (userId: string, next: UserRole | null) => {
    setRolePending((prev) => ({ ...prev, [userId]: true }));
    setRoleError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: next }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to update role.");
      }
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role: next } : user)));
    } catch (error) {
      setRoleError((error as Error).message || "Failed to update role.");
    } finally {
      setRolePending((prev) => {
        const nextState = { ...prev };
        delete nextState[userId];
        return nextState;
      });
    }
  }, []);

  const weekRangeLabel = useMemo(() => {
    const start = fromDateKey(weekStart);
    const end = addDays(start, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(start)} \u2013 ${fmt(end)}`;
  }, [weekStart]);

  if (drilldownUserId) {
    const apiBase = `/api/admin/time-user?user_id=${encodeURIComponent(drilldownUserId)}`;
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setDrilldownUserId(null);
              setDrilldownEmail("");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/12"
          >
            <span aria-hidden>&larr;</span>
            {canManageUsers ? "Back to admin" : "Back to team time"}
          </button>
          <p className="text-xs text-slate-400">Read-only view</p>
        </div>
        <TimeTrackerPanel
          readOnly
          apiBase={apiBase}
          viewingLabel={drilldownEmail || drilldownUserId}
        />
      </section>
    );
  }

  return (
    <section className="glass-card hourlogger-surface rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">
            {canManageUsers ? "Admin" : "HR"}
          </p>
          <h2 className="text-lg font-semibold md:text-xl">
            {canManageUsers ? "Workspace administration" : "Team time overview"}
          </h2>
        </div>
        {canManageUsers ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Admin tabs">
            <button
              type="button"
              onClick={() => setTab("overview")}
              role="tab"
              aria-selected={tab === "overview"}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                tab === "overview"
                  ? "border-amber-300/55 bg-amber-400/15 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              Time overview
            </button>
            <button
              type="button"
              onClick={() => setTab("users")}
              role="tab"
              aria-selected={tab === "users"}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                tab === "users"
                  ? "border-amber-300/55 bg-amber-400/15 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              Users &amp; roles
            </button>
            <button
              type="button"
              onClick={() => setTab("insights")}
              role="tab"
              aria-selected={tab === "insights"}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                tab === "insights"
                  ? "border-amber-300/55 bg-amber-400/15 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              Insights
            </button>
          </div>
        ) : null}
      </div>

      {tab === "overview" ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekStart(toDateKey(addDays(fromDateKey(weekStart), -7)))}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            >
              Prev week
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(toDateKey(getMonday()))}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(toDateKey(addDays(fromDateKey(weekStart), 7)))}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            >
              Next week
            </button>
            <span className="ml-auto text-xs text-slate-300/80">{weekRangeLabel}</span>
          </div>

          {overviewError ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {overviewError}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300/80">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2 text-right">Weekly total</th>
                  <th className="px-3 py-2 text-right">Target</th>
                  <th className="px-3 py-2 text-right">Overtime bank</th>
                  <th className="px-3 py-2 text-right">Missing days</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {overviewLoading && !overview ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-300/80">
                      Loading overview...
                    </td>
                  </tr>
                ) : overview?.users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-300/80">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  overview?.users.map((user) => (
                    <tr key={user.user_id} className="border-t border-white/5 align-middle">
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-100">{user.email || user.user_id}</span>
                          {user.error ? (
                            <span className="text-[10px] text-rose-300">{user.error}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {userRoleLabel(user.role)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtHM(user.weekly_total_mins)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmtHM(user.target_mins)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtSignedHM(user.overtime_bank_mins)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {user.missing_days > 0 ? (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">
                            {user.missing_days}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setDrilldownUserId(user.user_id);
                            setDrilldownEmail(user.email);
                          }}
                          className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                        >
                          View week
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "insights" && canManageUsers ? <AdminInsightsPanel /> : null}

      {tab === "users" && canManageUsers ? (
        <div className="mt-5 space-y-4">
          {usersError ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {usersError}
            </p>
          ) : null}
          {roleError ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {roleError}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300/80">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Current role</th>
                  <th className="px-3 py-2">Last sign-in</th>
                  <th className="px-3 py-2">Change role</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading && users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-300/80">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-300/80">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const pending = Boolean(rolePending[user.id]);
                    const currentValue: UserRole | "none" = user.role ?? "none";
                    return (
                      <tr key={user.id} className="border-t border-white/5">
                        <td className="px-3 py-2 text-sm text-slate-100">{user.email || user.id}</td>
                        <td className="px-3 py-2 text-xs text-slate-300">{userRoleLabel(user.role)}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {user.last_sign_in_at
                            ? new Date(user.last_sign_in_at).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={currentValue}
                            disabled={pending}
                            onChange={(event) => {
                              const value = event.target.value as UserRole | "none";
                              const next = value === "none" ? null : value;
                              void changeRole(user.id, next);
                            }}
                            className="rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1 text-xs text-slate-100"
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {pending ? (
                            <span className="ml-2 text-[10px] text-slate-400">Saving...</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Roles are stored in Supabase <code>user_metadata.role</code>. Changes take effect on the
            user&apos;s next dashboard load.
          </p>
        </div>
      ) : null}
    </section>
  );
}
