"use client";

import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CHANGE_OPTIONS, DEFAULT_INCLUDED_CHANGE_IDS } from "@/lib/change-options";
import { AuthNavbar } from "@/components/auth-navbar";
import { SettingsPanel } from "@/components/settings-panel";
import { TimeTrackerPanel } from "@/components/time-tracker-panel";
import { playUiSound, playUiSoundWithCrossfadeFill, stopUiSound } from "@/lib/ui-sounds";

type DashboardShellProps = {
  email: string;
};

const PROGRAM_README_PROMPT_SEEN_DEPLOY_KEY = "ma_program_readme_prompt_seen_deploy_v1";

type GenerateResponse = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
  selected_change_ids?: string[];
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
  language: "" | "en" | "de";
  training_type: "" | "intro_1day" | "aiim_3day";
  recipient_name: string;
  recipient_optional: string;
  company_name: string;
  use_case: string;
  date: string;
  location: string;
  to: string;
  included_change_ids: string[];
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

export function DashboardShell({ email }: DashboardShellProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [beginAnimating, setBeginAnimating] = useState(false);
  const [changesTouched, setChangesTouched] = useState(false);
  const [activeModule, setActiveModule] = useState<"mail" | "time" | "settings">("mail");
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

  const cards = [
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
  ];

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/gmail/status");
      if (!response.ok) return;
      const data = (await response.json()) as { connected: boolean; gmail_email?: string | null };
      setGmailStatus(data);
    })();
  }, []);

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
      cursor = Math.min(text.length, cursor + 2);
      setAnimatedPreviewSubject(text.slice(0, cursor));
      if (cursor < text.length) timeoutId = window.setTimeout(step, 28);
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
      cursor = Math.min(text.length, cursor + 10);
      setAnimatedPreviewBody(text.slice(0, cursor));
      if (cursor < text.length) timeoutId = window.setTimeout(step, 24);
    };
    step();
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [result?.body]);

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
      const subjectSteps = subjectLen > 0 ? Math.ceil(subjectLen / 2) : 0;
      const bodySteps = bodyLen > 0 ? Math.ceil(bodyLen / 10) : 0;
      const subjectMs = subjectSteps > 0 ? (subjectSteps - 1) * 28 : 0;
      const bodyMs = bodySteps > 0 ? (bodySteps - 1) * 24 : 0;
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
    setForm({ ...INITIAL_FORM_STATE, included_change_ids: [...DEFAULT_INCLUDED_CHANGE_IDS] });
    setResult(null);
    setError(null);
    setDraftInfo(null);
    setShowChanges(false);
    setChangesTouched(false);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell">
        <AuthNavbar
          email={email}
          gmailConnected={gmailStatus.connected}
          gmailEmail={gmailStatus.gmail_email}
          activeModule={activeModule}
          onSelectModule={(module) => {
            if (module !== activeModule) playUiSound("switchWhoosh");
            setActiveModule(module);
            setShowComposer(true);
          }}
        />

        {!showComposer && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {cards.map((card, index) => (
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
              <button
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
                    <SettingsPanel email={email} autoOpenProgramReadmeToken={settingsReadmeOpenToken} />
                  ) : (
                    <section className="underwater-panel grid items-start gap-6 rounded-2xl p-2 lg:grid-cols-[1.1fr_0.9fr]">
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
                  <div className="glass-card hourlogger-surface p-4 md:p-5">
            <h2 className="text-lg font-semibold md:text-xl">Mail Composer</h2>
            <div className="mt-4">
              <select
                value={form.mail_type}
                onChange={(e) => {
                  setForm({ ...form, mail_type: e.target.value as FormState["mail_type"] });
                  setChangesTouched(false);
                }}
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="">Mail Type</option>
                <option value="pre">Before Training</option>
                <option value="post">After Training</option>
              </select>
            </div>

            <ProgressiveField show={shouldShowLanguage}>
              <div className="mt-3">
                <select
                  value={form.language}
                  onChange={(e) => {
                    setForm({ ...form, language: e.target.value as FormState["language"] });
                    setChangesTouched(false);
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">Language</option>
                  <option value="de">German</option>
                  <option value="en">English</option>
                </select>
              </div>
            </ProgressiveField>

            <ProgressiveField show={shouldShowVariant}>
              <div className="mt-3">
                <select
                  value={form.template_variant}
                  onChange={(e) => {
                    const nextVariant = e.target.value as FormState["template_variant"];
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
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">Training Location</option>
                  <option value="abroad">Abroad</option>
                  <option value="lausanne">In Lausanne</option>
                </select>
              </div>
            </ProgressiveField>

            <ProgressiveField show={shouldShowTrainingType}>
              <div className="mt-3">
                <select
                  value={form.training_type}
                  onChange={(e) => {
                    const nextTrainingType = e.target.value as FormState["training_type"];
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
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">Training Type</option>
                  <option value="intro_1day">Intro (1 Day)</option>
                  <option value="aiim_3day">AIIM (3 Days)</option>
                </select>
              </div>
            </ProgressiveField>

            <div className="mt-3 grid gap-3">
              <ProgressiveField show={shouldShowRecipient}>
                <input
                  placeholder="Recipient Name"
                  value={form.recipient_name}
                  onChange={(e) => {
                    setForm({ ...form, recipient_name: e.target.value });
                    setChangesTouched(false);
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowDate}>
                <input
                  placeholder={form.mail_type === "pre" ? "Training Date (Required)" : "Training Date (Optional)"}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowLocation}>
                <input
                  placeholder={form.mail_type === "pre" ? "Location (Required)" : "Location (Optional)"}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowRecipientOptional}>
                <input
                  placeholder="Additional Recipients (Optional, comma-separated emails)"
                  value={form.recipient_optional}
                  onChange={(e) => setForm({ ...form, recipient_optional: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowChanges}>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChanges((prev) => !prev);
                    }}
                    className="flex w-full items-center justify-between rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm"
                  >
                    <span>Suggested Resources</span>
                    <span>{showChanges ? "Hide" : "Show"}</span>
                  </button>
                  {showChanges && (
                    <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1 text-sm">
                      {CHANGE_OPTIONS.map((option) => {
                        const checked = form.included_change_ids.includes(option.id);
                        const label = form.language === "de" ? option.label_de : option.label_en;
                        const desc = form.language === "de" ? option.desc_de : option.desc_en;
                        return (
                          <label key={option.id} className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={(e) =>
                                {
                                  setChangesTouched(true);
                                  setForm((prev) => ({
                                    ...prev,
                                    included_change_ids: e.target.checked
                                      ? [...prev.included_change_ids, option.id]
                                      : prev.included_change_ids.filter((id) => id !== option.id),
                                  }));
                                }
                              }
                            />
                            <span>
                              <span className="block">{label}</span>
                              <span className="text-xs text-slate-300/80">{desc}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
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

                  <div className="glass-card hourlogger-surface self-start p-4 md:p-5">
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
    </main>
  );
}
