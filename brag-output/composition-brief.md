# Hyperframes Composition Brief: Flya Allrounder

## Objective
A guided product tour of Flya Allrounder, Flyability's internal workspace — walked in the order
you actually use it, with **how little work each step takes** as the through-line.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: 24.50 seconds

## Source Material
- Project root: `<repo>/web` (Next.js 16 App Router + Supabase + Tailwind 4)
- Primary files read:
  - `web/src/app/tokens.css` — the design-token set (dark = base skin)
  - `web/src/app/layout.tsx`, `web/src/app/login/` — product name, fonts, the login card
  - `web/src/components/dashboard-shell.tsx` — greeting, module names, `Continue` affordance
  - `web/src/components/time-tracker/day-card.tsx` — day tile, badge chips, segmented bar
  - `web/src/components/time-tracker/day-logger-modal.tsx` — `Day type` chips, times, `Save day`
  - `web/src/components/time-tracker/time-tracker-panel.tsx` — `Weekly hours:` / `Overtime bank:`
  - `web/src/components/mail-composer/mail-composer-panel.tsx` — fields and buttons
  - `web/src/components/mail-tracking/stat-tile.tsx` + `tabs/` — the StatTile row and its labels
- Product name: **Flya Allrounder** · domain `flya.space`
- Copy that must appear verbatim (all real app copy):
  - `Flyability Internal` / `Welcome back` / `Continue with Google` / `Good morning`
  - `Time Tracker` / `Mail Composer` / `Settings` / `Continue` (the three real dashboard cards)
  - `Gmail, signatures, travel mapping, sounds, and account tools.`
  - `Training email drafts and Gmail handoff in one flow.`
  - `Workdays, breaks, compensation time, and overtime in one place.`
  - `Mail tracking` (the admin section heading)
  - `Weekly hours:` / `Overtime bank:` / `8h 12m worked` / `Vacation` / `VAC`
  - `Day type` / `Normal` / `Vacation` / `Public Holiday` / `Sick leave` / `Start` / `Stop` /
    `Breaks` / `Save day`
  - `Excused from your target. Hours logged count as overtime.`
  - `Company Name` / `Training type` / `Training days` / `Training brief`
  - `Generate draft` → `Generating…` → `Create Gmail draft`
  - `Mails sent` / `Recipients` / `Real clicks` / `Scanner clicks` / `Hidden unless enabled`

## Creative Direction
- Tone preset: **app-store** — clean feature reveals, smooth wipes, a consistent light SFX layer
- Creative direction: *a product tour that moves like the product does — fast, scored, never
  confusing*
- Angle: no claims, no pitch. Show the app being easy. The week is one screen, a day is one
  click, a mail is one button, the tracking is one row of numbers.
- Hook: the login card, one press of `Continue with Google`, and the whole dashboard is simply
  there in under a second. The hook is the speed of arrival.
- Outro: gradient mark, **Flya Allrounder**, `flya.space`. Nothing else — the tour said it.
- Avoid:
  - Generic SaaS language and abstract filler
  - Any visual redesign — the palette and type are the app's
  - Any implication that the product sends mail on its own; it drafts only
  - Inventing product behaviour: an unlogged day must read as unlogged

## Visual Identity
Verbatim from `web/src/app/tokens.css` (`:root`, the dark base skin):

- Surface `#020617` · Panel `#0f172a` · Raised `#1e293b`
- Ink `#f1f5f9` · `#cbd5e1` · `#94a3b8`
- Accent `#22d3ee` · soft `#a5f3fc` · gradient `#67e8f9` → `#818cf8`
- Positive `#a7f3d0` · Warn `#fde68a` (the real `VAC` badge tone)
- Glass hairline: `#ffffff` at 10–15% for borders, 5% for fills
- Display + body **Geist**, numerals **Geist Mono** with `tabular-nums`
- Easing: the app's `--ease-fluid` `cubic-bezier(0.22, 1, 0.36, 1)`
- Fonts are **vendored locally** in `assets/fonts/` — the render must not touch the network.

## Storyboard
`brag-output/brag-plan.md` is the creative contract. Scene summary:

1. **Sign in → dashboard** — 5.00s (0.00 → 5.00) — the login card, one cursor press at 2.00,
   then `Good morning, Emil` and the three real module cards (Settings · Mail Composer · Time
   Tracker) arriving on 3.00 / 3.25 / 3.50.
2. **Time Tracker** — 7.00s (5.00 → 12.00) — five day cards cascade on 5.50–7.50; the cursor
   opens Thursday (8.00), the editor opens (8.50), `Vacation` is picked (9.50), `Save day` is
   pressed (10.00), the editor closes (10.50) and the card returns with a `VAC` badge while the
   overtime bank ticks +4h 05m → +12h 05m.
3. **Mail Composer** — 5.00s (12.00 → 17.00) — fields fill on 12.50 / 13.00 / 13.50, the brief
   types itself, `Generate draft` is pressed at 14.50, the preview lands at 15.00.
