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
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const authError = new URLSearchParams(window.location.search).get("error");
    if (authError === "domain_not_allowed") return "Only @flyability.com Google accounts are allowed.";
    if (authError === "oauth_failed") return "Google sign-in failed. Please try again.";
    return null;
  });

  async function handleGoogleSignIn() {
    if (!supabaseConfigured) {
      setError("Missing Supabase env vars in deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          hd: "flyability.com",
          prompt: "select_account",
        },
      },
    });
    if (oauthError) {
      const lower = oauthError.message.toLowerCase();
      if (lower.includes("provider is not enabled")) {
        setError(
          "Google sign-in is not enabled in Supabase yet. Enable Google under Authentication > Providers and add Google OAuth client credentials.",
        );
      } else {
        setError(oauthError.message);
      }
      setLoading(false);
      return;
    }
  }

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
        className="page-shell underwater-panel grid items-center rounded-2xl p-2"
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
        <div className="glass-card hourlogger-surface mx-auto w-full max-w-md p-5 md:p-6">
          <div className="mb-7">
            <p className="mb-2 text-xs tracking-[0.22em] text-cyan-200/80 uppercase">Flyability Internal</p>
            <h2 className="text-2xl font-semibold md:text-3xl">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-200/80">
              Continue with Google or use email/password.
            </p>
          </div>
          <div className="space-y-4">
            {!supabaseConfigured && (
              <p className="rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                Supabase is not configured for this deployment. Add `NEXT_PUBLIC_SUPABASE_URL` and
                `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel and redeploy.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                void handleGoogleSignIn();
              }}
              disabled={loading || !supabaseConfigured}
              className="h-12 w-full rounded-xl bg-cyan-400/90 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-70"
            >
              {loading ? "Redirecting..." : "Continue with Google"}
            </button>
            <p className="text-xs text-slate-300/80">Only `@flyability.com` accounts can access this app.</p>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-[11px] uppercase tracking-[0.12em] text-slate-300/75">Fallback login</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1.5">
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

            <form onSubmit={onSubmit} className="space-y-3">
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

              {mode === "signup" ? (
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
              ) : null}

              <button
                type="submit"
                disabled={loading || !supabaseConfigured}
                className="h-12 w-full rounded-xl border border-white/25 bg-white/10 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:opacity-70"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in with password" : "Create account"}
              </button>
            </form>
          </div>

          {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </div>
      </motion.section>
    </main>
  );
}
