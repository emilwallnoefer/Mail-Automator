// RLS / authorization smoke test.
//
// Exercises the real attacker surface — the public anon key + a normal user
// session — and asserts the isolation guarantees the audit relies on. This is
// the counterpart to reading the policy SQL: it actually executes the attacks.
//
// It verifies, end to end:
//   1. Cross-user read isolation on time_day_logs (RLS).
//   2. The T0.1 fix: a user can still write user_metadata.role, but it does NOT
//      become app_metadata.role (which is what the app authorizes on).
//   3. The T0.5 fix: a spoofed chat sender_email is overwritten by the JWT email.
//   4. Service-role-only tables (security_events) are unreadable by a user.
//
// Requires (env, e.g. via `node --env-file=.env.local`):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   RLS_TEST_A_EMAIL, RLS_TEST_A_PASSWORD   (an ordinary, non-admin test user)
//   RLS_TEST_B_EMAIL, RLS_TEST_B_PASSWORD   (a second ordinary test user)
//
// Create the two test users once (Supabase dashboard → Authentication, or the
// signup flow). Neither should be in ADMIN_EMAILS. Run:
//   cd web && node --env-file=.env.local scripts/rls-smoke.mjs
//
// Exit code: 0 all passed · 1 a check failed · 2 not configured (skipped).

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const A_EMAIL = process.env.RLS_TEST_A_EMAIL;
const A_PASSWORD = process.env.RLS_TEST_A_PASSWORD;
const B_EMAIL = process.env.RLS_TEST_B_EMAIL;
const B_PASSWORD = process.env.RLS_TEST_B_PASSWORD;

if (!URL || !ANON || !A_EMAIL || !A_PASSWORD || !B_EMAIL || !B_PASSWORD) {
  console.error(
    "RLS smoke test skipped — missing env. Set NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY, and RLS_TEST_A_/RLS_TEST_B_ EMAIL+PASSWORD.\n" +
      "Run: cd web && node --env-file=.env.local scripts/rls-smoke.mjs",
  );
  process.exit(2);
}

let failures = 0;
function check(name, passed, detail = "") {
  const mark = passed ? "PASS" : "FAIL";
  if (!passed) failures += 1;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function freshClient() {
  // No session persistence — each client is an isolated, unauthenticated start.
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email, password) {
  const supabase = freshClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`sign-in failed for ${email}: ${error?.message ?? "no user"}`);
  }
  return { supabase, user: data.user };
}

async function main() {
  console.log("RLS / authorization smoke test\n");

  const a = await signIn(A_EMAIL, A_PASSWORD);
  const b = await signIn(B_EMAIL, B_PASSWORD);
  console.log(`Signed in A=${a.user.email} B=${b.user.email}\n`);

  // 1. Cross-user read isolation on time_day_logs.
  {
    const { data: own } = await a.supabase.from("time_day_logs").select("user_id").limit(1000);
    const ownClean = Array.isArray(own) && own.every((r) => r.user_id === a.user.id);
    check("time_day_logs: A only sees its own rows", ownClean, `${own?.length ?? 0} rows, all A`);

    const { data: cross } = await a.supabase
      .from("time_day_logs")
      .select("id")
      .eq("user_id", b.user.id);
    check("time_day_logs: A cannot read B's rows", (cross?.length ?? 0) === 0, `${cross?.length ?? 0} leaked`);
  }

  // 2. T0.1 — self-set role lands in user_metadata but NOT app_metadata.
  {
    const prevRole = a.user.user_metadata?.role ?? null;
    await a.supabase.auth.updateUser({ data: { role: "hr" } });
    const { data: refreshed } = await a.supabase.auth.getUser();
    const appRole = refreshed.user?.app_metadata?.role ?? null;
    const userRole = refreshed.user?.user_metadata?.role ?? null;
    check(
      "role escalation: app_metadata.role is NOT user-settable",
      appRole !== "hr",
      `app_metadata.role=${JSON.stringify(appRole)}, user_metadata.role=${JSON.stringify(userRole)}`,
    );
    // Restore prior user_metadata.role so the test is idempotent.
    await a.supabase.auth.updateUser({ data: { role: prevRole } });
  }

  // 3. T0.5 — spoofed chat sender_email is overwritten by the JWT email.
  {
    const spoof = "spoofed-admin@evil.example";
    const { data: inserted, error: insErr } = await a.supabase
      .from("chat_messages")
      .insert({ sender_id: a.user.id, sender_email: spoof, body: "rls-smoke test", kind: "message" })
      .select("id, sender_email")
      .single();
    if (insErr || !inserted) {
      check("chat spoof: message insert succeeded", false, insErr?.message ?? "no row");
    } else {
      check(
        "chat spoof: sender_email stamped from JWT, not client value",
        inserted.sender_email === a.user.email,
        `stored=${inserted.sender_email}`,
      );
      await a.supabase.from("chat_messages").delete().eq("id", inserted.id); // cleanup
    }
  }

  // 4. Service-role-only table is unreadable by an authenticated user.
  {
    const { data, error } = await a.supabase.from("security_events").select("id").limit(1);
    // Deny-all RLS returns an empty set (or an error); either means "no access".
    check("security_events: not readable by a user", (data?.length ?? 0) === 0, error ? `error: ${error.code}` : "0 rows");
  }

  console.log(`\n${failures === 0 ? "All RLS checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nRLS smoke test errored:", err.message);
  process.exit(1);
});
