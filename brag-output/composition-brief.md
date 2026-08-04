# Hyperframes Composition Brief: Flya Allrounder

## Objective
A guided product tour of Flya Allrounder, Flyability's internal workspace — walked in the order
you actually use it, with **how little work each step takes** as the through-line.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Appearance: **Solarized Light + Dusty Blue accent** (`data-theme="light"` `data-accent="blue"`)
- Duration: 23.20 seconds

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

## Build notes (v7 — final)

Two fixes on top of v6: the camera reads as a cut again, and a real rendering bug is gone.

### The rendering bug (why frames looked broken)

GSAP's `fromTo` defaults to **`immediateRender: true`** — it applies its *from* values the moment
the tween is created, not when the playhead reaches it. With chained `fromTo`s that is disastrous:

- The five background tweens each applied their from-colour at build time, last one winning, so
  the entire opening rendered on `#e6edf3` — the cool blue that belongs to the Mail Tracking
  section.
- Every camera **pull-back** tween applied its zoomed from-state at build time, leaving the zoom
  wrappers stuck framed. That is the magnified, offset login card in the reported frame.

Snapshots hid it because `snapshot` seeks forward from 0 and the first tween to render corrects
the state; the renderer's five parallel workers seek independently and exposed it. Fixed by
marking every chained `fromTo` `immediateRender: false` except the one that legitimately owns the
opening state.

Two related seek-safety fixes while in there:

- **`tl.set()` is not revertible** — the playhead moving back past a zero-duration tween does not
  undo it, and a worker whose first seek is *after* it never applies it at all. `show()`/`hide()`
  and the state flips are now sub-frame (0.02s) `fromTo`s, which look identical and behave.
- **`tl.call()` is suppressed during seeks**, so the `Generate draft` → `Generating…` text swap
  could silently not happen. It is now two stacked labels cross-faded. The audio-reactive washes
  were ~700 `tl.call()`s for the same reason — replaced with one tween whose `onUpdate` samples
  the frame table.

### The camera reads as a cut again

v6 replaced the jump cut with a 350ms animated push, which lost the cut entirely. It is now both:
a **0.02s cut** to the new framing at 94% scale, then a **drift** to 100% over up to 0.8s; and on
the way out, a **cut** back to wide landing 3.5% tight, then a 0.4s settle. So the framing change
is instant — as it should be — and the shot still moves.

### Framing

- The `Day type` punch now centres on the **chip block** (960, 457) at ×1.7 rather than on the
  Vacation chip, which had pushed the modal against the left edge of frame.
- The Mail Tracking punch went to ×2.0 for a clean two-up on `Real clicks` / `Scanner clicks`,
  instead of ×1.6 leaving a half-tile sliver.
- The cursor is now visible making the Vacation choice.

**Gate result:** `hyperframes check` — 0 errors, **40/40 WCAG AA text checks pass**.
Levels: peak −2.0 dBFS. Runtime 23.20s.
