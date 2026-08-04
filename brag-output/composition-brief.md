# Hyperframes Composition Brief: Flya Allrounder

## Objective
A guided product tour of Flya Allrounder, Flyability's internal workspace — walked in the order
you actually use it, with **how little work each step takes** as the through-line.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Appearance: **Solarized Light + Dusty Blue accent** (`data-theme="light"` `data-accent="blue"`)
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

## Build notes (v4 — final)

v1 was a single-claim video, v2 a functionality tour, v3 replaced the music. v4 moves the whole
film to the light appearance, adds narration, and changes how it is cut.

- **Appearance is now Solarized Light + Dusty Blue** (`data-theme="light"` `data-accent="blue"`),
  resolved from `tokens.css`. This is a real re-skin, not an inversion: `--glass` is ink-toned in
  light, so every hairline and fill uses `rgba(88,110,117,…)` rather than white; panels get real
  shadows because a light UI needs elevation; and the modal scrim is `--shade #073642` at 20%.
  `--ink-4` was dropped for text entirely — it only reaches 3:1 on paper.
- **A professional female voiceover** (Kokoro `bf_emma`, generated locally with
  `npx hyperframes tts`) runs across all five scenes. It complements the picture rather than
  reading it, and the two text beats are left unnarrated on purpose. Music ducks to ~0.19 under
  the voice and swells to ~0.35 in the gaps.
- **The whooshes were rebuilt.** The old ones were broadband noise sweeps — hissy and cheap.
  `assets/sfx/make-sfx.py` now low-passes them hard (cutoff peaks at ~760 Hz) and mixes in a sine
  swell, with a raised-sine envelope so there is no transient and no tail: damp and lean.
- **Background is now a moving colour.** `#stage-bg` tweens across the paper tones
  (`#fcfaf5` → `#faf7ef` → `#f6f2e8`), cools to `#eaeff4`/`#e6edf3` through the break and the
  Mail Tracking section, then warms back to `#fcfaf5` for the lockup.
- **Three jump cuts** punch in on the task at hand and cut straight back out — hard `tl.set`
  transforms, one frame, no easing: the Thursday card as it is clicked (8.50–9.00), the
  `Generate draft` button as it is pressed (15.00–15.50), and the Real/Scanner pair as the
  strike lands (20.00–20.50). Each gets a dry `cut` marker in the mix.
- **Two full-frame text beats** replace the old in-corner captions at the scene seams —
  *"Your whole **week**."* (4.0–5.5) and *"Now the **email**."* (12.0–13.5) — so the film is not
  wall-to-wall UI. Both are timed past their reading floor.
- Runtime stays 24.50s on the exact 120 BPM grid; the score did not need regenerating because
  the new beats were placed on it.
- **Levels:** peak −2.0 dBFS, mean −20.4 dB (higher than the un-narrated cut, as expected with
  voice).

Fidelity notes carried forward: every screen is rebuilt from the real components; the dashboard
shows only the three real cards (Settings, Mail Composer, Time Tracker); Thursday reads as
genuinely unlogged until the day is saved.

**Gate result:** `hyperframes check` — 0 errors, **42/42 WCAG AA text checks pass** on the light
skin. Remaining output is one `composition_file_too_large` warning and informational
overlap/overflow notes from the intentional crossfades, the day-editor dim, and the jump-cut
zoom wrappers.
