"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthNavbar } from "@/components/auth-navbar";
import { ChatWidget } from "@/components/chat-widget";
import { MailComposerPanel } from "@/components/mail-composer/mail-composer-panel";
import { useMailComposer } from "@/components/mail-composer/use-mail-composer";
import { TimeTrackerPanel, type WeekResponse } from "@/components/time-tracker-panel";
import { Notice } from "@/components/ui";
import { playUiSound } from "@/lib/ui-sounds";
import { createClient } from "@/lib/supabase/client";
import { LATEST_RELEASE } from "@/lib/release-notes";
import { userRoleLabel, type UserRole } from "@/lib/user-role";

function PanelLoading() {
  return <div className="min-h-[40vh] animate-pulse rounded-2xl border border-glass/10 bg-glass/5" aria-hidden />;
}

// Settings and Admin sit behind a click for every user, so their code (and the
// admin insights charts behind AdminPanel) stays out of the dashboard's first
// bundle. Mail/Time stay static: one of them is the landing module per role.
const SettingsPanel = dynamic(
  () => import("@/components/settings-panel").then((m) => m.SettingsPanel),
  { ssr: false, loading: PanelLoading },
);
const AdminPanel = dynamic(
  () => import("@/components/admin-panel").then((m) => m.AdminPanel),
  { ssr: false, loading: PanelLoading },
);

type DashboardShellProps = {
  email: string;
  initialRole: UserRole | null;
  isAdmin?: boolean;
  initialWeek?: WeekResponse | null;
};

type ModuleKey = "mail" | "time" | "settings" | "admin";

// One-time flag: the first-launch README prompt is for brand-new users only,
// so it keys on "seen ever" rather than the deploy/version (which used to
// re-trigger it on every release).
const PROGRAM_README_PROMPT_SEEN_KEY = "ma_program_readme_prompt_seen_v1";
// Tracks the last release whose "What's new" popup the user dismissed.
const WHATS_NEW_SEEN_VERSION_KEY = "ma_whats_new_seen_version_v1";

