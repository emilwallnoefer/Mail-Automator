"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  CHANGE_OPTIONS,
  DEFAULT_INCLUDED_CHANGE_IDS,
  getChangeOptionLabelDesc,
  getOtherTrainingsOptionsInOrder,
  getThinkificOnlineCoursesInOrder,
  type MailLanguage,
  resourceSectionLabel,
  RESOURCE_SECTION_ORDER,
} from "@/lib/change-options";
import { AuthNavbar } from "@/components/auth-navbar";
import { SettingsPanel } from "@/components/settings-panel";
import { playUiSound, playUiSoundWithCrossfadeFill, stopUiSound } from "@/lib/ui-sounds";
import { createClient } from "@/lib/supabase/client";
import { MAIL_SIGNATURE_DEFAULT_NAME } from "@/lib/mail-signature-presets";

function TimeTrackerPanelSkeleton() {
  return (
    <section
      className="underwater-panel grid min-h-[min(70vh,28rem)] place-content-center rounded-2xl border border-cyan-400/15 bg-slate-950/40 p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="h-10 w-10 animate-pulse rounded-full bg-cyan-400/20" aria-hidden="true" />
        <p className="text-sm text-slate-400">Loading time tracker…</p>
      </div>
    </section>
  );
}

function prefetchTimeTrackerPanel() {
  if (typeof window === "undefined") return;
  void import("@/components/time-tracker-panel");
}

const TimeTrackerPanel = dynamic(
  () => import("@/components/time-tracker-panel").then((mod) => ({ default: mod.TimeTrackerPanel })),
  { loading: TimeTrackerPanelSkeleton, ssr: true },
);

type DashboardShellProps = {
  email: string;
  initialRole: "pilot" | "sales" | null;
};

const PROGRAM_README_PROMPT_SEEN_DEPLOY_KEY = "ma_program_readme_prompt_seen_deploy_v1";
const SUBJECT_WRITE_STEP = 2;
const BODY_WRITE_STEP = 10;
const SUBJECT_WRITE_INTERVAL_MS = 20;
const BODY_WRITE_INTERVAL_MS = 17;

type GenerateResponse = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
  selected_change_ids?: string[];
  inline_attachments?: Array<{ contentId: string; mimeType: string; base64: string }>;
};

function isSameGeneratedDraft(previous: GenerateResponse | null, next: GenerateResponse) {
  if (!previous) return false;
  if (previous.template_id !== next.template_id) return false;
  if (previous.subject !== next.subject) return false;
  if (previous.body !== next.body) return false;
  if (previous.html_body !== next.html_body) return false;
  const prevChanges = previous.selected_change_ids ?? [];
  const nextChanges = next.selected_change_ids ?? [];
  if (prevChanges.length !== nextChanges.length) return false;
  return prevChanges.every((value, index) => value === nextChanges[index]);
}

type FormState = {
  mail_type: "" | "pre" | "post";
  template_variant: "" | "lausanne" | "abroad";
  language: "" | MailLanguage;
  training_type: "" | "intro_1day" | "aiim_3day";
  recipient_name: string;
  recipient_optional: string;
  company_name: string;
  use_case: string;
  date: string;
  location: string;
  to: string;
  included_change_ids: string[];
  /** Closing name in generated training emails; synced from Settings. */
  signature_name: string;
};

const INITIAL_FORM_STATE: FormState = {
  mail_type: "",
  template_variant: "",
  language: "",
  training_type: "",
  recipient_name: "",
  recipient_optional: "",
  company_name: "",
  use_case: "",
  date: "",
  location: "",
  to: "",
  included_change_ids: [...DEFAULT_INCLUDED_CHANGE_IDS],
  signature_name: MAIL_SIGNATURE_DEFAULT_NAME,
};

