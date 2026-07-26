# Archived: Python `/mail` CLI

Retired 2026-07-21. **Nothing here is imported or executed by the web app** — it is kept
for reference only. The config drift that originally justified keeping it turned out to be a
false alarm and was resolved 2026-07-26 (see below); the directory stays as history.

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
- `training-links.json` — **resolved 2026-07-26: the drift was a false alarm.** This copy
  carried two keys the web app's `training-links.json` does not have
  (`WASTEWATER_ONLINE_COURSE_URL`, `FARO_CONNECT_ONLINE_COURSE_URL`), but both courses *are*
  offered by the web app — it keeps their URLs on the course entries in
  `web/src/mail-config/industry-training-links.json` (`wastewater`, `faro_connect`, which
  become the `thinkific_wastewater` / `thinkific_faro_connect` composer options), byte-identical
  to the ones that were here. Nothing was dropped in the port; the two keys were simply
  redundant, so they have been removed here. No drift remains.

## Running it again

It is not wired into anything, so it would need its own setup: Python with
`google-api-python-client` / `google-auth-oauthlib`, plus `credentials.json` and
`token.json` next to the scripts (both git-ignored, never committed — verified across full
history when this was archived). Paths inside the scripts assume the old repo-root layout,
so they would need adjusting.