4. **Mail Tracking** — 5.00s (17.00 → 22.00) — the panel lands **on the drop** at 17.00, four
   tiles cascade on 17.50–19.00, then at 20.00 `Scanner clicks` strikes through and `Real
   clicks` lights up.
5. **Lockup** — 2.50s (22.00 → 24.50) — mark at 22.50, wordmark at 23.00, `flya.space` at 23.35.

## Audio
- Role: **a score written for this edit**, plus a light interaction layer.
- Music: `assets/music/flya-theme.mp3` — **bespoke**, produced by `assets/music/make-theme.py`.
  Modern minimal electronica: 120 BPM, A minor, i–VI–III–VII, sidechained sub bass, plucked arp,
  offbeat hats, backbeat clap. Volume 0.44; the track fades itself out, so no volume tween.
- Arrangement is mapped to the cut: pad only 0–2 (login), arp in at 2 (dashboard), full groove
  4–16 (Time Tracker + Composer), **break 16–17** (drums out, riser, 16th hats), **drop at 17.00**
  landing on the Mail Tracking reveal, outro tail from 23.
- Because the score is ours, the grid is exact: every scene boundary and every sequential reveal
  sits on a 0.50s beat from t=0.
- SFX: a fully synthesised kit in `assets/sfx/synth/` — `ui-click`, `ui-tick`, `whoosh-soft`,
  `whoosh-big`, `impact`, `sub-boom`, `bell`. Only six CC0 keypresses remain sampled.
- The riser and the 17.00 hit live in the music and are **not** doubled by SFX.
- Volumes: music 0.44 · whooshes 0.30–0.40 · clicks 0.42–0.45 · ticks 0.20–0.30 · typing 0.20 ·
  payoff 0.32–0.40 · bell 0.38. Mixed peak −1.8 dBFS, mean −22.4 dB.
- Audio-reactive: subtle. The score's RMS/bass drive blurred accent glows via CSS custom
  properties. Nothing that moves, scales or reflows text.

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`
and `hyperframes-cli`. Do not enter the `hyperframes` entry-point intent interview.

Requirements:
- Rebuild real screens from the real components — this is a tour, so fidelity is the whole point.
- Reading floors: short label ~0.8s settled, a sentence ~0.3s per word (min ~1.2s). Every caption
  must clear its floor; do not compress a hold to make room for motion.
- Keep the video inside the 15–25s law.
- Use local assets only. No network at render time.
- Run `hyperframes check` before render and fix every error, contrast included.

---

## Build notes (v3 — final)

Third and final cut. v1 was a single-claim video; v2 turned it into a functionality tour; v3
replaces the music entirely, cleans the sound design, and fixes the dashboard to match the app.

- **The bundled music is gone.** "Happy Beats / Business Moves" read as corporate library music
  and did not match the product. `assets/music/make-theme.py` now generates the score:
  deterministic (fixed seed), 120 BPM, A minor, with the arrangement written around this edit —
  a break at 16–17s and a drop landing exactly on the Mail Tracking reveal at 17.00.
- **HeyGen's 10k-track catalog was not used.** Its CLI installs via
  `curl -fsSL https://static.heygen.ai/cli/install.sh | bash` and then needs either
  `heygen auth login --oauth` (opens a browser) or an API key pasted at a prompt. Both require
  the account holder, so the catalog stayed out of reach and the score was authored instead.
- **Timing is now exact, not approximated.** v2 snapped to beats *detected* in a stock track;
  v3 owns the tempo, so every boundary and reveal is a clean multiple of 0.50s from t=0.
- **The SFX kit was rebuilt and thinned.** All Kenney samples were dropped except six keypresses.
  The synthesised kit shares a palette with the score, and the big 17.00 moment is carried by the
  music alone rather than stacked with SFX.
- **Levels fixed.** The first v3 render peaked at −0.0 dBFS (clipping); music and payoff cues were
  pulled down to land at **−1.8 dBFS peak / −22.4 dB mean**.
- **The dashboard now matches the real app**: three cards — Settings, Mail Composer, Time Tracker —
  in `dashboard-shell.tsx`'s real order, with their real tinted icons, real one-line descriptions
  and `Continue` affordance. Mail tracking is admin-only and correctly absent as a card.
- **Motion vocabulary unified**: one `rise()` helper and one `press()` helper drive every
  entrance and every button tap, so panels (0.45s), cards (0.36s) and captions (0.40s) all
  decelerate on the same curve. Nothing bounces or idles.

Fidelity notes carried forward from v2: every screen is rebuilt from the real components, and
Thursday reads as genuinely unlogged (`0%`, `0h 00m worked`, empty bar) until the day is saved.

**Gate result:** `hyperframes check` — 0 errors, **49/49 WCAG AA text checks pass**. Remaining
output is one `composition_file_too_large` warning (monolithic by choice) and informational
overlap/occlusion notes from the intentional crossfades and the day-editor dim.
