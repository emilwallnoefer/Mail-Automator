# Security Audit — Mail Automator (`web/`) — run-2

**Date:** 2026-07-02
**Target:** `web/` (current branch, incl. the run-1 security-event feature)
**Method:** Cloudflare `security-audit` pipeline. Phase 1 recon ran as a **full parallel fleet this time** (3 agents), weighted to the areas run-1 under-covered; Phase 2/3 hunting+adversarial validation was done against source at the exact sinks. Read run-1's `findings.json` first to skip known issues and target gaps.

## Executive summary

This run went after the surfaces run-1 flagged as uncovered — the mail-tracking admin queries, the team-chat tables + Storage bucket, the Google Sheets ingestion, the time-tracker write path, the settings routes, and a full RLS sweep of all 16 tables. **Most of it is solid**, which is worth stating plainly: the mail-tracking routes have no injection or IDOR, the time-tracker write path takes `user_id` only from the session, account deletion is self-scoped, the settings routes are per-user, Google Sheets reads a fixed spreadsheet id with validated column letters, company-research fetches a hardcoded host (not SSRF), and RLS postures are correct across all 16 tables. Two new exploitable issues surfaced, both **integrity** rather than disclosure: model-authored prose in Brief mode reaches the outgoing email HTML through an unescaped markdown renderer, and the team-chat INSERT grant lets a user forge their message's displayed identity.

## New findings (this run)

| # | Severity | Title |
|---|----------|-------|
| 5 | **MEDIUM** | HTML injection into outgoing Brief-mode emails via unescaped markdown link/image URLs |
| 6 | **MEDIUM** | Team-chat message identity spoofing via unconstrained INSERT columns |

(Numbers continue from run-1's #1–#4.)

### 5. HTML injection into Brief-mode emails via unescaped markdown URLs — MEDIUM
`markdownBlockToHtml` (`src/lib/mail-engine.ts:231-234` for images, `239-241` for links) interpolates the URL into `src="…"` / `href="…"` **without HTML-escaping**, and the capture is `[^)]+`, so a `"` in the URL breaks out of the attribute. This runs (`renderBriefMail`, line 717) over model-authored prose (`opener`/`recap_intro`/`feedback_ask`/`closing`) driven by the unauthenticated `/api/generate-brief` brief. A crafted brief makes the model emit `[label](https://evil…)` / `![x](…" onerror="…)`, producing attacker-chosen links, remote images (tracking pixels), or broken-out HTML in the outgoing customer email — defeating the "links are never model-authored, tracking can never break" guarantee the code documents. Executable JS is blunted by email-client sanitizers and there is no in-app `dangerouslySetInnerHTML` sink for `html_body`, so the concrete impact is email/link/tracking integrity, not reliable XSS.
**Fix:** HTML-escape + scheme-validate the URL (allow only `https:`/`cid:`), tighten the capture to forbid quotes/whitespace, or strip markdown links/images from model prose entirely (the plain-text path already does via `stripMarkdownLinks`).

### 6. Team-chat message identity spoofing via unconstrained INSERT columns — MEDIUM
`chat_messages` grants `authenticated` a **table-wide** INSERT (`supabase/2026-04-19-team-chat.sql:39`) and the insert policy checks only `auth.uid() = sender_id` (`:48-51`). `sender_email` is a free-text NOT NULL column (`:18`) that the UI uses to render each message's name/avatar. A user calling `.from('chat_messages').insert(...)` directly (bypassing `sendChatMessage`) can keep their own `sender_id` but set `sender_email` to anyone's — impersonating a colleague/admin in the shared channel — and can pre-set the moderation fields `done_at`/`done_by`/`kind` at creation (those are only column-restricted on UPDATE).
**Fix:** a BEFORE INSERT trigger that stamps `sender_email` from `auth.jwt()->>'email'` and nulls `done_at`/`done_by`; or a column-scoped insert grant binding `sender_email` to the JWT.

## Hardening notes (defense-in-depth, not standalone findings)

- **H5 — `time_tracker_audit_log` is missing `force row level security`** (`supabase/time-tracker-durability.sql:24`). It's the only one of the 16 tables that enables RLS without forcing it; matters only for the table-owning role. Add `force` for consistency.
- **H6 — `chat-attachments` bucket-wide SELECT + client-only size cap.** The Storage SELECT policy is `using (bucket_id = 'chat-attachments')` for all authenticated (`team-chat.sql:76-80`), and the 10 MiB limit is enforced only client-side (`chat.ts:309-313`). Because every message row (and its `attachment_path`) is already team-wide readable by design, this grants little beyond the intended model — but it does allow reading orphaned/unreferenced objects and uploading oversized files. Scope the read policy and add a bucket-level size limit if you want to tighten it.
- **H7 — `/api/generate` unauthenticated outbound fetch.** Anonymous callers drive up to 3 `duckduckgo.com` fetches per request via `enrichWithAutoResearch` (`company-research.ts:57`). Fixed host, so not SSRF, but compute/outbound amplification — same unauthenticated-endpoint family as run-1 #3.
- **H8 — Unsanitized Sheets `range` from user_metadata.** `travel_sheet_mapping.range` flows into the Sheets API unvalidated (`google-sheets.ts:115,154-157`); bounded to the same fixed spreadsheet the user's own OAuth already grants, so low impact. The `settings/travel-mapping` route doesn't expose `range`, so this is only reachable if metadata is seeded elsewhere.

## What the codebase does well (calibration)

- **Mail-tracking admin routes**: every param is validated/clamped and bound; queries use PostgREST builders with fixed columns or `SECURITY DEFINER` RPCs granted to `service_role` only. No injection, no IDOR within the single-tenant admin model.
- **RLS sweep (16 tables)**: per-user tables scope every policy on `auth.uid()`; service-role-only tables are deny-all with grants revoked; the two team-wide tables (`chat_messages`, `chat_message_votes`) are intentionally global-read. All correct (bar the `force` nit in H5).
- **Time-tracker writes**: `user_id` always comes from the session, never the body; minutes are zod- and CHECK-bounded; the audit log is trigger-populated and client-immutable.
- **account/delete**: deletes only the caller's own auth user (id from session), rate-limited.
- **Settings + onboarding routes**: all `getUser`-gated and self-scoped; travel-mapping column letters are `^[A-Z]+$`-validated.
- **Credentials**: Sheets/Gmail use the user's own OAuth refresh token against a fixed spreadsheet id; no service-account keys, no cross-tenant credential reuse.

## Coverage across both runs

- **run-1**: access control, public endpoints, OAuth, secrets → #1 (HIGH, hr escalation), #2 (MEDIUM, Gmail token in metadata), #3 (MEDIUM, unauth paid-LLM), #4 (LOW, OAuth CSRF).
- **run-2**: mail-tracking, chat + storage, sheets, time-tracker, settings, RLS sweep → #5 (MEDIUM, email HTML injection), #6 (MEDIUM, chat spoofing).

Between the two runs the main subsystems have now been covered. Residual areas for a future pass: the outgoing-email HTML builders under fully-untrusted input (structured `/api/generate` path), and a live-environment test of the RLS policies against a real anon JWT (this audit read policy SQL, it did not execute it).
