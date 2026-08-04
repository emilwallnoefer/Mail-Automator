# Hyperframes Composition Brief: Flya Allrounder

## Objective
A guided product tour of Flya Allrounder, Flyability's internal workspace — walked in the order
you actually use it, with **how little work each step takes** as the through-line.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: 24.52 seconds

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
  - `Time Tracker` / `Mail Composer` / `Mail tracking` / `Settings` / `Continue`
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

1. **Sign in → dashboard** — 5.03s (0.00 → 5.03) — the login card, one cursor press, then
   `Good morning, Emil` and four module cards landing in pairs on beats 3.02 / 3.52.
2. **Time Tracker** — 6.99s (5.03 → 12.02) — five day cards cascade on the beat grid; the cursor
   opens Thursday, picks `Vacation`, presses `Save day`; the card returns with a `VAC` badge and
   the overtime bank ticks +4h 05m → +12h 05m.
3. **Mail Composer** — 5.00s (12.02 → 17.02) — three fields fill, the brief types itself, one
   press of `Generate draft`, the live preview lands.
4. **Mail Tracking** — 4.99s (17.02 → 22.01) — the StatTile row lands hard on a strong cue, four
   tiles cascade, then `Scanner clicks` strikes through and `Real clicks` lights up.
5. **Lockup** — 2.51s (22.01 → 24.52) — mark, wordmark, `flya.space`.

## Audio
- Role: **driving bed + a dense, immersive accent layer.** This cut is scored, not decorated.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — the most energetic bundled
  track, 120.19 BPM, at volume 0.35, fading to 0 across the final 1.2s (23.32 → 24.52).
- Music cue guidance: bundled preset in `assets/music/cues/`. The beat grid is a clean 0.50s
  pulse from 3.02s, and **every scene boundary and sequential reveal sits on it**.
  - **Strong-cue locks (3):** `17.02` (Mail Tracking lands), `20.02` (the Real/Scanner payoff),
    `23.02` (the wordmark) — all 1.00-intensity strong beats.
  - **Beat grids:** module cards `3.02 / 3.52`; day cards `5.53 / 6.03 / 6.52 / 7.02 / 7.52`;
    editor `8.52`, Vacation `9.52`, Save `10.02`, close `10.52`; fields
    `12.52 / 13.01 / 13.51`, Generate `14.52`, preview `15.02`; tiles
    `17.52 / 18.02 / 18.52 / 19.02`.
- **Whooshes** on every scene change and on the day editor opening/closing; a bigger one carries
  the Mail Tracking entrance.
- **Riser** — 1.3s, 15.72 → 17.02, the one deliberately cinematic gesture.
- **Sub-boom** under both strong-cue payoffs (17.02, 20.02) for weight.
- **Clicks** on every cursor action; **soft drops** on every cascading element, on the beat.
- Audio-reactive: subtle. Music RMS/bass drive blurred accent glows behind the active panel and
  the outro mark via CSS custom properties. Nothing that moves, scales or reflows text; no
  waveform, equalizer or particle visuals.
- Volumes: music 0.35 · whooshes 0.45–0.62 · clicks 0.55–0.60 · soft cues 0.42–0.45 · typing
  0.28 · payoff stacks up to 0.72. Target: nothing clips.

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

## Build notes (what actually shipped — v2, the functionality tour)

This is the **second cut**. The first was a single-claim video built on Real vs Scanner clicks;
this one is a guided tour through the app in the order you use it, per the follow-up brief:
sign in → Time Tracker → Mail Composer → Mail Tracking, with simplicity as the through-line.

Structure and timing changes:

- **Runtime 24.52s** (was 23.46s), five scenes, every boundary on the music's beat grid.
- **Scene order is now the user's order.** Login/dashboard and Time Tracker are new; the
  Real/Scanner payoff moved from the opening claim to the closing beat of the tour.
- **Music swapped** to `happy-beats-business-moves-vol-1` — the most energetic bundled track
  (120.19 BPM vs vol-12's 109.96), which gives the 0.50s beat grid everything is scored to.
- **Captions are now counts of effort**, not claims: "Your whole week." / "Click a day. Done." /
  "Describe it. Get a draft." / "See who actually clicked."

Audio — the layer the follow-up asked for:

- **Whooshes, riser and sub-boom are synthesised in this repo**, not sourced. The bundled CC0
  library has no whoosh, and the HeyGen catalog behind `media-use --type bgm` needs an
  interactive OAuth login. `assets/sfx/synth/*.wav` are generated by a seeded numpy script
  (fixed seed `20260804`): noise driven through a per-sample sweeping one-pole lowpass for the
  whooshes, an exponentially falling sine for the sub-boom, and a rising filtered-noise plus
  pitch ramp for the riser.
- **26 cues over 24.5s**: 5 clicks (one per cursor action), 7 whooshes (every scene change plus
  the day editor opening and closing), 14 soft drops (one per cascading card/field/tile), a
  1.3s riser into 17.02, two sub-boom + impact stacks on the strong cues, and one bell on the
  wordmark.
- Mixed peak is **−0.4 dBFS, mean −23.4 dB** — dense but not clipping.
- Honest limitation: the bundled library is corporate-upbeat, not orchestral. The "epic" here
  comes from arrangement (riser + sub-boom + a hard beat grid), not from an orchestral bed. A
  genuinely cinematic track needs `heygen auth login --oauth`, which is the user's to run.

Fidelity notes:

- Every screen is rebuilt from the real components: the login card, the dashboard greeting and
  module cards, the day card (badges, `%`, segmented bar), the day editor (`Day type` chips with
  the real Normal/Vacation/Public Holiday/Sick leave set, the real "Excused from your target"
  helper line, `Start`/`Stop`/`Breaks`, `Save day`), the composer, and the StatTile row.
- **Thursday is genuinely unlogged before the edit** — `0%`, `0h 00m worked`, empty bar — and
  only fills once Vacation is saved. An unlogged day showing 100% would have been a lie about
  the product.
- `--ease-fluid` is approximated by GSAP `power4.out` (same quintic-out family, no CustomEase
  plugin needed).
- `hyperframes check` caught a real bug during the build: `Save day` was positioned in viewport
  coordinates inside an absolutely-positioned modal (`escaped_container`), which put it off the
  panel. Fixed to modal-relative coordinates.
- **Gate result:** 0 errors, **49/49 WCAG AA text checks pass**. Remaining output is one
  `composition_file_too_large` warning (monolithic by choice) and informational overlap/occlusion
  notes from the intentional crossfades and the day-editor dim.
