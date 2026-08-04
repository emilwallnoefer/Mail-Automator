# Hyperframes Composition Brief: Flya Allrounder

## Objective
Create a short launch-style brag video for Flya Allrounder, Flyability's internal workspace
for AI-drafted training email, honest link-click tracking, and time/overtime logging.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 23.46 seconds

## Source Material
- Project root: `<repo>/web` (Next.js 16 App Router + Supabase + Tailwind 4)
- Primary files read:
  - `web/src/app/tokens.css` — the full design-token set (dark = base skin)
  - `web/src/app/layout.tsx` — product name, description, fonts
  - `web/src/components/mail-tracking/stat-tile.tsx` — the exact StatTile markup to recreate
  - `web/src/components/mail-tracking/tabs/{recipients,links}-tab.tsx` — the real stat labels
  - `web/src/components/mail-composer/mail-composer-panel.tsx` — composer fields and buttons
  - `web/src/components/time-tracker/{time-tracker-panel,day-card}.tsx` — week readouts
  - `web/src/lib/release-notes.ts`, `web/README.md`, `CLAUDE.md`
- Product name: **Flya Allrounder**
- Tagline / strongest claim: the dashboard separates **Real clicks** from **Scanner clicks**,
  so corporate security scanners that auto-open every link never inflate the click rate.
- Key UI to recreate: the **Mail Tracking stat row** — four `StatTile` cards in a row. From
  `stat-tile.tsx`, each tile is:
  `rounded-xl border border-glass/10 bg-glass/5 px-4 py-3`, label
  `text-[11px] uppercase tracking-[0.15em] text-ink-3/70`, value
  `mt-1 text-xl font-semibold tabular-nums text-ink`, hint `mt-0.5 text-[11px] text-ink-4`.
  Scale the type up for 1080p legibility but keep the proportions and the tracking.
- Copy that must appear verbatim (all of it is real app copy):
  - `Mails sent` / `Recipients` / `Real clicks` / `Scanner clicks`
  - `Hidden unless enabled` (the real hint on the Scanner clicks tile)
  - `Company Name` / `Training type` / `Training days` / `Training brief`
  - `Generate draft` → `Generating…` → `Create Gmail draft`
  - `Weekly hours:` / `Overtime bank:`
  - `Flya Allrounder` / `flya.space`

## Creative Direction
- Tone preset: **polished** (with `app-store` structural influence — 5 scenes)
- Creative direction: *the quiet internal-tool flex — a dashboard that tells you the truth
  even when the truth is a smaller number*
- Interpretation: restrained motion, long settled holds, exact UI recreation over stylisation.
  Nothing bounces, nothing wobbles, no idle motion. The single emphatic beat in the whole
  video is the strike-through on `Scanner clicks` at 8.74s.
- Angle: every link tracker reports inflated numbers because corporate security scanners open
  every URL before a human sees it. Flya Allrounder is the one that refuses to count them, and
  puts the two figures in separate columns on the dashboard. The video proves that with the
  app's own stat row, then shows the two other things the workspace does properly — drafts
  that never send themselves, and an overtime bank that adds up.
- Hook: two hard-cut lines on near-black, no UI — **"Security scanners click your links."**
  then **"Your click rate is fiction."**
- Outro / punchline: **Flya Allrounder** — *"Four modules. One login. No inflated numbers."*
  then `flya.space`.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign — the palette and type are the app's, not a new brand
  - Any implication that the product sends mail on its own; it drafts only

## Visual Identity
Verbatim from `web/src/app/tokens.css` (`:root`, the dark base skin):

