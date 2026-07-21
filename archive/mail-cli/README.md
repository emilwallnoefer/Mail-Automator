# Archived: Python `/mail` CLI

Retired 2026-07-21. **Nothing here is imported or executed by the web app** — it is kept
for reference only, because parts of it had drifted from the runtime copies (see below).

This was the project's original workflow, before `web/` existed: you typed `/mail` in
Cursor, it collected the training-email fields in one block, rendered the mail from
`templates/training-email-templates.md` + the link rules in `config/*.json`, and created a
Gmail draft through a local OAuth bridge. Superseded by the dashboard's Mail Composer,
which does the same job with per-user OAuth tokens in Supabase, workspace settings, link
click-tracking, and Brief mode.

## Contents

| Path | Was |
|---|---|
| `mail_workflow.py` | `scripts/mail_workflow.py` — render / dry-run / create-draft CLI |
| `gmail_bridge.py` | `scripts/gmail_bridge.py` — local OAuth bridge, `gmail.compose` scope, draft-only |
| `templates/training-email-templates.md` | `templates/` |
| `config/*.json` | `config/` — training links, industry links, useful-links policy |
| `cursor-mail-command.md` | `.cursor/commands/mail.md` — the `/mail` command contract |

The bridge never sent mail; it only created drafts, and only after an explicit
`confirm draft`. That rule still governs the web app's draft flow.

## Drift found when archiving

The web app keeps its own runtime copies in `web/src/mail-config/`. Comparing them:

- `industry-training-links.json`, `useful-links-policy.json` — identical.
- `training-email-templates.md` — the **web copy is newer** (305 vs 288 lines, no template
  IDs unique to this one). Nothing lost here.
- `training-links.json` — **this copy has two URLs the web app does not have**:
  - `WASTEWATER_ONLINE_COURSE_URL` → `https://flyabilityacademy.thinkific.com/courses/elios-3-wastewater-training`
  - `FARO_CONNECT_ONLINE_COURSE_URL` → `https://flyabilityacademy.thinkific.com/courses/Faro-connect-online-course`

  This is the main reason the directory is archived rather than deleted. Whether those two
  belong in `web/src/mail-config/training-links.json` is an open question — they may have
  been dropped deliberately, or missed during the port.

## Running it again

It is not wired into anything, so it would need its own setup: Python with
`google-api-python-client` / `google-auth-oauthlib`, plus `credentials.json` and
`token.json` next to the scripts (both git-ignored, never committed — verified across full
history when this was archived). Paths inside the scripts assume the old repo-root layout,
so they would need adjusting.
