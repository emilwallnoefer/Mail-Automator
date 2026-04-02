"use client";

import { useEffect, useMemo, useState } from "react";

type OnboardingItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  estimatedMinutes: number;
};

type OnboardingSection = {
  id: string;
  title: string;
  items: OnboardingItem[];
};

type OnboardingWorkspaceProps = {
  email: string;
  sections: OnboardingSection[];
};

type ProgressStore = {
  progress: Record<string, number>;
  startedAt?: string;
  updatedAt?: string;
};

type FilterMode = "all" | "todo" | "done";

export function OnboardingWorkspace({ email, sections }: OnboardingWorkspaceProps) {
  const storageKey = `onboarding-progress:${email.toLowerCase()}`;
  const [store, setStore] = useState<ProgressStore>(() => {
    if (typeof window === "undefined") return { progress: {} };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { progress: {} };
      const parsed = JSON.parse(raw) as
        | ProgressStore
        | { done?: Record<string, boolean>; progress?: Record<string, number> };
      if ("progress" in parsed && typeof parsed.progress === "object" && parsed.progress) {
        return parsed as ProgressStore;
      }
      if ("done" in parsed && typeof parsed.done === "object" && parsed.done) {
        const converted: Record<string, number> = {};
        for (const [id, value] of Object.entries(parsed.done)) {
          converted[id] = value ? 100 : 0;
        }
        return { progress: converted };
      }
      return { progress: {} };
    } catch {
      return { progress: {} };
    }
  });
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? "");

  const progressByItem = useMemo(() => store.progress ?? {}, [store.progress]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    } catch {
      // Ignore write errors (private mode/storage quota).
    }
  }, [store, storageKey]);

  const totalEstimatedMinutes = useMemo(
    () => sections.reduce((acc, section) => acc + section.items.reduce((innerAcc, item) => innerAcc + item.estimatedMinutes, 0), 0),
    [sections],
  );
  const progressPoints = useMemo(
    () =>
      sections.reduce(
        (acc, section) =>
          acc +
          section.items.reduce(
            (innerAcc, item) => innerAcc + (progressByItem[item.id] ?? 0) * item.estimatedMinutes,
            0,
          ),
        0,
      ),
    [progressByItem, sections],
  );
  const maxProgressPoints = totalEstimatedMinutes * 100;
  const progressPct = maxProgressPoints > 0 ? Math.round((progressPoints / maxProgressPoints) * 100) : 0;
  const completedEstimatedMinutes = useMemo(
    () =>
      sections.reduce(
        (acc, section) =>
          acc +
          section.items.reduce(
            (innerAcc, item) => innerAcc + ((progressByItem[item.id] ?? 0) / 100) * item.estimatedMinutes,
            0,
          ),
        0,
      ),
    [progressByItem, sections],
  );
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const selectedSection = sectionById.get(activeSection) ?? sections[0];
  const selectedDone = selectedSection
    ? selectedSection.items.filter((item) => (progressByItem[item.id] ?? 0) >= 100).length
    : 0;
  const selectedPct =
    selectedSection && selectedSection.items.length > 0
      ? Math.round(
          selectedSection.items.reduce(
            (acc, item) => acc + ((progressByItem[item.id] ?? 0) * item.estimatedMinutes) / 100,
            0,
          ) /
            selectedSection.items.reduce((acc, item) => acc + item.estimatedMinutes, 0) *
            100,
        )
      : 0;

  function formatHours(minutes: number) {
    return `${(minutes / 60).toFixed(1)}h`;
  }

  const filteredSectionItems = useMemo(() => {
    if (!selectedSection) return [];
    const term = query.trim().toLowerCase();
    return selectedSection.items.filter((item) => {
      const textMatch =
        !term || item.title.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
      const statusMatch =
        filterMode === "all" ||
        (filterMode === "done" ? (progressByItem[item.id] ?? 0) >= 100 : (progressByItem[item.id] ?? 0) < 100);
      return textMatch && statusMatch;
    });
  }, [filterMode, progressByItem, query, selectedSection]);

  function adjustItemProgress(itemId: string, delta: number) {
    setStore((prev) => {
      const current = (prev.progress ?? {})[itemId] ?? 0;
      const nextValue = Math.max(0, Math.min(100, current + delta));
      const nextProgress = { ...(prev.progress ?? {}), [itemId]: nextValue };
      return {
        ...prev,
        progress: nextProgress,
        startedAt: prev.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function markSection(sectionId: string, value: boolean) {
    const section = sectionById.get(sectionId);
    if (!section) return;
    setStore((prev) => {
      const nextProgress = { ...(prev.progress ?? {}) };
      for (const item of section.items) {
        nextProgress[item.id] = value ? 100 : 0;
      }
      return {
        ...prev,
        progress: nextProgress,
        startedAt: prev.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function resetProgress() {
    setStore({
      progress: {},
      startedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="glass-card p-5 md:p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200/75">Pilot onboarding</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Training control center</h2>
        <p className="mt-2 text-sm text-slate-300/90">
          Follow the flow: pick a section, open each resource, then mark it done.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Overall</p>
            <p className="mt-1 text-xl font-semibold text-cyan-200">{progressPct}%</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Done time</p>
            <p className="mt-1 text-xl font-semibold text-cyan-200">
              {formatHours(completedEstimatedMinutes)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Remaining time</p>
            <p className="mt-1 text-xl font-semibold text-cyan-200">
              {formatHours(Math.max(0, totalEstimatedMinutes - completedEstimatedMinutes))}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Plan total</p>
            <p className="mt-1 text-xl font-semibold text-cyan-200">{formatHours(totalEstimatedMinutes)}</p>
          </div>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <aside className="glass-card h-fit self-start p-4 lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">1. Choose section</p>
            <button
              type="button"
              onClick={resetProgress}
              className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-white/15"
            >
              Reset
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {sections.map((section) => {
              const sectionDone = section.items.filter((item) => (progressByItem[item.id] ?? 0) >= 100).length;
              const isActive = activeSection === section.id;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    isActive
                      ? "border-cyan-300/60 bg-cyan-500/20"
                      : "border-white/10 bg-white/5 hover:border-cyan-300/60 hover:bg-white/10"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-100">{section.title}</p>
                  <p className="mt-1 text-[11px] text-cyan-200/90">
                    {sectionDone}/{section.items.length} completed
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="glass-card p-4 md:p-5">
          {selectedSection ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">2. Complete trainings</p>
                  <h3 className="mt-1 text-lg font-semibold">{selectedSection.title}</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    {selectedDone}/{selectedSection.items.length} completed ({selectedPct}%)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => markSection(selectedSection.id, true)}
                    className="rounded-md border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    Mark all done
                  </button>
                  <button
                    type="button"
                    onClick={() => markSection(selectedSection.id, false)}
                    className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/15"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search in this section..."
                  className="h-9 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-slate-100 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`rounded-md border px-2.5 py-1 text-xs ${filterMode === "all" ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100" : "border-white/15 bg-white/10 text-slate-200"}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("todo")}
                  className={`rounded-md border px-2.5 py-1 text-xs ${filterMode === "todo" ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100" : "border-white/15 bg-white/10 text-slate-200"}`}
                >
                  To do
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("done")}
                  className={`rounded-md border px-2.5 py-1 text-xs ${filterMode === "done" ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100" : "border-white/15 bg-white/10 text-slate-200"}`}
                >
                  Done
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-300">
                Showing {filteredSectionItems.length} of {selectedSection.items.length} resources
              </p>

              <div className="mt-3 space-y-2.5">
                {filteredSectionItems.map((item, idx) => (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      (progressByItem[item.id] ?? 0) >= 100
                        ? "border-emerald-300/45 bg-emerald-500/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/80">
                          Step {String(idx + 1).padStart(2, "0")}
                        </p>
                        <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block">
                          <p className="text-sm font-medium text-slate-100">{item.title}</p>
                        </a>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300/80">{item.description}</p>
                        <p className="mt-1 text-[11px] text-cyan-200/80">
                          Estimated time: {item.estimatedMinutes} min
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="text-[11px] text-cyan-200">{progressByItem[item.id] ?? 0}%</p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustItemProgress(item.id, -25)}
                            className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] text-slate-200 transition hover:bg-white/15"
                          >
                            -25%
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustItemProgress(item.id, 25)}
                            className="rounded-md border border-cyan-300/45 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/25"
                          >
                            +25%
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">Add/Remove progress</p>
                      </div>
                    </div>
                  </article>
                ))}
                {filteredSectionItems.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    No resources match your current search/filter.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
