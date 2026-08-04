# Brag Plan: Flya Allrounder

## What is this app?
Flya Allrounder is Flyability's internal workspace. One Google sign-in opens a dashboard with
everything in it: log your hours for the week, have Claude write a training email and drop it
into Gmail as a draft, and see who actually clicked the links you sent.

## The angle
A guided tour, in the order you actually use the thing. No claims, no pitch — just the app
being easy. Sign in, land on the dashboard, log a day, generate a mail, check the tracking.
The whole point the video is making is **how few steps each of those takes**: the week is one
screen, a day is one click, a mail is one button, and the tracking is one row of numbers.

Simplicity is the flex. Every scene shows a real screen doing a real thing, and every caption
is a count of how little work it took.

## Hook (first 2-3 seconds)
The login card, then one click. `Continue with Google` gets pressed and the whole dashboard
assembles itself in under a second. The hook is the *speed of arrival* — you're in, and
everything is already there.

## Key moments (the middle)
- **Dashboard.** `Good morning, Emil` and the module cards landing in pairs — Time Tracker,
  Mail Composer, Mail tracking, Settings.
- **Time Tracker.** The whole week as five day cards, each with its own progress bar and
  `8h 12m worked`. Then: click Thursday → the day editor opens with `Day type`
  (Normal / Vacation / Public Holiday / Sick leave), `Start`, `Stop`, `Breaks` → pick
  **Vacation** → `Save day` → the card comes back carrying a `VAC` badge and the overtime
  bank ticks up.
- **Mail Composer.** Three fields fill, the `Training brief` types itself, one press of
  `Generate draft`, and the live preview lands with the written mail and `Create Gmail draft`.
- **Mail Tracking.** The stat row — `Mails sent` `Recipients` `Real clicks` `Scanner clicks` —
  then `Scanner clicks` strikes through and `Real clicks` lights up, because security scanners
  click every link and this dashboard refuses to count them.

## Outro / punchline
Gradient mark, **Flya Allrounder**, `flya.space`. Nothing else — the tour already said it.

## User flow worth showing
This whole video *is* the user flow, in sequence:

1. **Entry** — `Continue with Google` → the dashboard.
2. **Key action 1** — Time Tracker: click a day, set its type, save.
3. **Key action 2** — Mail Composer: describe the training, press Generate draft.
4. **Result** — Mail Tracking: the numbers that came back from what you sent.

## Tone
- Preset: **app-store** (clean feature-card reveals, smooth wipes, consistent light SFX layer)
- Creative direction: *a product tour that moves like the product does — fast, scored, and
  never confusing*
- Interpretation: every scene enters on a beat with a whoosh, every cursor action gets a click,
  every cascading element gets its own soft cue. Motion is quick (0.3–0.5s entrances) but every
  readable line still holds past its reading floor. Nothing wobbles or idles.

## Format: landscape — 1920x1080
## Duration: 24.52 seconds

## Visual identity (from the project)
Verbatim from `web/src/app/tokens.css` (dark = the base skin).

- Background: `#020617` · Panel: `#0f172a` · Raised: `#1e293b`
- Text: `#f1f5f9` (ink) · `#cbd5e1` (ink-3) · `#94a3b8` (ink-4)
- Accent: `#22d3ee` · soft `#a5f3fc` · gradient `#67e8f9` → `#818cf8`
- Positive `#a7f3d0` · Warn `#fde68a` (the real `VAC` badge colour) · violet `PH` · teal `SL`
- Glass hairline: `#ffffff` at 10–15% for borders, 5% for fills
- Display + body font: **Geist**; numerals **Geist Mono**, `tabular-nums`
- Easing: the app's own `--ease-fluid` `cubic-bezier(0.22, 1, 0.36, 1)` (GSAP `power4.out`)
- Strongest visual elements: the day card (rounded-xl, badge chips, segmented progress bar) and
  the StatTile row.

## Share copy (draft)
Flya Allrounder: one login, and the whole week is one screen. Log a day in a click, have Claude
draft the training email, then see who actually clicked — scanners excluded.

