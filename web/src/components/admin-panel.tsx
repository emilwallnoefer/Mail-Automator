"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimeTrackerPanel } from "@/components/time-tracker-panel";
import { AdminInsightsPanel } from "@/components/admin-insights-panel";
import { MailTrackingPanel } from "@/components/mail-tracking-panel";
import { WeekStepper } from "@/components/week-stepper";
import { InfoTooltip } from "@/components/info-tooltip";
import { FreshnessPill } from "@/components/freshness-pill";
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

type AdminTab = "users" | "overview" | "insights" | "mail_tracking";

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

const ADMIN_TABS: Array<{ id: AdminTab; label: string; subtitle: string; help: string }> = [
  {
    id: "overview",
    label: "Time",
    subtitle: "Weekly totals per user",
    help: "Per-user weekly time totals, overtime bank, and missing day count. Click a row to drill into a specific user's week.",
  },
  {
    id: "insights",
    label: "Insights",
    subtitle: "Workspace KPIs and reminder controls",
    help: "Aggregate workspace metrics plus the Monday reminder cron settings (pause, dry run, send test).",
  },
  {
    id: "mail_tracking",
    label: "Mail tracking",
    subtitle: "Click telemetry per recipient and link",
    help: "Tracking links rewrite outbound HTML at Gmail draft creation. Scanner clicks (Outlook ATP, Mimecast, etc.) are flagged and hidden unless the Scanners checkbox is on.",
  },
  {
    id: "users",
    label: "Users",
    subtitle: "Manage workspace roles",
    help: "Roles are stored in Supabase user_metadata.role. Changes take effect on the user's next dashboard load.",
  },
];

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
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<number | null>(null);
  const [usersUpdatedAt, setUsersUpdatedAt] = useState<number | null>(null);

  const [drilldownUserId, setDrilldownUserId] = useState<string | null>(null);
  const [drilldownEmail, setDrilldownEmail] = useState<string>("");

  const usersFetchedRef = useRef(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as UsersResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load users.");
      setUsers((payload as UsersResponse).users);
      setUsersUpdatedAt(Date.now());
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
        setOverviewUpdatedAt(Date.now());
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
    if (tab !== "users") return;
    if (usersFetchedRef.current) return;
    usersFetchedRef.current = true;
    void loadUsers();
  }, [loadUsers, canManageUsers, tab]);

  useEffect(() => {
    void loadOverview(weekStart);
  }, [loadOverview, weekStart]);

  useEffect(() => {
    if (!canManageUsers && (tab === "users" || tab === "insights" || tab === "mail_tracking")) {
      setTab("overview");
    }
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

  const activeTab = useMemo(() => ADMIN_TABS.find((entry) => entry.id === tab), [tab]);

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
      <header className="space-y-2 border-b border-white/5 pb-3">
        {canManageUsers ? (
          <nav
            className="inline-flex w-full overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs sm:w-auto"
            role="tablist"
            aria-label="Admin tabs"
          >
            {ADMIN_TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 transition ${
                  tab === entry.id
                    ? "bg-amber-400/15 text-amber-100"
                    : "text-slate-300 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        ) : (
          <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/80">
            Team time overview
          </p>
        )}
        {canManageUsers && activeTab ? (
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-slate-400">{activeTab.subtitle}</p>
            <InfoTooltip label={`About ${activeTab.label}`}>{activeTab.help}</InfoTooltip>
          </div>
        ) : null}
      </header>

      {tab === "overview" ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <WeekStepper
              onPrev={() =>
                setWeekStart(toDateKey(addDays(fromDateKey(weekStart), -7)))
              }
              onToday={() => setWeekStart(toDateKey(getMonday()))}
              onNext={() =>
                setWeekStart(toDateKey(addDays(fromDateKey(weekStart), 7)))
              }
            />
            <span className="ml-auto text-xs text-slate-300/80">{weekRangeLabel}</span>
            <FreshnessPill updatedAt={overviewUpdatedAt} loading={overviewLoading} />
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

      {tab === "mail_tracking" && canManageUsers ? <MailTrackingPanel /> : null}

      {tab === "users" && canManageUsers ? (
        <div className="mt-5 space-y-4">
          <div className="flex justify-end">
            <FreshnessPill updatedAt={usersUpdatedAt} loading={usersLoading} />
          </div>
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
        </div>
      ) : null}
    </section>
  );
}
