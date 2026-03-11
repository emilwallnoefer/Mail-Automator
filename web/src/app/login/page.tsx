"use client";

import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN;
    if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain}`)) {
      setError(`Please use your @${allowedDomain} email.`);
      setLoading(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    setMessage("Magic link sent. Open your email to continue.");
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6"
      >
        <div className="glass-card w-full max-w-md p-8 md:p-10">
          <div className="mb-8">
            <p className="mb-2 text-xs tracking-[0.22em] text-cyan-200/80 uppercase">
              Flyability Internal
            </p>
            <h1 className="text-2xl font-semibold md:text-3xl">Mail Automator</h1>
            <p className="mt-2 text-sm text-slate-200/80">
              Sign in with your Flyability email to create Gmail drafts.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-100/90">Work email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@flyability.com"
                className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-cyan-300/70 focus:bg-white/15"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-cyan-400/90 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-70"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>

          {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </div>
      </motion.section>
    </main>
  );
}
