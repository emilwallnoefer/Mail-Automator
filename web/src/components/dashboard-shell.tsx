"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

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
  mail_type: "pre" | "post";
  template_variant: "lausanne" | "abroad";
  language: "en" | "de";
  training_type: "intro_1day" | "aiim_3day";
  recipient_name: string;
  company_name: string;
  date: string;
  location: string;
  to: string;
  cc: string;
  bcc: string;
  custom_opener_note: string;
  industry_course_ids: string;
  include_certification_note: boolean;
  include_simulator_note: boolean;
};

export function DashboardShell({ email }: DashboardShellProps) {
  const [form, setForm] = useState<FormState>({
    mail_type: "post",
    template_variant: "abroad",
    language: "de",
    training_type: "intro_1day",
    recipient_name: "",
    company_name: "",
    date: "",
    location: "",
    to: "",
    cc: "",
    bcc: "",
    custom_opener_note: "",
    industry_course_ids: "",
    include_certification_note: false,
    include_simulator_note: false,
  });
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
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
        body: JSON.stringify(form),
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
          cc: form.cc,
          bcc: form.bcc,
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
            <p className="mt-1 text-sm text-slate-200/80">Fill once, generate instantly.</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <select
                value={form.mail_type}
                onChange={(e) => setForm({ ...form, mail_type: e.target.value as FormState["mail_type"] })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="post">post</option>
                <option value="pre">pre</option>
              </select>
              <select
                value={form.template_variant}
                onChange={(e) => setForm({ ...form, template_variant: e.target.value as FormState["template_variant"] })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="abroad">abroad</option>
                <option value="lausanne">lausanne</option>
              </select>
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as FormState["language"] })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="de">de</option>
                <option value="en">en</option>
              </select>
              <select
                value={form.training_type}
                onChange={(e) => setForm({ ...form, training_type: e.target.value as FormState["training_type"] })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              >
                <option value="intro_1day">intro_1day</option>
                <option value="aiim_3day">aiim_3day</option>
              </select>
            </div>

            <div className="mt-3 grid gap-3">
              <input
                placeholder="recipient_name"
                value={form.recipient_name}
                onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <input
                placeholder="company_name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
                <input
                  placeholder="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </div>
              <input
                placeholder="to (recipient emails, comma separated)"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="cc (optional)"
                  value={form.cc}
                  onChange={(e) => setForm({ ...form, cc: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
                <input
                  placeholder="bcc (optional)"
                  value={form.bcc}
                  onChange={(e) => setForm({ ...form, bcc: e.target.value })}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
                />
              </div>
              <input
                placeholder="industry_course_ids (optional: gas_sensor,elios3_ut)"
                value={form.industry_course_ids}
                onChange={(e) => setForm({ ...form, industry_course_ids: e.target.value })}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="custom opener note (optional)"
                value={form.custom_opener_note}
                onChange={(e) => setForm({ ...form, custom_opener_note: e.target.value })}
                className="min-h-20 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm"
              />
              <div className="flex gap-4 text-sm text-slate-200/90">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.include_certification_note}
                    onChange={(e) => setForm({ ...form, include_certification_note: e.target.checked })}
                  />
                  certification note
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.include_simulator_note}
                    onChange={(e) => setForm({ ...form, include_simulator_note: e.target.checked })}
                  />
                  simulator note
                </label>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
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

          <div className="glass-card p-6">
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

        <section className="glass-card mt-6 p-6">
          <h2 className="text-lg font-medium">Setup README</h2>
          <p className="mt-2 text-sm text-slate-200/80">
            Use this checklist to set up the app for colleagues.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Vercel environment variables</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-white/15 bg-slate-900/40 p-3 text-xs leading-6">
{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://mail-automator.vercel.app/api/gmail/callback`}
              </pre>
            </div>

            <div>
              <p className="text-xs tracking-wide text-cyan-200/85 uppercase">Required platform settings</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200/85">
                <li>1. Vercel Root Directory = <code className="rounded bg-white/10 px-1">web</code></li>
                <li>2. Supabase Auth enabled (Email/Password)</li>
                <li>3. Supabase redirect URL:
                  <code className="ml-1 rounded bg-white/10 px-1">https://mail-automator.vercel.app/auth/callback</code>
                </li>
                <li>4. Google Cloud: Gmail API enabled</li>
                <li>5. Google OAuth redirect URI:
                  <code className="ml-1 rounded bg-white/10 px-1">https://mail-automator.vercel.app/api/gmail/callback</code>
                </li>
                <li>6. After changes: redeploy Vercel</li>
              </ul>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
