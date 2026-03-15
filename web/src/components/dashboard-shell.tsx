"use client";

import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { CHANGE_OPTIONS, DEFAULT_INCLUDED_CHANGE_IDS } from "@/lib/change-options";
import { AuthNavbar } from "@/components/auth-navbar";
import { TimeTrackerPanel } from "@/components/time-tracker-panel";

type DashboardShellProps = {
  email: string;
};

type GenerateResponse = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
  selected_change_ids?: string[];
};

type FormState = {
  mail_type: "" | "pre" | "post";
  template_variant: "" | "lausanne" | "abroad";
  language: "" | "en" | "de";
  training_type: "" | "intro_1day" | "aiim_3day";
  recipient_name: string;
  company_name: string;
  use_case: string;
  date: string;
  location: string;
  to: string;
  included_change_ids: string[];
  quick_input: string;
};

type MailType = FormState["mail_type"];

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

function parseQuickInput(raw: string, current: FormState): FormState {
  const text = raw.trim();
  if (!text) return current;

  // First support key:value lines for robust copy/paste.
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fromKv: Partial<FormState> = {};
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z_]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "mail_type" && /(pre|post)/i.test(value)) fromKv.mail_type = value.toLowerCase() as MailType;
    if (key === "template_variant" && /(lausanne|abroad|abraod)/i.test(value)) {
      fromKv.template_variant = value.toLowerCase().replace("abraod", "abroad") as FormState["template_variant"];
    }
    if (key === "language" && /(de|en|deutsch|english|german)/i.test(value)) {
      fromKv.language = /(de|deutsch|german)/i.test(value) ? "de" : "en";
    }
    if (key === "training_type" && /(intro|aiim)/i.test(value)) {
      fromKv.training_type = /aiim/i.test(value) ? "aiim_3day" : "intro_1day";
    }
    if (key === "recipient_name") fromKv.recipient_name = value;
    if (key === "company_name") fromKv.company_name = value;
    if (key === "use_case") fromKv.use_case = value;
    if (key === "date") fromKv.date = value;
    if (key === "location") fromKv.location = value;
    if (key === "to") fromKv.to = value;
    if (key === "included_change_ids") {
      fromKv.included_change_ids = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  if (Object.keys(fromKv).length > 0) {
    return { ...current, ...fromKv, quick_input: raw };
  }

  // Fallback shorthand parser: "/mail post abraod de intro marko Synthomer 04.05 Germany hans@test.com"
  const cleaned = text.replace(/^\/mail\s+/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const next = { ...current, quick_input: raw };

  const take = () => tokens.shift() ?? "";

  const t0 = tokens[0]?.toLowerCase();
  if (t0 === "post" || t0 === "pre") next.mail_type = take().toLowerCase() as MailType;

  const t1 = tokens[0]?.toLowerCase();
  if (["abroad", "abraod", "lausanne"].includes(t1)) {
    next.template_variant = (take().toLowerCase().replace("abraod", "abroad") as FormState["template_variant"]) || "";
  }

  const t2 = tokens[0]?.toLowerCase();
  if (["de", "en", "deutsch", "german", "english"].includes(t2)) {
    const value = take().toLowerCase();
    next.language = ["de", "deutsch", "german"].includes(value) ? "de" : "en";
  }

  const t3 = tokens[0]?.toLowerCase();
  if (t3 && /(intro|aiim)/i.test(t3)) {
    const value = take().toLowerCase();
    next.training_type = /aiim/.test(value) ? "aiim_3day" : "intro_1day";
  }

  const emailMatch = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (emailMatch?.[0]) next.to = emailMatch[0];

  // Remove already-consumed tokens that are obvious fields.
  const remainder = tokens.filter((token) => !token.includes("@"));
  const dateIndex = remainder.findIndex((token) => /\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?/.test(token));

  if (!next.recipient_name && remainder[0]) next.recipient_name = remainder[0];
  if (!next.company_name && remainder[1]) next.company_name = remainder[1];
  if (!next.use_case) {
    if (dateIndex > 2) next.use_case = remainder.slice(2, dateIndex).join(" ");
    else if (remainder[2]) next.use_case = remainder[2];
  }
  if (!next.date && dateIndex >= 0) next.date = remainder[dateIndex];
  if (!next.location) {
    const locationCandidate = dateIndex >= 0 ? remainder[dateIndex + 1] : remainder[2];
    if (locationCandidate) next.location = locationCandidate;
  }

  return next;
}

export function DashboardShell({ email }: DashboardShellProps) {
  const [form, setForm] = useState<FormState>({
    mail_type: "",
    template_variant: "",
    language: "",
    training_type: "",
    recipient_name: "",
    company_name: "",
    use_case: "",
    date: "",
    location: "",
    to: "",
    included_change_ids: [...DEFAULT_INCLUDED_CHANGE_IDS],
    quick_input: "",
  });
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [beginAnimating, setBeginAnimating] = useState(false);
  const [changesTouched, setChangesTouched] = useState(false);
  const [activeModule, setActiveModule] = useState<"mail" | "time">("mail");

  const shouldShowLanguage = Boolean(form.mail_type);
  const shouldShowVariant = shouldShowLanguage && form.mail_type === "pre";
  const shouldShowTrainingType = shouldShowVariant && Boolean(form.template_variant);
  const shouldShowRecipient =
    form.mail_type === "post" ? Boolean(form.language) : Boolean(form.training_type);
  const shouldShowCompany = form.mail_type === "post" && shouldShowRecipient && Boolean(form.recipient_name);
  const shouldShowUseCase = form.mail_type === "post" && shouldShowCompany && Boolean(form.company_name);
  const shouldShowDate =
    form.mail_type === "pre" ? shouldShowRecipient && Boolean(form.recipient_name) : false;
  const isPreLausanne = form.mail_type === "pre" && form.template_variant === "lausanne";
  const shouldShowLocation = form.mail_type === "pre" && Boolean(form.date) && !isPreLausanne;
  const shouldShowTo = form.mail_type === "post" ? shouldShowUseCase && Boolean(form.use_case) : false;
  const shouldShowChanges = form.mail_type === "post" && Boolean(form.to);

  const generateDisabled =
    !form.mail_type ||
    !form.language ||
    !form.recipient_name ||
    (form.mail_type === "post" && (!form.company_name || !form.use_case || !form.to)) ||
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

  async function handleDisconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailStatus({ connected: false });
    setDraftInfo(null);
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
          to: form.to || undefined,
          subject: result.subject,
          body: result.body,
          html_body: result.html_body,
        }),
      });
      const data = (await response.json()) as { draftId: string; messageId: string } | { error: string };
      if (!response.ok) throw new Error((data as { error: string }).error || "Failed to create draft");
      setDraftInfo(data as { draftId: string; messageId: string });
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-8 md:px-8">
        <AuthNavbar
          email={email}
          gmailConnected={gmailStatus.connected}
          gmailEmail={gmailStatus.gmail_email}
          onDisconnectGmail={handleDisconnectGmail}
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
                  className="glass-card p-5 md:p-6"
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
                onClick={handleBeginAutomating}
                type="button"
                className="rounded-xl bg-cyan-400/95 px-8 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:scale-[1.01] hover:bg-cyan-300"
              >
                Begin automating
              </button>
              <button
                onClick={() => {
                  setActiveModule("time");
                  handleBeginAutomating();
                }}
                type="button"
                className="rounded-xl border border-white/20 bg-white/10 px-8 py-3 text-base font-semibold transition hover:bg-white/15"
              >
                Open time tracker
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
              <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Flya allrounderm</p>
                  <p className="text-sm text-slate-200/80">Choose a module to work in.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/20 bg-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveModule("mail")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeModule === "mail" ? "bg-cyan-400/90 text-slate-900" : "text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    Mail automator
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModule("time")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeModule === "time" ? "bg-cyan-400/90 text-slate-900" : "text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    Time tracker
                  </button>
                </div>
              </div>

              {activeModule === "time" ? (
                <TimeTrackerPanel />
              ) : (
                <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="glass-card p-6 md:p-7">
            <h2 className="text-lg font-semibold md:text-xl">Mail Composer</h2>
            <p className="mt-1 text-sm leading-6 text-slate-200/80">
              Guided mode: fill top-down and each next field appears automatically.
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-xs tracking-wide text-cyan-200/85 uppercase">
                Quick paste (auto-fill)
              </label>
              <textarea
                placeholder="Paste all info here (e.g. /mail post abraod de intro marko Synthomer 04.05 Germany hans@test.com)"
                value={form.quick_input}
                onChange={(e) => setForm({ ...form, quick_input: e.target.value })}
                className="min-h-20 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setForm((prev) => parseQuickInput(prev.quick_input, prev))}
                className="mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium transition hover:bg-white/15"
              >
                Auto-fill fields
              </button>
            </div>

            <div className="mt-5">
              <select
                value={form.mail_type}
                onChange={(e) => setForm({ ...form, mail_type: e.target.value as FormState["mail_type"] })}
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="">mail_type</option>
                <option value="post">post</option>
                <option value="pre">pre</option>
              </select>
            </div>

            <ProgressiveField show={shouldShowLanguage}>
              <div className="mt-3">
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value as FormState["language"] })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">language</option>
                  <option value="de">de</option>
                  <option value="en">en</option>
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
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">template_variant</option>
                  <option value="abroad">abroad</option>
                  <option value="lausanne">lausanne</option>
                </select>
              </div>
            </ProgressiveField>

            <ProgressiveField show={shouldShowTrainingType}>
              <div className="mt-3">
                <select
                  value={form.training_type}
                  onChange={(e) => setForm({ ...form, training_type: e.target.value as FormState["training_type"] })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                >
                  <option value="">training_type</option>
                  <option value="intro_1day">intro_1day</option>
                  <option value="aiim_3day">aiim_3day</option>
                </select>
              </div>
            </ProgressiveField>

            <div className="mt-3 grid gap-3">
              <ProgressiveField show={shouldShowRecipient}>
                <input
                  placeholder="recipient_name"
                  value={form.recipient_name}
                  onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowCompany}>
                <input
                  placeholder="company_name"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowUseCase}>
                <input
                  placeholder="use_case"
                  value={form.use_case}
                  onChange={(e) => setForm({ ...form, use_case: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowDate}>
                <input
                  placeholder={form.mail_type === "pre" ? "date (required)" : "date (optional)"}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowLocation}>
                <input
                  placeholder={form.mail_type === "pre" ? "location (required)" : "location (optional)"}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowTo}>
                <input
                  placeholder="to (recipient emails, comma separated)"
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowChanges}>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <button
                    type="button"
                    onClick={() => setShowChanges((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm"
                  >
                    <span>changes</span>
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

            <button
              onClick={handleGenerate}
              disabled={loading || generateDisabled}
              className="mt-5 rounded-lg bg-cyan-400/90 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-70"
              type="button"
            >
              {loading ? "Generating..." : "Generate draft"}
            </button>
            <button
              onClick={handleCreateDraft}
              disabled={draftLoading || !gmailStatus.connected || !result}
              className="mt-2 rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {draftLoading ? "Creating in Gmail..." : "Create Gmail draft"}
            </button>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            {draftInfo && (
              <p className="mt-3 text-sm text-emerald-300">
                Draft created: {draftInfo.draftId} ({draftInfo.messageId})
              </p>
            )}
                  </div>

                  <div className="glass-card sticky top-6 self-start p-6 md:p-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Live Preview</h2>
              {result && (
                <button
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
                  onClick={() => copyText(`Subject: ${result.subject}\n\n${result.body}`)}
                  type="button"
                >
                  Copy plain text
                </button>
              )}
            </div>
            {!result ? (
              <p className="text-sm text-slate-200/75">Generated subject and body appear here in real time.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Subject</p>
                <p className="text-sm">{result.subject}</p>
                <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Body</p>
                <pre className="whitespace-pre-wrap rounded-lg border border-white/15 bg-slate-900/40 p-3 text-xs leading-6">
                  {result.body}
                </pre>
              </div>
            )}
                  </div>
                </section>
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>

        <section className="glass-card mt-auto p-3">
          <button
            onClick={() => setShowSetup((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-xs font-medium hover:bg-white/15"
            type="button"
          >
            <span>Gmail setup README</span>
            <span>{showSetup ? "Hide" : "Show"}</span>
          </button>

          {showSetup && (
            <div className="mt-2 rounded-lg border border-white/15 bg-slate-900/35 p-3 text-xs text-slate-200/90">
              <p className="font-medium text-cyan-200">How to connect Mail Automator to Gmail</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Sign in to this app and open the dashboard.</li>
                <li>Click <strong>Connect Gmail</strong>.</li>
                <li>In Google popup, choose your Gmail account.</li>
                <li>Allow draft access permission.</li>
                <li>Return to dashboard and confirm status shows <strong>Gmail connected</strong>.</li>
                <li>Generate a mail, then click <strong>Create Gmail draft</strong>.</li>
              </ol>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
