"use client";

import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { CHANGE_OPTIONS, DEFAULT_INCLUDED_CHANGE_IDS } from "@/lib/change-options";

type DashboardShellProps = {
  email: string;
};

type GenerateResponse = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
};

type FormState = {
  mail_type: "" | "pre" | "post";
  template_variant: "" | "lausanne" | "abroad";
  language: "" | "en" | "de";
  training_type: "" | "intro_1day" | "aiim_3day";
  recipient_name: string;
  company_name: string;
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

  const shouldShowLanguage = Boolean(form.mail_type);
  const shouldShowVariant = shouldShowLanguage && form.mail_type === "pre";
  const shouldShowTrainingType = shouldShowVariant && Boolean(form.template_variant);
  const shouldShowRecipient =
    form.mail_type === "post" ? Boolean(form.language) : Boolean(form.training_type);
  const shouldShowCompany = shouldShowRecipient && Boolean(form.recipient_name);
  const shouldShowDate = shouldShowCompany;
  const shouldShowLocation = form.mail_type === "pre" ? Boolean(form.date) : shouldShowDate;
  const shouldShowTo = form.mail_type === "pre" ? Boolean(form.location) : shouldShowLocation;
  const shouldShowChanges = Boolean(form.to);

  const generateDisabled =
    !form.mail_type ||
    !form.language ||
    !form.recipient_name ||
    !form.company_name ||
    !form.to ||
    (form.mail_type === "pre" && (!form.template_variant || !form.training_type || !form.date || !form.location));
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; gmail_email?: string | null }>({
    connected: false,
  });
  const [draftInfo, setDraftInfo] = useState<{ draftId: string; messageId: string } | null>(null);

  const cards = [
    {
      title: "Generate in Web UI",
      description: "Same template engine as /mail, now available directly in dashboard.",
    },
    {
      title: "Industry-Aware Links",
      description: "Only common + relevant industry links are included to keep emails focused.",
    },
    {
      title: "Draft-Only Safety",
      description: "No auto-send actions. Everything lands in Drafts for manual review.",
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
          included_change_ids: form.included_change_ids,
        }),
      });
      const data = (await response.json()) as GenerateResponse | { error: string };
      if (!response.ok) throw new Error((data as { error: string }).error || "Generate failed");
      setResult(data as GenerateResponse);
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
    if (!form.to) {
      setError("Recipient email (to) is required.");
      return;
    }

    setDraftLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gmail/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.to,
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Flyability Internal</p>
            <h1 className="text-xl font-semibold md:text-2xl">Mail Automator Dashboard</h1>
            <p className="mt-1 text-sm text-slate-200/80">{email}</p>
          </div>
          <div className="flex items-center gap-2">
            {gmailStatus.connected ? (
              <>
                <span className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-xs">
                  Gmail connected
                </span>
                <button
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15"
                  onClick={handleDisconnectGmail}
                  type="button"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <a
                className="rounded-lg bg-cyan-400/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
                href="/api/gmail/connect"
              >
                Connect Gmail
              </a>
            )}
            <form action="/logout" method="post">
              <button
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition hover:bg-white/15"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card, index) => (
            <motion.article
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="glass-card p-5"
            >
              <h2 className="text-lg font-medium">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-200/80">{card.description}</p>
            </motion.article>
          ))}
        </div>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="glass-card p-6">
            <h2 className="text-lg font-medium">Generate Mail</h2>
            <p className="mt-1 text-sm text-slate-200/80">
              Guided mode: each next field appears after the previous one is set.
            </p>

            <div className="mt-4">
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
                className="mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/15"
              >
                Auto-fill fields
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <select
                value={form.mail_type}
                onChange={(e) => setForm({ ...form, mail_type: e.target.value as FormState["mail_type"] })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
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
                  onChange={(e) => setForm({ ...form, template_variant: e.target.value as FormState["template_variant"] })}
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
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowCompany}>
                <input
                  placeholder="company_name"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowDate}>
                <input
                  placeholder={form.mail_type === "pre" ? "date (required)" : "date (optional)"}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowLocation}>
                <input
                  placeholder={form.mail_type === "pre" ? "location (required)" : "location (optional)"}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </ProgressiveField>
              <ProgressiveField show={shouldShowTo}>
                <input
                  placeholder="to (recipient emails, comma separated)"
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
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
                                setForm((prev) => ({
                                  ...prev,
                                  included_change_ids: e.target.checked
                                    ? [...prev.included_change_ids, option.id]
                                    : prev.included_change_ids.filter((id) => id !== option.id),
                                }))
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
              className="mt-4 rounded-lg bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-70"
              type="button"
            >
              {loading ? "Generating..." : "Generate draft"}
            </button>
            <button
              onClick={handleCreateDraft}
              disabled={draftLoading || !gmailStatus.connected || !result}
              className="mt-2 rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
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

          <div className="glass-card p-6 md:sticky md:top-6 md:self-start">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">Preview</h2>
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
              <p className="text-sm text-slate-200/75">Generated subject and body will appear here.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Subject</p>
                <p className="text-sm">{result.subject}</p>
                <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Body</p>
                <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/15 bg-slate-900/40 p-3 text-xs leading-6">
                  {result.body}
                </pre>
              </div>
            )}
          </div>
        </section>

        <section className="glass-card mt-6 p-4">
          <button
            onClick={() => setShowSetup((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-left text-sm font-medium hover:bg-white/15"
            type="button"
          >
            <span>Gmail Setup README</span>
            <span>{showSetup ? "Hide" : "Show"}</span>
          </button>

          {showSetup && (
            <div className="mt-4 rounded-lg border border-white/15 bg-slate-900/35 p-4 text-sm text-slate-200/90">
              <p className="font-medium text-cyan-200">How to connect Mail Automator to Gmail</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
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