## Audio direction
- Role: **driving bed + dense immersive accent layer.** This cut is scored, not decorated.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — the most energetic bundled
  track (120.19 BPM, 163.96s). Volume 0.35, flat, fading to 0 across the final 1.2s.
- Music cue guidance: bundled preset,
  `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`.
  The beat grid runs on a clean 0.50s pulse from 3.02s. **Every scene boundary and every
  sequential reveal in this video sits on that grid** — which is what makes it feel scored.
  - **Strong-cue locks (3):** `17.02` (Mail Tracking lands), `20.02` (the Real/Scanner payoff),
    `23.02` (the wordmark). All three are 1.00-intensity strong beats.
  - **Beat grids:** module cards `3.02 / 3.52`; day cards `5.53 / 6.03 / 6.52 / 7.02 / 7.52`;
    day editor `8.52`, Vacation chip `9.52`, Save day `10.02`, editor closes `10.52`; composer
    fields `12.52 / 13.01 / 13.51`, Generate `14.52`, preview `15.02`; stat tiles
    `17.52 / 18.02 / 18.52 / 19.02`.
- **Whooshes** (synthesised for this cut — the bundled CC0 library has none): every scene
  transition, plus the day editor opening and closing. A bigger one carries the Mail Tracking
  entrance.
- **Riser**: 1.3s, building from 15.7s into the 17.02 strong cue. This is the one deliberately
  cinematic gesture in the video.
- **Sub-boom**: low falling sine under the two strong-cue payoffs (17.02, 20.02) — the weight
  that makes them land.
- **Clicks**: every cursor action — `Continue with Google`, the Thursday day card, the
  `Vacation` chip, `Save day`, `Generate draft`.
- **Soft cues**: one per cascading element (module cards, day cards, composer fields, stat
  tiles) at the same timestamp as the visual.
- Audio-reactive treatment: subtle — music RMS drives a cyan glow behind the active panel and
  the outro mark's presence. Nothing that moves, scales or reflows text; no waveform or
  equalizer visuals.
- Volumes: music 0.35; whooshes 0.5–0.62; clicks 0.55–0.62; soft cues 0.42–0.5; the two
  payoff stacks up to 0.72. Nothing clips the bed.
- Restraint rule: no cue is louder than the payoff at 20.02s, and the typing layer stays under
  0.3 so it reads as texture rather than as an instrument.

## Storyboard

### Scene 1 — Sign in → the dashboard — 5.03s (0.00 → 5.03)
Opens on the real login card centred on `#020617`: **Flyability Internal** eyebrow,
**Welcome back**, and the `Continue with Google` button. An oversized cursor enters from the
lower right and presses it at **1.85s**. The card drops away and the dashboard assembles:
**Good morning, Emil** at 2.30s with the subtitle *"Everything in one place."* beneath it, then
four module cards — **Time Tracker · Mail Composer · Mail tracking · Settings** — landing in
two pairs on beats **3.02** and **3.52**, each with its `Continue →` affordance.
Sequential/interaction: yes — a real cursor press on the sign-in button, then four cards in two
beat-locked pairs.
Audio intent: establish, then arrive. The click is the first thing you hear over the bed.
Audio-coupled idea: click on the sign-in press; whoosh as the dashboard replaces the card; one
soft drop per module-card pair.
Transition mood: clean wipe → Scene 2

### Scene 2 — Time Tracker — 6.99s (5.03 → 12.02)
The week view: header **Time Tracker**, and the readouts `Weekly hours:` **32.7** and
`Overtime bank:` **+4h 05m**. Five day cards (**Mon–Fri**) cascade in on beats **5.53 / 6.03 /
6.52 / 7.02 / 7.52**, each showing its weekday, a `%` figure, `8h 12m worked`, and the
segmented cyan progress bar from the real component. Caption at 6.03: *"Your whole week."*

