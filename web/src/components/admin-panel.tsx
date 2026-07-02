"use client";

import { Notice } from "@/components/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { TimeTrackerPanel } from "@/components/time-tracker-panel";
import { AdminOverviewStats } from "@/components/admin-overview-stats";
import { AdminReminderControls } from "@/components/admin-reminder-controls";
import { AdminMailSettings } from "@/components/admin-mail-settings";
import { AdminAuditLog } from "@/components/admin-audit-log";
import dynamic from "next/dynamic";

// The insights charts are admin-only and tab-gated; keep them out of the panel chunk.
const MailTrackingPanel = dynamic(
  () => import("@/components/mail-tracking-panel").then((m) => m.MailTrackingPanel),
  { ssr: false },
);
import { AdminOnboardingPanel } from "@/components/admin-onboarding-panel";
import { WeekStepper } from "@/components/week-stepper";
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

type AdminSection =
  | "overview"
  | "time"
  | "onboarding"
  | "mail_tracking"
  | "users"
  | "reminders"
  | "mail_ai"
  | "audit";

const ROLE_OPTIONS: Array<{ value: UserRole | "none"; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "eu_pilot", label: "EU Pilot" },
  { value: "us_pilot", label: "US Pilot" },
  { value: "hr", label: "HR" },
  { value: "none", label: "Not selected" },
];

export type AdminPanelProps = {
  /** When false, only the read-only Team time section is available (HR view). */
  canManageUsers?: boolean;
};

const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string; adminOnly: boolean }> = [
  { id: "overview", label: "Overview", adminOnly: true },
  { id: "time", label: "Time", adminOnly: false },
  { id: "onboarding", label: "Onboarding", adminOnly: true },
  { id: "mail_tracking", label: "Mail tracking", adminOnly: true },
  { id: "users", label: "Users & roles", adminOnly: true },
  { id: "reminders", label: "Reminders", adminOnly: true },
  { id: "mail_ai", label: "Mail & AI", adminOnly: true },
  { id: "audit", label: "Audit log", adminOnly: true },
];