- Background / surface: `#020617`
- Panel: `#0f172a` · Raised: `#1e293b`
- Text: `#f1f5f9` (ink) · `#cbd5e1` (ink-3) · `#94a3b8` (ink-4) · `#64748b` (ink-5)
- Accent: `#22d3ee` · soft `#a5f3fc` · deep `#06b6d4`
- Accent gradient: `#67e8f9` → `#818cf8`
- Positive: `#a7f3d0` · Warn: `#fde68a`
- Glass hairline: `#ffffff` used only with alpha — borders at 10–15%, fills at 5%
- Display font: **Geist** · Body: **Geist** · Numerals: **Geist Mono**, always `tabular-nums`
- Shared easing (the app's own `--ease-fluid`): `cubic-bezier(0.22, 1, 0.36, 1)` — strong
  deceleration, immediate then settling. Use it for entrances so the video moves the way the
  app moves.
- Visual references from the project: the StatTile row; the `rounded-xl` + hairline-border +
  5%-white-fill card language used across every panel; the cyan progress bar on Time Tracker
  day cards; the near-black page with slate-900 panels.

**Fonts must be vendored locally.** Geist is loaded from Google Fonts in the app
(`next/font/google`), but the renderer must not depend on network fetches — download the
Geist and Geist Mono woff2 files into `composition/assets/fonts/` and declare them with
`@font-face`. If that fails, fall back to a locally available grotesque and note it.

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. **Hook** — 3.27s (0.00 → 3.27) — two lines on black; no UI. Must read:
   "Security scanners click your links." / "Your click rate is fiction."
2. **Real clicks vs scanner clicks** — 7.10s (3.27 → 10.37) — the recreated Mail Tracking
   stat row; four tiles cascade in on the beat grid, the set holds, then `Scanner clicks`
   strikes through and dims while `Real clicks` takes the cyan accent. Caption:
   "Only 312 of those were a person."
3. **The composer, and the rule** — 6.01s (10.37 → 16.38) — composer fields fill, the
   `Training brief` types out, a cursor clicks `Generate draft`, the live preview lands,
   then everything dims for the held line "It drafts. It never sends."
4. **Time Tracker** — 2.72s (16.38 → 19.10) — five day-card progress bars fill, then
   `Weekly hours: 41.5` and `Overtime bank: +6h 20m` count up.
5. **Lockup** — 4.36s (19.10 → 23.46) — gradient mark, wordmark, tagline, `flya.space`.

## Audio
- Audio role: warm bed with sparse professional accents
- Audio arc: a flat, unobtrusive bed for the full 23.46s with exactly three moments allowed
  to break through — the dry hit on the strike-through (8.74s), the typing/click texture
  through the composer (12.0–13.3s), and a single bell on the logo landing (19.66s) — then
  the bed fades out under the lockup.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and clean; the
  `polished` pick), starting at 0.0, volume **0.32**
- Music treatment: flat level throughout, no ducking; fade to 0 across the final 1.2s
  (22.26 → 23.46) under the lockup. Let the 19.66s bell ring over the fade.
- Music cue guidance: bundled preset — copy
  `~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  into `composition/assets/music/cues/`. Track is 109.96 BPM / 117.36s.
  - **Strong-cue locks (3):** `8.74` (Real/Scanner payoff), `13.11` (preview lands),
    `19.66` (logo mark). Mark each `// beat-locked: <t>s`.
  - **Beat-grid windows:** stat tiles `4.39 / 4.91 / 5.34 / 6.00`; composer fields
    `10.93 / 11.46 / 12.02`; time-tracker rows `16.93 / 17.47`. Mark each `// beat-grid: …`.
  - Readability note: the four stat tiles carry text, so they cascade fast on the grid and
    then the **whole set holds for ~2.7s** — do not stagger a new readable line onto every
    beat beyond that cascade.
- Audio-reactive treatment: **subtle**. Use music RMS to modulate (a) the intensity of a soft
  cyan glow behind the stat row in Scene 2 and (b) the presence of the outro mark's gradient
  in Scene 5. Nothing that moves, scales, or reflows text. No waveform, equalizer, note
  glyphs, or particles.
- Audio-coupled moments:
  - Scene 2, four-tile cascade — one soft drop per tile, on the beat, same timestamp as the
    visual
  - Scene 2, 8.74s strike-through — one dry announcement cue, the loudest moment in the video
  - Scene 3, typed `Training brief` — randomised keypresses, thinned to ~every other character
  - Scene 3, `Generate draft` — one mouse click at the cursor press
  - Scene 3, preview landing at 13.11s — one soft card-slide
  - Scene 4, counters — a short stacking tick that ends when the number settles
  - Scene 5, 19.66s mark landing — one deep bell, allowed to ring over the music fade