At **8.02** (beat) the cursor clicks the **Thu** card. At **8.52** the day editor opens over a
dimmed week: `Day type` as four chips — **Normal · Vacation · Public Holiday · Sick leave** —
plus `Start` **08:15**, `Stop` **17:30**, `Breaks` **45 min**. At **9.52** the cursor picks
**Vacation**; the chip turns amber and the real helper line appears: *"Excused from your target.
Hours logged count as overtime."* At **10.02** it presses **Save day**. At **10.52** the editor
whooshes out and the Thu card returns carrying an amber **VAC** badge reading **Vacation**,
while `Overtime bank` ticks up to **+12h 05m**. Caption at 10.42: *"Click a day. Done."*
Sequential/interaction: yes — five cards on the beat grid, then three simulated cursor actions
(open, pick a type, save).
Audio intent: the texture of using the app. Every action answers back.
Audio-coupled idea: soft drop per day card; click + whoosh on the card press; click on the
Vacation chip; click on Save day; whoosh + soft chime as the editor closes and the badge lands.
Transition mood: clean wipe → Scene 3

### Scene 3 — Mail Composer — 5.00s (12.02 → 17.02)
Form on the left, live preview on the right. `Company Name` → **Alpine Grid AG**,
`Training type` → **Operator**, `Training days` → **2** fill on beats **12.52 / 13.01 / 13.51**.
The `Training brief` field then types out *"Two-day operator training, on site."* character by
character. The cursor presses **Generate draft** at **14.52** (beat); the button flips to
**Generating…**. At **15.02** (beat) the preview panel slides in with the written mail — greeting,
body, a tracked link, and the **Create Gmail draft** button waiting for a human. Caption at
15.02: *"Describe it. Get a draft."*
Sequential/interaction: yes — three beat-locked fields, per-character typing, one cursor press.
Audio intent: work happening quickly and cleanly.
Audio-coupled idea: soft drop per field; thinned keypresses under the typing; click on Generate
draft; whoosh + card-slide as the preview lands.
Transition mood: clean wipe, preceded by the riser → Scene 4

### Scene 4 — Mail Tracking — 4.99s (17.02 → 22.01)
The riser tops out and at **17.02s** (strong cue, beat-locked) the Mail Tracking panel lands
hard — big whoosh, impact and sub-boom together. Four `StatTile` cards cascade on beats
**17.52 / 18.02 / 18.52 / 19.02**: **Mails sent 148 · Recipients 96 · Real clicks 312 ·
Scanner clicks 972**. The full set then holds.

At **20.02s** (strong cue, beat-locked) `Scanner clicks` drops to 30% and a bright rule strikes
through its value while `Real clicks` takes a cyan border and glow. Caption at 20.40:
*"See who actually clicked."* Holds to 22.01.
Sequential/interaction: yes — four tiles on the beat grid, then one deliberate state change.
Audio intent: the biggest moment in the video, twice — the entrance and the payoff.
Audio-coupled idea: riser into 17.02; whoosh-big + sub-boom + impact at 17.02; soft drop per
tile; impact + sub-boom at the 20.02 strike.
Transition mood: soft → Scene 5

### Scene 5 — Lockup — 2.51s (22.01 → 24.52)
Full `#020617`. The gradient mark lands at **22.51** (beat). At **23.02s** (strong cue,
beat-locked) the wordmark **Flya Allrounder** settles beneath it with a deep bell allowed to
ring over the music fade. `flya.space` appears in Geist Mono at **23.35**. Everything holds to
24.52s.
Sequential/interaction: none — a three-step lockup, each element held past its reading floor.
Audio intent: one resonant close, then the bed retreats.
Audio-coupled idea: soft whoosh into the mark; deep bell on the wordmark.
Transition mood: — (end)

**Music mood for this video:** driving, energetic, scored to a hard 120 BPM grid.
**Audio summary:** A 0.35 bed runs the full 24.52s. Every scene change is whooshed, every
cursor action is clicked, and every cascading element has its own soft cue on the beat. A 1.3s
riser builds into the Mail Tracking entrance at 17.02, where a big whoosh, an impact and a
sub-boom land together; the same weight returns on the strike-through at 20.02. A single deep
bell closes it on the wordmark at 23.02 as the bed fades out.