const BUBBLES: Array<{ left: string; size: string; duration: string; delay: string }> = [
  { left: "7%", size: "8px", duration: "9.5s", delay: "0s" },
  { left: "24%", size: "7px", duration: "11s", delay: "-2.2s" },
  { left: "39%", size: "10px", duration: "10.2s", delay: "-1.4s" },
  { left: "57%", size: "8px", duration: "12.4s", delay: "-3.6s" },
  { left: "73%", size: "9px", duration: "9.2s", delay: "-2.8s" },
  { left: "88%", size: "11px", duration: "13.5s", delay: "-5s" },
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
  const [section, setSection] = useState<AdminSection>(canManageUsers ? "overview" : "time");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("");
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

  const visibleSections = useMemo(
    () => ADMIN_SECTIONS.filter((entry) => canManageUsers || !entry.adminOnly),
    [canManageUsers],
  );

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

  const loadOverview = useCallback(async (week: string) => {
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
  }, []);

  // Lazy-load the users table the first time the section opens.
  useEffect(() => {
    if (!canManageUsers) return;
    if (section !== "users") return;
    if (usersFetchedRef.current) return;
    usersFetchedRef.current = true;
    void loadUsers();
  }, [loadUsers, canManageUsers, section]);

  // Load (and reload on week change) the time overview only while it's shown.
  useEffect(() => {
    if (section !== "time") return;
    void loadOverview(weekStart);
  }, [loadOverview, section, weekStart]);

  // Snap HR / non-admins back to the only section they may see.
  useEffect(() => {
    if (!canManageUsers && section !== "time") {
      setSection("time");
    }
  }, [canManageUsers, section]);

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
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekStart]);

  const filteredUsers = useMemo(() => {
    const needle = userFilter.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => user.email.toLowerCase().includes(needle));
  }, [users, userFilter]);

  const activeLabel = useMemo(
    () => visibleSections.find((entry) => entry.id === section)?.label ?? "Admin",
    [visibleSections, section],
  );

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
            className="inline-flex items-center gap-2 rounded-lg border border-glass/15 bg-glass/8 px-3 py-1.5 text-xs text-ink-2 transition hover:bg-glass/12"
          >
            <span aria-hidden>&larr;</span>
            {canManageUsers ? "Back to admin" : "Back to team time"}
          </button>
          <p className="text-xs text-ink-4">Read-only view</p>
        </div>
        <TimeTrackerPanel readOnly apiBase={apiBase} viewingLabel={drilldownEmail || drilldownUserId} />
      </section>
    );
  }

  return (
    <section className="underwater-panel relative overflow-hidden rounded-2xl">
      <div className="relative min-h-0 min-w-0 w-full">
        <div className="bubble-layer pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          {BUBBLES.map((bubble, idx) => (
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
              className="shrink-0 border-b border-glass/10 bg-overlay/40 md:w-[min(100%,240px)] md:border-b-0 md:border-r md:border-glass/10"
              aria-label="Admin sections"
            >
              <div className="border-b border-glass/10 px-3 pb-3 pt-3 md:px-4 md:pb-4 md:pt-5">
                <h1 className="text-base font-semibold uppercase tracking-[0.15em] text-ink md:text-lg">
                  {canManageUsers ? "Admin" : "Team time"}
                </h1>
              </div>
              <ul
                className="max-h-[42vh] overflow-y-auto px-0 py-3 md:max-h-[calc(70vh-88px)] md:py-4"
                role="list"
              >
                {visibleSections.map((entry) => {
                  const active = section === entry.id;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSection(entry.id)}
                        className={`flex w-full items-center border-l-[3px] px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "border-amber-400 bg-amber-400/15 font-medium text-warn"
                            : "border-transparent text-ink-4 hover:bg-glass/[0.06] hover:text-ink-2"
                        }`}
                      >
                        <span className="truncate">{entry.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="min-h-[280px] min-w-0 flex-1 overflow-y-auto border-t border-glass/5 bg-overlay/20 p-4 md:border-t-0 md:p-6">
              <h2 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">
                {activeLabel}
              </h2>

              {section === "overview" && canManageUsers ? <AdminOverviewStats /> : null}

              {section === "reminders" && canManageUsers ? <AdminReminderControls /> : null}

              {section === "mail_ai" && canManageUsers ? <AdminMailSettings /> : null}

              {section === "audit" && canManageUsers ? <AdminAuditLog /> : null}

              {section === "onboarding" && canManageUsers ? (
                <div className="mt-5">
                  <AdminOnboardingPanel />
                </div>
              ) : null}

              {section === "mail_tracking" && canManageUsers ? (
                <div className="mt-5">
                  <MailTrackingPanel />
                </div>
              ) : null}

              {section === "time" ? (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <WeekStepper
                      onPrev={() => setWeekStart(toDateKey(addDays(fromDateKey(weekStart), -7)))}
                      onToday={() => setWeekStart(toDateKey(getMonday()))}
                      onNext={() => setWeekStart(toDateKey(addDays(fromDateKey(weekStart), 7)))}
                    />
                    <span className="ml-auto text-xs text-ink-3/80">{weekRangeLabel}</span>
                    <FreshnessPill updatedAt={overviewUpdatedAt} loading={overviewLoading} />
                  </div>

                  {overviewError ? (
                    <Notice>
                      {overviewError}
                    </Notice>
                  ) : null}

                  <div className="relative">
                    {overviewUpdatedAt != null ? (
                      <span key={`sweep-${overviewUpdatedAt}`} aria-hidden className="data-refresh-sweep" />
                    ) : null}
                    <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/5">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-glass/5 text-xs uppercase tracking-wider text-ink-3/80">
                          <tr>
                            <th className="px-3 py-2">User</th>
                            <th className="px-3 py-2">Role</th>
                            <th className="px-3 py-2 text-right">Weekly total</th>
                            <th className="px-3 py-2 text-right">Overtime bank</th>
                            <th className="px-3 py-2 text-right">Missing days</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {overviewLoading && !overview ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-3/80">
                                Loading overview...
                              </td>
                            </tr>
                          ) : overview?.users.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-3/80">
                                No users found.
                              </td>
                            </tr>
                          ) : (
                            overview?.users.map((user) => (
                              <tr key={user.user_id} className="border-t border-glass/5 align-middle">
                                <td className="px-3 py-2">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-ink">{user.email || user.user_id}</span>
                                    {user.error ? (
                                      <span className="text-[10px] text-danger">{user.error}</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-ink-3">{userRoleLabel(user.role)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmtHM(user.weekly_total_mins)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmtSignedHM(user.overtime_bank_mins)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {user.missing_days > 0 ? (
                                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-danger">
                                      {user.missing_days}
                                    </span>
                                  ) : (
                                    <span className="text-ink-4">0</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrilldownUserId(user.user_id);
                                      setDrilldownEmail(user.email);
                                    }}
                                    className="rounded-lg border border-glass/20 bg-glass/10 px-2 py-1 text-xs hover:bg-glass/15"
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
                </div>
              ) : null}

              {section === "users" && canManageUsers ? (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      value={userFilter}
                      onChange={(event) => setUserFilter(event.target.value)}
                      placeholder="Filter by email"
                      autoComplete="off"
                      className="w-full rounded-lg border border-glass/15 bg-glass/5 py-2 pl-3 pr-2 text-xs text-ink-2 placeholder:text-ink-5 focus:border-amber-400/40 focus:outline-none sm:w-64"
                    />
                    <FreshnessPill updatedAt={usersUpdatedAt} loading={usersLoading} />
                  </div>
                  {usersError ? (
                    <Notice>
                      {usersError}
                    </Notice>
                  ) : null}
                  {roleError ? (
                    <Notice>
                      {roleError}
                    </Notice>
                  ) : null}

                  <div className="relative">
                    {usersUpdatedAt != null ? (
                      <span key={`sweep-${usersUpdatedAt}`} aria-hidden className="data-refresh-sweep" />
                    ) : null}
                    <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/5">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-glass/5 text-xs uppercase tracking-wider text-ink-3/80">
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
                              <td colSpan={4} className="px-3 py-6 text-center text-sm text-ink-3/80">
                                Loading users...
                              </td>
                            </tr>
                          ) : filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-sm text-ink-3/80">
                                {users.length === 0 ? "No users found." : "No users match your filter."}
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((user) => {
                              const pending = Boolean(rolePending[user.id]);
                              const currentValue: UserRole | "none" = user.role ?? "none";
                              return (
                                <tr key={user.id} className="border-t border-glass/5">
                                  <td className="px-3 py-2 text-sm text-ink">{user.email || user.id}</td>
                                  <td className="px-3 py-2 text-xs text-ink-3">{userRoleLabel(user.role)}</td>
                                  <td className="px-3 py-2 text-xs text-ink-4">
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
                                      className="rounded-lg border border-glass/20 bg-panel/80 px-2 py-1 text-xs text-ink"
                                    >
                                      {ROLE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    {pending ? (
                                      <span className="ml-2 text-[10px] text-ink-4">Saving...</span>
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
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