function greetingFromEmail(addr: string): string {
  const local = addr.split("@")[0]?.trim() ?? "";
  const first = local.split(/[._-]/)[0] ?? local;
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCog({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.37.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

const MODULE_CARD_CLASS =
  "group relative flex flex-col overflow-hidden rounded-2xl border border-glass/[0.09] bg-gradient-to-br from-panel/95 via-surface/90 to-surface/80 p-6 text-left shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55)] ring-1 ring-glass/[0.04] transition duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export function DashboardShell({ email, initialRole, isAdmin = false, initialWeek = null }: DashboardShellProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [beginAnimating, setBeginAnimating] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>(
    initialRole === "sales" || initialRole === "hr" ? "time" : "mail",
  );
  const [userRole, setUserRole] = useState<UserRole | null>(initialRole);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [showProgramReadmePrompt, setShowProgramReadmePrompt] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [settingsReadmeOpenToken, setSettingsReadmeOpenToken] = useState(0);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; gmail_email?: string | null }>({
    connected: false,
  });
  // Current Time Tracker week, warmed in the background on dashboard load so the
  // Time Logger opens instantly. Seeded from the SSR week when available.
  const [prefetchedWeek, setPrefetchedWeek] = useState<WeekResponse | null>(initialWeek);
  const weekPrefetchedRef = useRef(false);

  const composer = useMailComposer(userRole);

  const availableModules = useMemo<ModuleKey[]>(() => {
    const base: ModuleKey[] =
      userRole === "sales" || userRole === "hr"
        ? ["time", "settings"]
        : ["mail", "time", "settings"];
    if (isAdmin || userRole === "hr") base.push("admin");
    return base;
  }, [userRole, isAdmin]);

  const canManageUsers = isAdmin;
  const adminModuleLabel = canManageUsers ? "Admin" : "Team time";

  // Warm the Time Tracker's current week as soon as the dashboard loads, so the
  // Time Logger shows data immediately on open instead of fetching on mount.
  // Deliberately light: one idle-time request, no travel-sheet lookup, run once,
  // and skipped entirely when the SSR already seeded the current week.
  useEffect(() => {
    if (weekPrefetchedRef.current) return;
    if (!availableModules.includes("time")) return;

    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
      monday.getDate(),
    ).padStart(2, "0")}`;

    // Already have this exact week from SSR — nothing to warm.
    if (initialWeek?.week_start === weekKey) {
      weekPrefetchedRef.current = true;
      return;
    }
    weekPrefetchedRef.current = true;

    let cancelled = false;
    let timeoutHandle: number | undefined;
    const run = () => {
      fetch(`/api/time-tracker?weekStart=${encodeURIComponent(weekKey)}&includeTravel=0`)
        .then((res) => (res.ok ? (res.json() as Promise<WeekResponse>) : null))
        .then((week) => {
          if (!cancelled && week?.week_start) setPrefetchedWeek(week);
        })
        .catch(() => {
          // Best-effort warm-up; the panel still fetches on open if this fails.
        });
    };

    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    }).requestIdleCallback;
    if (typeof idle === "function") {
      idle(run, { timeout: 2000 });
    } else {
      timeoutHandle = window.setTimeout(run, 800);
    }

    return () => {
      cancelled = true;
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [availableModules, initialWeek]);

  useEffect(() => {
    (async () => {
      if (userRole === "sales" || userRole === "hr") return;
      const response = await fetch("/api/gmail/status");
      if (!response.ok) return;
      const data = (await response.json()) as { connected: boolean; gmail_email?: string | null };
      setGmailStatus(data);
    })();
  }, [userRole]);

  useEffect(() => {
    try {
      const firstLaunchSeen = window.localStorage.getItem(PROGRAM_README_PROMPT_SEEN_KEY);
      if (!firstLaunchSeen) {
        // Brand-new user: show the one-time first-launch README prompt, and mark
        // the current release as already seen so they only ever get the
        // "What's new" popup for *future* releases (everything is new to them now).
        setShowProgramReadmePrompt(true);
        try {
          window.localStorage.setItem(WHATS_NEW_SEEN_VERSION_KEY, LATEST_RELEASE.version);
        } catch {
          // Ignore storage errors.
        }
        return;
      }
      // Returning user: surface the "What's new" popup once per release.
      const seenVersion = window.localStorage.getItem(WHATS_NEW_SEEN_VERSION_KEY) || "";
      if (seenVersion !== LATEST_RELEASE.version) {
        setShowWhatsNew(true);
      }
    } catch {
      // Storage blocked (e.g. private mode): stay quiet rather than nagging.
    }
  }, []);

  useEffect(() => {
    if (availableModules.includes(activeModule)) return;
    setActiveModule(availableModules[0]);
  }, [activeModule, availableModules]);

  function dismissProgramReadmePrompt() {
    setShowProgramReadmePrompt(false);
    try {
      window.localStorage.setItem(PROGRAM_README_PROMPT_SEEN_KEY, "1");
    } catch {
      // Ignore storage errors to avoid blocking interaction.
    }
  }

  function dismissWhatsNew() {
    setShowWhatsNew(false);
    try {
      window.localStorage.setItem(WHATS_NEW_SEEN_VERSION_KEY, LATEST_RELEASE.version);
    } catch {
      // Ignore storage errors to avoid blocking interaction.
    }
  }

  async function handleSelectRole(nextRole: UserRole) {
    if (roleSaving) return;
    setRoleSaving(true);
    setRoleError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ data: { role: nextRole } });
      if (updateError) throw updateError;
      setUserRole(nextRole);
      if (nextRole === "sales" || nextRole === "hr") {
        setActiveModule("time");
      }
    } catch (err) {
      setRoleError((err as Error).message || "Could not save role.");
    } finally {
      setRoleSaving(false);
    }
  }

  function handleBeginAutomating() {
    if (beginAnimating) return;
    setBeginAnimating(true);
    setTimeout(() => {
      setShowComposer(true);
      setBeginAnimating(false);
    }, 260);
  }

  function openModuleCard(module: ModuleKey) {
    if (activeModule !== module) playUiSound("switchWhoosh");
    setActiveModule(module);
    handleBeginAutomating();
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-surface text-ink">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell">
        <AuthNavbar
          email={email}
          gmailConnected={gmailStatus.connected}
          gmailEmail={gmailStatus.gmail_email}
          activeModule={activeModule}
          availableModules={availableModules}
          showGmailStatus={userRole !== "sales" && userRole !== "hr"}
          userRole={userRole}
          adminModuleLabel={adminModuleLabel}
          onSelectModule={(module) => {
            if (!availableModules.includes(module)) return;
            if (module !== activeModule) playUiSound("switchWhoosh");
            setActiveModule(module);
            setShowComposer(true);
          }}
        />

        {showComposer ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass/[0.07] pb-4">
            <button
              type="button"
              onClick={() => {
                playUiSound("switchWhoosh");
                setShowComposer(false);
              }}
              className="group inline-flex items-center gap-2 rounded-xl border border-glass/10 bg-overlay/40 px-3.5 py-2 text-xs font-medium text-ink-3 shadow-sm shadow-shade/20 backdrop-blur-sm transition hover:border-accent/25 hover:bg-glass/[0.06] hover:text-ink"
            >
              <span className="transition group-hover:-translate-x-0.5" aria-hidden>
                ←
              </span>
              Workspace overview
            </button>
            <p className="text-[11px] text-ink-5">
              {activeModule === "mail"
                ? "Mail Composer"
                : activeModule === "time"
                  ? "Time Tracker"
                  : activeModule === "admin"
                    ? adminModuleLabel
                    : "Settings"}
            </p>
          </div>
        ) : null}

        {!showComposer && (
          <motion.div
            // Render the workspace home settled on first paint (no entrance fade/slide,
            // which read as the page "redrawing" on every load). `initial={false}` keeps
            // the click-to-open exit transition below working via `beginAnimating`.
            initial={false}
            animate={beginAnimating ? { opacity: 0, scale: 0.98, y: -8 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex min-h-[min(72vh,640px)] flex-col justify-center"
          >
            <div className="dashboard-mesh" aria-hidden />
            <div className="dashboard-mesh-fade" aria-hidden />
            <div className="relative z-[1] mx-auto w-full max-w-5xl">
              <div className="mb-10 md:mb-14">
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-accent-soft/65">Workspace</p>
                <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink md:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
                  {timeGreeting()}, {greetingFromEmail(email)}
                </h1>
                <p className="mt-4 max-w-lg text-pretty text-sm leading-relaxed text-ink-4 md:text-base">
                  Open a module below. Everything runs in your browser—pick up where you left off anytime.
                </p>
                {userRole ? (
                  <span className="mt-5 inline-flex items-center rounded-full border border-glass/10 bg-glass/[0.06] px-3 py-1 text-[11px] font-medium tracking-wide text-ink-3">
                    {userRoleLabel(userRole)}
                  </span>
                ) : null}
              </div>

              <div
                className={`grid gap-4 ${availableModules.filter((m) => m !== "admin").length >= 3 ? "md:grid-cols-3" : "sm:mx-auto sm:max-w-2xl sm:grid-cols-2"}`}
              >
                {availableModules.includes("settings") ? (
                  <motion.button
                    type="button"
                    initial={false}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openModuleCard("settings")}
                    className={`${MODULE_CARD_CLASS} hover:border-violet-400/35 hover:shadow-[0_28px_56px_-12px_rgba(167,139,250,0.12)] focus-visible:outline-violet-400/80`}
                  >
                    <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-400/12 blur-2xl transition group-hover:bg-violet-400/22" aria-hidden />
                    <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
                      <IconCog className="h-5 w-5" />
                    </span>
                    <span className="text-lg font-semibold text-ink">Settings</span>
                    <span className="mt-2 text-sm leading-relaxed text-ink-4">
                      Gmail, signatures, travel mapping, sounds, and account tools.
                    </span>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-200/90">
                      Continue
                      <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </motion.button>
                ) : null}

                {availableModules.includes("mail") ? (
                  <motion.button
                    type="button"
                    initial={false}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openModuleCard("mail")}
                    className={`${MODULE_CARD_CLASS} hover:border-accent/35 hover:shadow-[0_28px_56px_-12px_rgba(34,211,238,0.12)] focus-visible:outline-accent/80`}
                  >
                    <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/15 blur-2xl transition group-hover:bg-accent/25" aria-hidden />
                    <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-soft">
                      <IconMail className="h-5 w-5" />
                    </span>
                    <span className="text-lg font-semibold text-ink">Mail Composer</span>
                    <span className="mt-2 text-sm leading-relaxed text-ink-4">
                      Training email drafts and Gmail handoff in one flow.
                    </span>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-soft/90">
                      Continue
                      <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </motion.button>
                ) : null}

                <motion.button
                  type="button"
                  initial={false}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openModuleCard("time")}
                  className={`${MODULE_CARD_CLASS} hover:border-emerald-400/35 hover:shadow-[0_28px_56px_-12px_rgba(52,211,153,0.1)] focus-visible:outline-emerald-400/80`}
                >
                  <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/12 blur-2xl transition group-hover:bg-emerald-400/22" aria-hidden />
                  <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-positive">
                    <IconClock className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-semibold text-ink">Time Tracker</span>
                  <span className="mt-2 text-sm leading-relaxed text-ink-4">
                    Workdays, breaks, compensation time, and overtime in one place.
                  </span>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-positive/90">
                    Continue
                    <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </motion.button>

              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {showComposer ? (
            <motion.section
              key="composer"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-4"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeModule}
                  initial={{ opacity: 0, y: 8, scale: 0.996 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.996 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeModule === "time" ? (
                    <TimeTrackerPanel initialWeek={prefetchedWeek} />
                  ) : activeModule === "admin" ? (
                    <AdminPanel canManageUsers={canManageUsers} />
                  ) : activeModule === "settings" ? (
                    <SettingsPanel
                      email={email}
                      autoOpenProgramReadmeToken={settingsReadmeOpenToken}
                      userRole={userRole ?? "eu_pilot"}
                    />
                  ) : (
                    <MailComposerPanel
                      composer={composer}
                      userRole={userRole}
                      gmailConnected={gmailStatus.connected}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.section>
          ) : null}
        </AnimatePresence>

      </section>
      <ChatWidget
        bottomOffsetRem={showProgramReadmePrompt ? 11 : showWhatsNew ? 12 : 1}
        isAdmin={isAdmin}
      />
      {showProgramReadmePrompt ? (
        <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,22rem)] rounded-xl border border-glass/20 bg-surface/92 p-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-accent-soft/75">First launch</p>
            </div>
            <button
              type="button"
              onClick={dismissProgramReadmePrompt}
              className="group rounded-md border border-glass/15 bg-glass/10 px-2 py-1 text-xs text-ink-2 transition hover:bg-glass/15"
              aria-label="Close program readme prompt"
            >
              <span className="inline-block transition-transform duration-200 group-hover:rotate-90" aria-hidden>
                X
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              playUiSound("switchWhoosh");
              setActiveModule("settings");
              setShowComposer(true);
              setSettingsReadmeOpenToken((prev) => prev + 1);
              dismissProgramReadmePrompt();
            }}
            className="mt-3 w-full rounded-lg bg-accent/90 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:-translate-y-px hover:bg-accent"
          >
            Open program README
          </button>
        </div>
      ) : null}
      {showWhatsNew ? (
        <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,22rem)] rounded-xl border border-glass/20 bg-surface/92 p-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.15em] text-accent-soft/75">
                What&apos;s new · {LATEST_RELEASE.date}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{LATEST_RELEASE.title}</p>
            </div>
            <button
              type="button"
              onClick={dismissWhatsNew}
              className="group shrink-0 rounded-md border border-glass/15 bg-glass/10 px-2 py-1 text-xs text-ink-2 transition hover:bg-glass/15"
              aria-label="Dismiss what's new"
            >
              <span className="inline-block transition-transform duration-200 group-hover:rotate-90" aria-hidden>
                X
              </span>
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-ink-3/85">
            {LATEST_RELEASE.highlights.map((highlight, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-accent/80" aria-hidden>
                  •
                </span>
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {userRole == null ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-surface/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-glass/20 bg-surface/95 p-4 shadow-xl">
            <p className="text-[10px] uppercase tracking-[0.15em] text-accent-soft/75">First Login Setup</p>
            <h2 className="mt-2 text-lg font-semibold">Choose your workspace profile</h2>
            <p className="mt-2 text-sm text-ink-3/85">
              This controls which modules and settings you see.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  void handleSelectRole("eu_pilot");
                }}
                disabled={roleSaving}
                className="rounded-lg border border-glass/20 bg-glass/10 px-3 py-2 text-sm font-medium transition hover:-translate-y-px hover:bg-glass/15 disabled:translate-y-0 disabled:opacity-60"
              >
                EU Pilot
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSelectRole("us_pilot");
                }}
                disabled={roleSaving}
                className="rounded-lg border border-glass/20 bg-glass/10 px-3 py-2 text-sm font-medium transition hover:-translate-y-px hover:bg-glass/15 disabled:translate-y-0 disabled:opacity-60"
              >
                US Pilot
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSelectRole("sales");
                }}
                disabled={roleSaving}
                className="rounded-lg border border-accent/60 bg-accent-deep/20 px-3 py-2 text-sm font-medium text-accent-soft transition hover:-translate-y-px hover:bg-accent-deep/30 disabled:translate-y-0 disabled:opacity-60"
              >
                Sales
              </button>
            </div>
            {roleError ? <Notice className="mt-3">{roleError}</Notice> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