function ProgressiveField({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function composerSegmentClass(active: boolean) {
  return [
    "rounded-lg border px-3 py-2.5 text-sm font-medium transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/90",
    active
      ? "border-cyan-400/80 bg-cyan-400/90 text-slate-900 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
      : "border-white/15 bg-white/10 text-slate-200 hover:border-white/25 hover:bg-white/14",
  ].join(" ");
}

function ComposerChoiceRow({
  label,
  children,
  columns = 2,
}: {
  label: string;
  children: ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400/90">{label}</p>
      <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>{children}</div>
    </div>
  );
}

export function DashboardShell({ email, initialRole }: DashboardShellProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [showComposer, setShowComposer] = useState(initialRole === "sales");
  const [beginAnimating, setBeginAnimating] = useState(false);
  const [changesTouched, setChangesTouched] = useState(false);
  const [activeModule, setActiveModule] = useState<"mail" | "time" | "settings">(initialRole === "sales" ? "time" : "mail");
  const [userRole, setUserRole] = useState<"pilot" | "sales" | null>(initialRole);
  const [roleSaving, setRoleSaving] = useState(false);
  const [showProgramReadmePrompt, setShowProgramReadmePrompt] = useState(false);
  const [settingsReadmeOpenToken, setSettingsReadmeOpenToken] = useState(0);
  const [currentDeployKey, setCurrentDeployKey] = useState("local-dev");
  const [animatedPreviewSubject, setAnimatedPreviewSubject] = useState("");
  const [animatedPreviewBody, setAnimatedPreviewBody] = useState("");
  const previousPreviewWritingRef = useRef(false);

  const shouldShowLanguage = Boolean(form.mail_type);
  const shouldShowVariant = shouldShowLanguage && form.mail_type === "pre";
  const shouldShowTrainingType =
    form.mail_type === "post"
      ? shouldShowLanguage
      : shouldShowVariant && Boolean(form.template_variant);
  const shouldShowRecipient =
    form.mail_type === "post" ? shouldShowTrainingType && Boolean(form.training_type) : Boolean(form.training_type);
  const shouldShowCompany = form.mail_type === "post" && shouldShowRecipient && Boolean(form.recipient_name);
  const shouldShowUseCase = form.mail_type === "post" && shouldShowCompany && Boolean(form.company_name);
  const shouldShowDate =
    form.mail_type === "pre" ? shouldShowRecipient && Boolean(form.recipient_name) : false;
  const isPreLausanne = form.mail_type === "pre" && form.template_variant === "lausanne";
  const shouldShowLocation = form.mail_type === "pre" && Boolean(form.date) && !isPreLausanne;
  const shouldShowChanges = form.mail_type === "post" ? shouldShowUseCase && Boolean(form.use_case) : false;
  const shouldShowRecipientOptional = form.mail_type === "post" ? shouldShowChanges : shouldShowRecipient;

  const composerMailLang: MailLanguage =
    form.language === "en" || form.language === "de" || form.language === "fr" ? form.language : "en";

  const generateDisabled =
    !form.mail_type ||
    !form.language ||
    !form.recipient_name ||
    (form.mail_type === "post" && (!form.training_type || !form.company_name || !form.use_case)) ||
    (form.mail_type === "pre" &&
      (!form.template_variant || !form.training_type || !form.date || (form.template_variant === "abroad" && !form.location)));
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; gmail_email?: string | null }>({
    connected: false,
  });
  const [draftInfo, setDraftInfo] = useState<{ draftId: string; messageId: string } | null>(null);

  const groupedChangeOptions = useMemo(() => {
    const materials = CHANGE_OPTIONS.filter((o) => o.category === "training_material");
    const usefulSections = RESOURCE_SECTION_ORDER.map((sectionId) => ({
      sectionId,
      options:
        sectionId === "online_courses"
          ? getThinkificOnlineCoursesInOrder(CHANGE_OPTIONS)
          : sectionId === "other_trainings"
            ? getOtherTrainingsOptionsInOrder(CHANGE_OPTIONS)
            : CHANGE_OPTIONS.filter((o) => o.category === "useful_link" && o.resourceSection === sectionId),
    })).filter((s) => s.options.length > 0);
    return { materials, usefulSections };
  }, []);

  const selectTemplateVariant = useCallback((nextVariant: FormState["template_variant"]) => {
    if (!nextVariant) return;
    setForm((prev) => ({
      ...prev,
      template_variant: nextVariant,
      location:
        nextVariant === "lausanne"
          ? "Lausanne"
          : prev.location === "Lausanne"
            ? ""
            : prev.location,
    }));
    setChangesTouched(false);
  }, []);

  const selectTrainingType = useCallback((nextTrainingType: FormState["training_type"]) => {
    if (!nextTrainingType) return;
    setForm((prev) => {
      const hasAiim = prev.included_change_ids.includes("material_aiim");
      if (nextTrainingType === "intro_1day") {
        return {
          ...prev,
          training_type: nextTrainingType,
          included_change_ids: prev.included_change_ids.filter((id) => id !== "material_aiim"),
        };
      }
      if (nextTrainingType === "aiim_3day" && !hasAiim) {
        return {
          ...prev,
          training_type: nextTrainingType,
          included_change_ids: [...prev.included_change_ids, "material_aiim"],
        };
      }
      return { ...prev, training_type: nextTrainingType };
    });
    setChangesTouched(false);
  }, []);

  const cards = useMemo(
    () => [
      {
        title: "Mail Automator",
        description: "Generate training emails and create Gmail drafts with one guided flow.",
      },
      {
        title: "Time Tracker",
        description: "Track workdays, breaks, compensation time, and overtime bank in one place.",
      },
      {
        title: "Allround Workspace",
        description: "Switch between tools depending on what you need today.",
      },
    ],
    [],
  );
  const availableModules = useMemo<Array<"mail" | "time" | "settings">>(
    () => (userRole === "sales" ? ["time", "settings"] : ["mail", "time", "settings"]),
    [userRole],
  );
  const visibleCards = useMemo(
    () => (userRole === "sales" ? cards.filter((card) => card.title === "Time Tracker") : cards),
    [cards, userRole],
  );

  useEffect(() => {
    function onMailSignatureSaved(event: Event) {
      const detail = (event as CustomEvent<{ signature_name?: string }>).detail;
      const name = typeof detail?.signature_name === "string" ? detail.signature_name.trim() : "";
      if (!name) return;
      setForm((prev) => ({ ...prev, signature_name: name }));
    }
    window.addEventListener("mail-signature-saved", onMailSignatureSaved);
    return () => window.removeEventListener("mail-signature-saved", onMailSignatureSaved);
  }, []);

  useEffect(() => {
    (async () => {
      if (userRole === "sales") return;
      const sigResponse = await fetch("/api/settings/mail-signature");
      if (sigResponse.ok) {
        const sigData = (await sigResponse.json()) as { signature_name?: string };
        const name = (sigData.signature_name ?? "").trim() || MAIL_SIGNATURE_DEFAULT_NAME;
        setForm((prev) => ({ ...prev, signature_name: name }));
      }
    })();
  }, [userRole]);

  useEffect(() => {
    (async () => {
      if (userRole === "sales") return;
      const response = await fetch("/api/gmail/status");
      if (!response.ok) return;
      const data = (await response.json()) as { connected: boolean; gmail_email?: string | null };
      setGmailStatus(data);
    })();
  }, [userRole]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/app-meta");
        const payload = (await response.json()) as { deploy_key?: string };
        const deployKey = String(payload.deploy_key || "local-dev");
        setCurrentDeployKey(deployKey);
        const seenDeployKey = window.localStorage.getItem(PROGRAM_README_PROMPT_SEEN_DEPLOY_KEY) || "";
        if (seenDeployKey !== deployKey) {
          setShowProgramReadmePrompt(true);
        }
      } catch {
        // If meta fetch fails, keep prompt behavior permissive.
        setShowProgramReadmePrompt(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!result?.subject) {
      setAnimatedPreviewSubject("");
      return;
    }
    const text = result.subject;
    let cursor = 0;
    let timeoutId: number | null = null;
    const step = () => {
      cursor = Math.min(text.length, cursor + SUBJECT_WRITE_STEP);
      setAnimatedPreviewSubject(text.slice(0, cursor));
      if (cursor < text.length) timeoutId = window.setTimeout(step, SUBJECT_WRITE_INTERVAL_MS);
    };
    step();
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [result?.subject]);

  useEffect(() => {
    if (!result?.body) {
      setAnimatedPreviewBody("");
      return;
    }
    const text = result.body;
    let cursor = 0;
    let timeoutId: number | null = null;
    const step = () => {
      cursor = Math.min(text.length, cursor + BODY_WRITE_STEP);
      setAnimatedPreviewBody(text.slice(0, cursor));
      if (cursor < text.length) timeoutId = window.setTimeout(step, BODY_WRITE_INTERVAL_MS);
    };
    step();
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [result?.body]);

  useEffect(() => {
    if (availableModules.includes(activeModule)) return;
    setActiveModule(availableModules[0]);
  }, [activeModule, availableModules]);

  const previewIsWriting = Boolean(result) && (
    animatedPreviewSubject.length < (result?.subject.length ?? 0) ||
    animatedPreviewBody.length < (result?.body.length ?? 0)
  );

  useEffect(() => {
    const wasWriting = previousPreviewWritingRef.current;
    previousPreviewWritingRef.current = previewIsWriting;

    if (!wasWriting && previewIsWriting) {
      const subjectLen = result?.subject.length ?? 0;
      const bodyLen = result?.body.length ?? 0;
      const subjectSteps = subjectLen > 0 ? Math.ceil(subjectLen / SUBJECT_WRITE_STEP) : 0;
      const bodySteps = bodyLen > 0 ? Math.ceil(bodyLen / BODY_WRITE_STEP) : 0;
      const subjectMs = subjectSteps > 0 ? (subjectSteps - 1) * SUBJECT_WRITE_INTERVAL_MS : 0;
      const bodyMs = bodySteps > 0 ? (bodySteps - 1) * BODY_WRITE_INTERVAL_MS : 0;
      const rawEstimateMs = Math.max(subjectMs, bodyMs);
      const paddedEstimateMs = Math.max(2200, Math.round(rawEstimateMs * 2.2));
      playUiSoundWithCrossfadeFill("previewWrite", paddedEstimateMs, {
        fadeInMs: 110,
        fadeOutMs: 220,
        crossfadeMs: 1000,
      });
      return;
    }

    if (wasWriting && !previewIsWriting) {
      stopUiSound("previewWrite", { fadeOutMs: 220 });
    }
  }, [previewIsWriting, result?.subject, result?.body]);

  useEffect(() => {
    return () => {
      stopUiSound("previewWrite", { fadeOutMs: 120 });
    };
  }, []);

  useEffect(() => {
    const run = () => prefetchTimeTrackerPanel();
    if (typeof window === "undefined") return;
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 500);
    return () => clearTimeout(t);
  }, []);

  function renderNeonWriteText(text: string) {
    return text.split("").map((char, index) => (
      <span key={`${index}-${char === "\n" ? "nl" : char}`} className="write-char-neon">
        {char}
      </span>
    ));
  }

  function dismissProgramReadmePrompt() {
    setShowProgramReadmePrompt(false);
    try {
      window.localStorage.setItem(PROGRAM_README_PROMPT_SEEN_DEPLOY_KEY, currentDeployKey);
    } catch {
      // Ignore storage errors to avoid blocking interaction.
    }
  }

  async function handleSelectRole(nextRole: "pilot" | "sales") {
    if (roleSaving) return;
    setRoleSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ data: { role: nextRole } });
      if (updateError) throw updateError;
      setUserRole(nextRole);
      if (nextRole === "sales") {
        prefetchTimeTrackerPanel();
        setActiveModule("time");
        setShowComposer(true);
      }
    } catch (err) {
      setError((err as Error).message || "Could not save role.");
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          template_variant: form.template_variant || undefined,
          training_type: form.training_type || undefined,
          to: form.to || form.recipient_optional || undefined,
          recipient_optional: form.recipient_optional || undefined,
          included_change_ids: changesTouched ? form.included_change_ids : undefined,
          signature_name: form.signature_name.trim() || MAIL_SIGNATURE_DEFAULT_NAME,
        }),
      });
      const data = (await response.json()) as GenerateResponse | { error: string };
      if (!response.ok) throw new Error((data as { error: string }).error || "Generate failed");
      const generated = data as GenerateResponse;
      setResult(generated);
      if (generated.selected_change_ids && generated.selected_change_ids.length > 0) {
        setForm((prev) => ({
          ...prev,
          included_change_ids: generated.selected_change_ids ?? prev.included_change_ids,
        }));
        setChangesTouched(false);
      }
      setDraftInfo(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function handleCreateDraft() {
    if (!result) {
      setError("Generate a draft first.");
      return;
    }

    setDraftLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gmail/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.to || form.recipient_optional || undefined,
          subject: result.subject,
          body: result.body,
          html_body: result.html_body,
          inline_attachments: result.inline_attachments,
        }),
      });
      const data = (await response.json()) as { draftId: string; messageId: string } | { error: string };
      if (!response.ok) throw new Error((data as { error: string }).error || "Failed to create draft");
      setDraftInfo(data as { draftId: string; messageId: string });
      playUiSound("mailSend");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDraftLoading(false);
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

  function handleResetComposer() {
    setForm((prev) => ({
      ...INITIAL_FORM_STATE,
      included_change_ids: [...DEFAULT_INCLUDED_CHANGE_IDS],
      signature_name: prev.signature_name,
    }));
    setResult(null);
    setError(null);
    setDraftInfo(null);
    setChangesTouched(false);
  }

  const handleResourceDetailsToggle = useCallback((e: SyntheticEvent<HTMLDetailsElement>) => {
    const el = e.currentTarget;
    if (!el.open) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        /* nearest: only scroll enough to show expanded content; avoids hiding fields above the accordions. */
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });
    });
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell">
        <AuthNavbar
          email={email}
          gmailConnected={gmailStatus.connected}
          gmailEmail={gmailStatus.gmail_email}
          activeModule={activeModule}
          availableModules={availableModules}
          showGmailStatus={userRole !== "sales"}
          userRole={userRole}
          onWorkspaceModulePointerEnter={(module) => {
            if (module === "time") prefetchTimeTrackerPanel();
          }}
          onSelectModule={(module) => {
            if (!availableModules.includes(module)) return;
            if (module === "time") prefetchTimeTrackerPanel();
            if (module !== activeModule) playUiSound("switchWhoosh");
            setActiveModule(module);
            setShowComposer(true);
          }}
        />

        {!showComposer && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {visibleCards.map((card, index) => (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.35 }}
                  className="glass-card p-4 md:p-5"
                >
                  <h2 className="text-base font-semibold md:text-lg">{card.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-200/80">{card.description}</p>
                </motion.article>
              ))}
            </div>
            <motion.div
              animate={beginAnimating ? { scale: 1.1, opacity: 0 } : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="mt-1 flex flex-wrap justify-center gap-3"
            >
              {availableModules.includes("mail") ? (
                <button
                  onClick={() => {
                    if (activeModule !== "mail") playUiSound("switchWhoosh");
                    setActiveModule("mail");
                    handleBeginAutomating();
                  }}
                  type="button"
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-8 py-3 text-base font-semibold text-slate-100 transition hover:scale-[1.01] hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 sm:w-auto"
                >
                  Open Mail Automator
                </button>
              ) : null}
              <button
                onPointerEnter={() => prefetchTimeTrackerPanel()}
                onFocus={() => prefetchTimeTrackerPanel()}
                onClick={() => {
                  if (activeModule !== "time") playUiSound("switchWhoosh");
                  setActiveModule("time");
                  handleBeginAutomating();
                }}
                type="button"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-8 py-3 text-base font-semibold text-slate-100 transition hover:scale-[1.01] hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 sm:w-auto"
              >
                Open Time Tracker
              </button>
              {availableModules.includes("settings") ? (
                <button
                  onClick={() => {
                    if (activeModule !== "settings") playUiSound("switchWhoosh");
                    setActiveModule("settings");
                    handleBeginAutomating();
                  }}
                  type="button"
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-8 py-3 text-base font-semibold text-slate-100 transition hover:scale-[1.01] hover:border-cyan-300/70 hover:bg-cyan-400/95 hover:text-slate-900 sm:w-auto"
                >
                  Open Settings
                </button>
              ) : null}
            </motion.div>
          </>
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
                    <TimeTrackerPanel />
                  ) : activeModule === "settings" ? (
                    <SettingsPanel
                      email={email}
                      autoOpenProgramReadmeToken={settingsReadmeOpenToken}
                      userRole={userRole ?? "pilot"}
                    />
                  ) : (
                    <section className="underwater-panel grid items-start gap-6 rounded-2xl p-2 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                  <div className="bubble-layer" aria-hidden="true">
                    {[
                      { left: "8%", size: "9px", duration: "9s", delay: "0s" },
                      { left: "20%", size: "7px", duration: "11s", delay: "-2.5s" },
                      { left: "36%", size: "10px", duration: "10s", delay: "-1.5s" },
                      { left: "52%", size: "8px", duration: "12s", delay: "-4s" },
                      { left: "68%", size: "9px", duration: "9.5s", delay: "-3s" },
                      { left: "84%", size: "11px", duration: "13s", delay: "-5s" },
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
                  <div className="glass-card hourlogger-surface min-w-0 max-w-full p-4 md:p-5">
            <h2 className="text-lg font-semibold md:text-xl">Mail Composer</h2>
            <div className="mt-4 space-y-3">
              <ComposerChoiceRow label="Mail type">
                <button
                  type="button"
                  aria-pressed={form.mail_type === "pre"}
                  className={composerSegmentClass(form.mail_type === "pre")}
                  onClick={() => {
                    setForm({ ...form, mail_type: "pre" });
                    setChangesTouched(false);
                  }}
                >
                  Before training
                </button>
                <button
                  type="button"
                  aria-pressed={form.mail_type === "post"}
                  className={composerSegmentClass(form.mail_type === "post")}
                  onClick={() => {
                    setForm({ ...form, mail_type: "post" });
                    setChangesTouched(false);
                  }}
                >
                  After training
                </button>
              </ComposerChoiceRow>

              <ProgressiveField show={shouldShowLanguage}>
                <ComposerChoiceRow label="Language" columns={3}>
                  <button
                    type="button"
                    aria-pressed={form.language === "de"}
                    className={composerSegmentClass(form.language === "de")}
                    onClick={() => {
                      setForm({ ...form, language: "de" });
                      setChangesTouched(false);
                    }}
                  >
                    DE
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.language === "en"}
                    className={composerSegmentClass(form.language === "en")}
                    onClick={() => {
                      setForm({ ...form, language: "en" });
                      setChangesTouched(false);
                    }}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.language === "fr"}
                    className={composerSegmentClass(form.language === "fr")}
                    onClick={() => {
                      setForm({ ...form, language: "fr" });
                      setChangesTouched(false);
                    }}
                  >
                    FR
                  </button>
                </ComposerChoiceRow>
              </ProgressiveField>

              <ProgressiveField show={shouldShowVariant}>
                <ComposerChoiceRow label="Training venue">
                  <button
                    type="button"
                    aria-pressed={form.template_variant === "abroad"}
                    className={composerSegmentClass(form.template_variant === "abroad")}
                    onClick={() => selectTemplateVariant("abroad")}
                  >
                    Abroad
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.template_variant === "lausanne"}
                    className={composerSegmentClass(form.template_variant === "lausanne")}
                    onClick={() => selectTemplateVariant("lausanne")}
                  >
                    In Lausanne
                  </button>
                </ComposerChoiceRow>
              </ProgressiveField>

              <ProgressiveField show={shouldShowTrainingType}>
                <ComposerChoiceRow label="Training type">
                  <button
                    type="button"
                    aria-pressed={form.training_type === "intro_1day"}
                    className={composerSegmentClass(form.training_type === "intro_1day")}
                    onClick={() => selectTrainingType("intro_1day")}
                  >
                    Intro (1 day)
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.training_type === "aiim_3day"}
                    className={composerSegmentClass(form.training_type === "aiim_3day")}
                    onClick={() => selectTrainingType("aiim_3day")}
                  >
                    AIIM (3 days)
                  </button>
                </ComposerChoiceRow>
              </ProgressiveField>
            </div>

            <div className="mt-3 grid gap-3">
              <ProgressiveField show={shouldShowRecipient}>
                <input
                  placeholder="Recipient Name"
                  value={form.recipient_name}
                  onChange={(e) => {
                    setForm({ ...form, recipient_name: e.target.value });
                    setChangesTouched(false);
                  }}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowCompany}>
                <input
                  placeholder="Company Name"
                  value={form.company_name}
                  onChange={(e) => {
                    setForm({ ...form, company_name: e.target.value });
                    setChangesTouched(false);
                  }}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowUseCase}>
                <input
                  placeholder="Use Case"
                  value={form.use_case}
                  onChange={(e) => {
                    setForm({ ...form, use_case: e.target.value });
                    setChangesTouched(false);
                  }}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowDate}>
                <input
                  placeholder={form.mail_type === "pre" ? "Training Date (Required)" : "Training Date (Optional)"}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowLocation}>
                <input
                  placeholder={form.mail_type === "pre" ? "Location (Required)" : "Location (Optional)"}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowRecipientOptional}>
                <input
                  placeholder="Additional Recipients (Optional, comma-separated emails)"
                  value={form.recipient_optional}
                  onChange={(e) => setForm({ ...form, recipient_optional: e.target.value })}
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowChanges}>
                <div className="space-y-2 text-sm">
                  <details
                    className="group rounded-lg border border-white/15 bg-white/5 [&_summary::-webkit-details-marker]:hidden"
                    onToggle={handleResourceDetailsToggle}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10">
                      <span>Training slide decks</span>
                      <span className="shrink-0 text-xs text-slate-400 transition group-open:rotate-180">▼</span>
                    </summary>
                    <div className="max-h-64 space-y-2 overflow-auto border-t border-white/10 p-3 pr-1">
                      {groupedChangeOptions.materials.map((option) => {
                        const checked = form.included_change_ids.includes(option.id);
                        const { label, desc } = getChangeOptionLabelDesc(option, composerMailLang);
                        return (
                          <label
                            key={option.id}
                            className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-2"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={(e) => {
                                setChangesTouched(true);
                                setForm((prev) => ({
                                  ...prev,
                                  included_change_ids: e.target.checked
                                    ? [...prev.included_change_ids, option.id]
                                    : prev.included_change_ids.filter((id) => id !== option.id),
                                }));
                              }}
                            />
                            <span>
                              <span className="block">{label}</span>
                              <span className="text-xs text-slate-300/80">{desc}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>

                  {groupedChangeOptions.usefulSections.map((section) => (
                    <details
                      key={section.sectionId}
                      className="group rounded-lg border border-white/15 bg-white/5 [&_summary::-webkit-details-marker]:hidden"
                      onToggle={handleResourceDetailsToggle}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10">
                        <span>{resourceSectionLabel(section.sectionId, composerMailLang)}</span>
                        <span className="shrink-0 text-xs text-slate-400 transition group-open:rotate-180">▼</span>
                      </summary>
                      <div className="max-h-64 space-y-2 overflow-auto border-t border-white/10 p-3 pr-1">
                        {section.options.map((option) => {
                          const checked = form.included_change_ids.includes(option.id);
                          const { label, desc } = getChangeOptionLabelDesc(option, composerMailLang);
                          return (
                            <label
                              key={option.id}
                              className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-2"
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={(e) => {
                                  setChangesTouched(true);
                                  setForm((prev) => ({
                                    ...prev,
                                    included_change_ids: e.target.checked
                                      ? [...prev.included_change_ids, option.id]
                                      : prev.included_change_ids.filter((id) => id !== option.id),
                                  }));
                                }}
                              />
                              <span>
                                <span className="block">{label}</span>
                                <span className="text-xs text-slate-300/80">{desc}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </ProgressiveField>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => {
                  void handleGenerate();
                }}
                disabled={loading || generateDisabled}
                className="h-11 w-full rounded-lg bg-cyan-400/90 px-4 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-70 sm:w-auto"
                type="button"
              >
                {loading ? "Generating..." : "Generate draft"}
              </button>
              <button
                onClick={() => {
                  void handleCreateDraft();
                }}
                disabled={draftLoading || !gmailStatus.connected || !result}
                className="h-11 w-full rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                type="button"
              >
                {draftLoading ? "Creating in Gmail..." : "Create Gmail draft"}
              </button>
              <button
                onClick={() => {
                  handleResetComposer();
                }}
                className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/15 sm:w-auto"
                type="button"
              >
                Reset
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            {draftInfo && (
              <p className="mt-3 text-sm text-emerald-300">
                Draft created: {draftInfo.draftId} ({draftInfo.messageId})
              </p>
            )}
                  </div>

                  <div className="glass-card hourlogger-surface min-w-0 self-start p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Live Preview</h2>
              {result && (
                <button
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
                  onClick={() => {
                    void copyText(`Subject: ${result.subject}\n\n${result.body}`);
                  }}
                  type="button"
                >
                  Copy plain text
                </button>
              )}
            </div>
            {!result ? (
              <p className="mt-4 text-sm text-slate-200/75">Generated text appears here in real time.</p>
            ) : (
              <div className="mt-4">
                <div className="rounded-lg border border-white/15 bg-slate-900/40 p-3">
                  <div className="relative whitespace-pre-wrap text-xs leading-6">
                    <p className="pointer-events-none absolute right-0 top-0 max-w-[55%] text-right text-cyan-100/95">
                      {renderNeonWriteText(animatedPreviewSubject)}
                    </p>
                    <pre className="whitespace-pre-wrap text-xs leading-6">{renderNeonWriteText(animatedPreviewBody)}</pre>
                  </div>
                </div>
              </div>
            )}
                  </div>
                    </section>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.section>
          ) : null}
        </AnimatePresence>

      </section>
      {showProgramReadmePrompt ? (
        <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,22rem)] rounded-xl border border-white/20 bg-slate-950/92 p-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-200/75">First launch</p>
            </div>
            <button
              type="button"
              onClick={dismissProgramReadmePrompt}
              className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/15"
              aria-label="Close program readme prompt"
            >
              X
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
            className="mt-3 w-full rounded-lg bg-cyan-400/90 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-cyan-300"
          >
            Open program README
          </button>
        </div>
      ) : null}
      {userRole == null ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-950/95 p-4 shadow-xl">
            <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-200/75">First Login Setup</p>
            <h2 className="mt-2 text-lg font-semibold">Choose your workspace profile</h2>
            <p className="mt-2 text-sm text-slate-300/85">
              This controls which modules and settings you see.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  void handleSelectRole("pilot");
                }}
                disabled={roleSaving}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium transition hover:bg-white/15 disabled:opacity-60"
              >
                Pilot
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSelectRole("sales");
                }}
                disabled={roleSaving}
                className="rounded-lg border border-cyan-300/60 bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-60"
              >
                Sales
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
