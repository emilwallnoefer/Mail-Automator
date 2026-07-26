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
//   5. The run-3 F1/F2 fix: SECURITY DEFINER RPCs are not a way around RLS —
//      tt_refresh_overtime_bank_stats refuses a foreign p_user (while still
//      working for your own), and tt_resolve_audit_user_id is not callable.
//   6. The run-3 F4 fix: time_tracker_user_stats.overtime_bank_mins is readable
//      but not writable by its own user (it is a derived cache admins report on).
//
// Note what (5) exists for: before run-3 this script checked table isolation
// only, and never called an RPC. A SECURITY DEFINER function bypasses RLS by
// design, so table-level checks cannot see that class of hole at all.
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

  // 5. run-3 F1/F2 — SECURITY DEFINER RPCs must not be a way around RLS.
  //
  // This is the class the earlier revisions of this script missed entirely: it
  // asserted table isolation but never called an RPC, and a definer function
  // bypasses RLS by design. Two functions were created without the
  // `revoke ... from public` that every other RPC pairs with its grant.
  {
    // 5a. tt_refresh_overtime_bank_stats must refuse a foreign p_user.
    const { data: crossData, error: crossErr } = await a.supabase.rpc(
      "tt_refresh_overtime_bank_stats",
      { p_user: b.user.id },
    );
    check(
      "tt_refresh_overtime_bank_stats: A cannot read B's overtime bank",
      Boolean(crossErr),
      crossErr ? `refused: ${crossErr.code ?? crossErr.message}` : `LEAKED value=${JSON.stringify(crossData)}`,
    );

    // 5b. ...but must still work for the caller's own id, or the Time Tracker
    // silently loses its overtime bank.
    const { error: ownErr } = await a.supabase.rpc("tt_refresh_overtime_bank_stats", {
      p_user: a.user.id,
    });
    check(
      "tt_refresh_overtime_bank_stats: A can still refresh its own stats",
      !ownErr,
      ownErr ? `unexpectedly refused: ${ownErr.message}` : "ok",
    );

    // 5c. tt_resolve_audit_user_id is a trigger helper; no client should reach
    // it. It maps a sequential day_log_id to its owning user id.
    const { data: resolveData, error: resolveErr } = await a.supabase.rpc(
      "tt_resolve_audit_user_id",
      { p_table_name: "time_day_breaks", p_new_row: { day_log_id: 1 }, p_old_row: null },
    );
    check(
      "tt_resolve_audit_user_id: not callable by a user",
      Boolean(resolveErr),
      resolveErr ? `refused: ${resolveErr.code ?? resolveErr.message}` : `CALLABLE, returned ${JSON.stringify(resolveData)}`,
    );
  }

  // 6. run-3 F4 — the overtime bank cache must not be client-writable. It is a
  // derived value that Admin -> Team time reports verbatim.
  {
    const { error } = await a.supabase
      .from("time_tracker_user_stats")
      .update({ overtime_bank_mins: 99999 })
      .eq("user_id", a.user.id);
    check(
      "time_tracker_user_stats: A cannot forge its own overtime bank",
      Boolean(error),
      error ? `refused: ${error.code ?? error.message}` : "UPDATE ACCEPTED",
    );

    // Reading it must still work — the Time Tracker depends on it.
    const { error: readErr } = await a.supabase
      .from("time_tracker_user_stats")
      .select("overtime_bank_mins")
      .eq("user_id", a.user.id)
      .maybeSingle();
    check(
      "time_tracker_user_stats: A can still read its own row",
      !readErr,
      readErr ? `unexpectedly refused: ${readErr.message}` : "ok",
    );
  }

  console.log(`\n${failures === 0 ? "All RLS checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nRLS smoke test errored:", err.message);
  process.exit(1);
});
