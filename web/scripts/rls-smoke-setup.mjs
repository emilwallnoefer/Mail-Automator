// One-time setup for `npm run test:rls`.
//
// The RLS/RPC smoke suite needs two ordinary, non-admin accounts so it can prove
// that user A cannot reach user B's data. Creating them by hand through the
// dashboard is the main reason that suite goes unrun, so this does it for you.
//
//   cd web && npm run test:rls:setup          # dry run: shows what it would do
//   cd web && npm run test:rls:setup -- --yes # actually create them
//
// WHAT IT CHANGES, so you can decide before running with --yes:
//   * Creates (or reuses) two confirmed users in your Supabase project's auth.
//   * They are REAL users. They will show up in Admin -> Users & roles and in
//     Admin -> Team time with no logged hours, and they count toward any seat
//     limit. They are given no role, so they stay non-admin and non-HR — which
//     is exactly what the test needs.
//   * It never touches an existing user other than to read that it exists.
//
// Prefer running this against a STAGING project. If you only have production,
// the accounts are harmless but they are visible to admins.
//
// Requires in the env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (service role, because creating a user is an admin operation).

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--yes");

const USERS = [
  { slot: "A", email: process.env.RLS_TEST_A_EMAIL || "rls-test-a@mail-automator.test" },
  { slot: "B", email: process.env.RLS_TEST_B_EMAIL || "rls-test-b@mail-automator.test" },
];

if (!URL_ || !SERVICE_KEY) {
  console.error(
    "Missing env. This script needs:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  SUPABASE_SERVICE_ROLE_KEY   (Supabase dashboard -> Settings -> API -> service_role)\n\n" +
      "Put them in web/.env or web/.env.local and re-run.",
  );
  process.exit(2);
}

function generatePassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

const admin = createClient(URL_, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findByEmail(email) {
  // listUsers is paginated; these projects are small, but page anyway.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = (data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if ((data?.users ?? []).length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`Supabase project: ${URL_}`);
  console.log(APPLY ? "Mode: APPLY (will create users)\n" : "Mode: DRY RUN (nothing will be created)\n");

  const results = [];

  for (const { slot, email } of USERS) {
    const existing = await findByEmail(email);

    if (existing) {
      const role = existing.app_metadata?.role ?? null;
      if (role) {
        console.error(
          `  [${slot}] ${email} exists but has app_metadata.role="${role}".\n` +
            "      The suite needs ORDINARY users — an HR/admin account would make the\n" +
            "      cross-user assertions pass for the wrong reason. Clear the role or pick\n" +
            "      another address via RLS_TEST_" + slot + "_EMAIL.",
        );
        process.exitCode = 1;
        continue;
      }
      console.log(`  [${slot}] ${email} — already exists, reusing (id ${existing.id})`);
      results.push({ slot, email, password: null, created: false });
      continue;
    }

    if (!APPLY) {
      console.log(`  [${slot}] ${email} — would be CREATED`);
      results.push({ slot, email, password: null, created: false });
      continue;
    }

    const password = generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
    console.log(`  [${slot}] ${email} — created (id ${data.user.id})`);
    results.push({ slot, email, password, created: true });
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --yes to create the missing accounts:");
    console.log("  npm run test:rls:setup -- --yes");
    return;
  }

  const created = results.filter((r) => r.created);
  if (created.length > 0) {
    console.log("\nAdd these to web/.env.local — the passwords are shown ONCE:\n");
    for (const r of results) {
      console.log(`RLS_TEST_${r.slot}_EMAIL=${r.email}`);
      if (r.password) console.log(`RLS_TEST_${r.slot}_PASSWORD=${r.password}`);
      else console.log(`RLS_TEST_${r.slot}_PASSWORD=<existing account — use its known password>`);
    }
    console.log("\nThen run:  npm run test:rls");
  } else {
    console.log("\nNothing to create. If the suite still reports missing env, add the");
    console.log("RLS_TEST_*_EMAIL / RLS_TEST_*_PASSWORD lines to web/.env.local.");
  }
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