- SFX selection guidance: match the gesture. Card-like tiles want card/drop sounds; a cursor
  press wants a mouse click; the strike-through wants a single restrained announcement hit,
  not an impact. Roughly 6–8 cues total across 22 seconds — this is a `polished` edit and the
  bed should stay the dominant layer.
- SFX analysis guidance: read `~/.claude/skills/brag/assets/sfx/sfx-analysis.md` and prefer
  **low high-frequency-risk** files throughout; every cue here is either repeated or in a
  polished context.
- Volumes: music 0.32; SFX 0.55–0.70 (the 8.74s hit may go to 0.70, everything else below).
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume based on
  the animation as actually implemented.
- Audio files: copy the chosen music and every selected SFX into
  `brag-output/composition/assets/` before rendering. Relative paths only — never absolute.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition
contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design
spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and
`hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the
`hyperframes` entry-point intent interview and do not route into its generic promo /
launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI element from the source project — the StatTile row is the
  contract, recreated from the actual component's classes.
- Keep all text readable in the final render. Reading floors: short label ~0.8s settled,
  a sentence ~0.3s per word (min ~1.2s). Every line in the storyboard already meets this;
  do not compress a hold to make room for motion.
- Keep the video at 23.46s (within the 15–25s law).
- Include the planned music/SFX layer.
- Treat the `/brag` audio notes as guidance, not a fixed cue sheet — choose SFX after the
  visual animation exists.
- Treat music cue metadata as optional timing hints; ignore any cue that hurts readability,
  scene pacing, or the product story.
- Use exactly 3 strong-cue locks (8.74 / 13.11 / 19.66) within ±0.15s, and snap the
  sequential reveals to the listed beat grid within ±0.10s.
- Wire at least one visual element to per-frame audio data (see the audio-reactive treatment
  above). If extraction is unavailable, document it and continue — do not block the render.
- Use local assets for audio, fonts, and any runtime dependency. No network at render time.
- Run `hyperframes check` before render — it is brag's single gate. Fix every error it
  reports, including WCAG contrast findings. Note that `#94a3b8` on `#020617` and
  `#a5f3fc` on `#020617` both clear AA comfortably; `#64748b` on `#020617` does not — do not
  use ink-5 for real text.

## Build notes (what actually shipped)

Deviations from the brief above, all deliberate:

- **Runtime 23.46s, not 21.84s.** Scene 5 grew from 2.74s to 4.36s. The tagline is seven words
  and needs ~2.1s of settled time; the shorter scene failed the reading floor. Still inside the
  15-25s law.
- **`--ease-fluid` is approximated by GSAP `power4.out`.** The app's `cubic-bezier(0.22, 1,
  0.36, 1)` is a quintic-out curve; `power4.out` is the same family and needs no CustomEase
  plugin.
- **Scene 3 preview pane carries a "Nothing generated yet." placeholder** before the draft
  lands at 13.11s, so the panel is never an empty rectangle.
- **The `Scanner clicks` strike-through sits outside the dimmed content wrapper**, so it holds
  full strength while the numbers behind it drop to 30%.
- **Two extra tile hints** (`Same period` on Recipients, `Humans only` on Real clicks) keep the
  four tiles visually even. Both are consistent with the app's own hint language.
- **Audio-reactive is wired and live**: `extract-audio-data.py` produced 720 frames at 30fps
  (`assets/music/audio-data.js`); the timeline writes `--a-rms` / `--a-bass` per frame and two
  blurred accent glows read them via `calc()`. No GSAP tween touches those opacities.
- **Gate result:** `hyperframes check` — 0 errors, 33/33 WCAG AA text checks pass. Remaining
  output is one `composition_file_too_large` warning (monolithic by choice, 5 short scenes) and
  informational overlap notes from the intentional 0.30s crossfades.
