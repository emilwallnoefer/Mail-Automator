"use client";

import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { FormEvent, useState, type CSSProperties } from "react";

export default function LoginPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setError("Missing Supabase env vars in deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
      setLoading(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setMessage("Account created. If email confirmation is enabled, confirm your email first.");
    setPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="page-shell underwater-panel grid items-center rounded-2xl p-2 lg:grid-cols-2"
      >
        <div className="bubble-layer" aria-hidden="true">
          {[
            { left: "9%", size: "8px", duration: "9s", delay: "0s" },
            { left: "22%", size: "7px", duration: "11.5s", delay: "-2s" },
            { left: "37%", size: "10px", duration: "10s", delay: "-1.3s" },
            { left: "54%", size: "8px", duration: "12s", delay: "-3.8s" },
            { left: "71%", size: "9px", duration: "9.8s", delay: "-2.7s" },
            { left: "88%", size: "11px", duration: "13.3s", delay: "-5.2s" },
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
        <div className="glass-card hourlogger-surface hidden h-full min-h-[560px] p-5 md:p-6 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="mb-3 text-xs tracking-[0.25em] text-cyan-200/85 uppercase">
              Flyability Internal
            </p>
            <h1 className="max-w-md text-3xl leading-tight font-semibold md:text-4xl">
              Flya Allrounder for daily operations.
            </h1>
            <p className="mt-4 max-w-md text-sm text-slate-200/80">
              Generate structured training emails, create Gmail drafts, and manage your time tracking in one workflow.
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-sm font-medium">Smart Mail Generation</p>
              <p className="mt-1 text-xs text-slate-300/85">Guided fields with fast auto-fill and template logic.</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-sm font-medium">Time Tracking</p>
              <p className="mt-1 text-xs text-slate-300/85">Track working hours, breaks, and overtime bank.</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-sm font-medium">Draft-Safe by Default</p>
              <p className="mt-1 text-xs text-slate-300/85">Everything lands in Gmail drafts for review.</p>
            </div>
          </div>
        </div>

        <div className="glass-card hourlogger-surface mx-auto w-full max-w-md p-5 md:p-6">
          <div className="mb-7">
            <p className="mb-2 text-xs tracking-[0.22em] text-cyan-200/80 uppercase">Flyability Internal</p>
            <h2 className="text-2xl font-semibold md:text-3xl">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-200/80">
              Sign in to continue to Flya Allrounder.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1.5">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setMessage(null);
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "signin" ? "bg-cyan-400/90 text-slate-950" : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage(null);
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "signup" ? "bg-cyan-400/90 text-slate-950" : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {!supabaseConfigured && (
              <p className="rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                Supabase is not configured for this deployment. Add `NEXT_PUBLIC_SUPABASE_URL` and
                `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel and redeploy.
              </p>
            )}
            <label className="block">
              <span className="mb-2 block text-sm text-slate-100/90">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-cyan-300/70 focus:bg-white/15"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-100/90">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-cyan-300/70 focus:bg-white/15"
              />
            </label>

            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-100/90">Confirm password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-cyan-300/70 focus:bg-white/15"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={loading || !supabaseConfigured}
              className="h-12 w-full rounded-xl bg-cyan-400/90 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-70"
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </div>
      </motion.section>
    </main>
  );
}
