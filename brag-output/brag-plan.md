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
- **Dashboard.** `Good morning, Emil` and the three real module cards landing an eighth apart —
  Settings, Mail Composer, Time Tracker, each with its own accent and real description.
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
## Duration: 24.50 seconds

## Visual identity (from the project)
**Appearance: Solarized Light + the Dusty Blue accent** — the app under
`html[data-theme="light"][data-accent="blue"]`. Resolved from `web/src/app/tokens.css`:

- Page `#fcfaf5` (`--paper-3`) · Panel `#f4f1e9` (`--paper-2`) · Raised `#ebe7dd` (`--paper-1`)
- Ink `#586e75` · `#657b83` (ink-2) · `#6c7a80` (ink-3)
- Accent `#3e6d8e` (`--ac-strong`) · deep `#2f5876` (`--ac-deep`) · text `#35617f` (`--ac-text`)
- Accent gradient `#6e96b4` → `#35617f` (`--ac-from` → `--ac-to`)
- Warn `#9a7400` (the `VAC` badge family) · Positive `#6a8000` · Shade `#073642`
- Glass hairline is **ink-toned in light** (`--glass: #586e75`), used with alpha for every
  border and fill — not white
- Contrast note: `--ink-4` `#839496` only clears 3:1 on paper, so it is never used for real
  text here; body copy is `#586e75` / `#657b83` and every accent label is `#35617f`.
- Display + body font: **Geist**; numerals **Geist Mono**, `tabular-nums`
- Easing: the app's own `--ease-fluid` `cubic-bezier(0.22, 1, 0.36, 1)` (GSAP `power4.out`)
- Strongest visual elements: the day card (rounded-xl, badge chips, segmented progress bar) and
  the StatTile row.

## Share copy (draft)
Flya Allrounder: one login, and the whole week is one screen. Log a day in a click, have Claude
draft the training email, then see who actually clicked — scanners excluded.

## Audio direction
- Role: **narration first**, a bespoke score under it, and a light interaction layer.
- **Voiceover: Kokoro `bf_emma`** — a measured British female read, generated locally by
  `npx hyperframes tts`. Five lines, placed against the picture rather than reading it:
  1. `0.45` "One login, and the whole workspace is already there."
  2. `7.10` "Click a day, set it to vacation, and save. The overtime bank updates itself."
  3. `13.85` "Describe the training, and get a finished draft in Gmail."
  4. `17.50` "Then see who actually clicked. Security scanners don't count."
  5. `22.70` "Flya Allrounder."
  The two text beats are deliberately **not** narrated — the type carries those alone.
- Music: `assets/music/flya-theme.mp3`, bespoke (`assets/music/make-theme.py`). 120 BPM, A minor,
  i–VI–III–VII, sidechained sub bass, plucked arp, offbeat hats, backbeat clap. It sits at 0.19–0.22
  under the voice and **swells to 0.34–0.36 in the gaps** — which are exactly the two text beats
  and the beat before the lockup.
- Arrangement: pad only 0–2 (login), arp in at 2 (dashboard), full groove 4–16, **break 16–17**
  (drums out, riser), **drop at 17.00** landing on the Mail Tracking reveal, tail from 23.
- **Whooshes reworked: damp and lean.** The previous pair were broadband noise sweeps and read
  as hissy. `assets/sfx/make-sfx.py` now builds them from noise driven through a lowpass whose
  cutoff never leaves the low-mids (140 Hz → ~760 Hz → 140 Hz), mixed with a soft sine swell and
  shaped by a raised-sine envelope — no transient, no tail, no hiss. 0.22s for scene changes,
  0.34s for the one bigger move into Mail Tracking.
- Rest of the kit is synthesised to match: `ui-click`, `ui-tick`, `impact`, `sub-boom`, `bell`,
  and a dry `cut` marker on each jump cut. Only six CC0 keypresses remain sampled.
- Volumes: VO 1.0 · music 0.19–0.36 · whooshes 0.26–0.40 · clicks 0.32–0.34 · ticks 0.15–0.22 ·
  cut markers 0.22–0.26 · typing 0.13. Mixed peak **−2.0 dBFS**, mean −20.4 dB.
- Audio-reactive: subtle. The score's RMS/bass drive faint dusty-blue washes; on paper these are
  barely-there tints rather than glows.

## Storyboard

### Scene 1 — Sign in → the dashboard — 5.00s (0.00 → 5.00)
Opens on the real login card centred on `#020617`: **Flyability Internal** eyebrow,
**Welcome back**, and the `Continue with Google` button. An oversized cursor enters from the
lower right and presses it at **2.00s**. The card drops away and the dashboard assembles:
**Good morning, Emil** at 2.30s with the subtitle *"Everything in one place."* beneath it, then
the three module cards a signed-in user actually lands on — **Settings · Mail Composer · Time
Tracker**, in that real order, each with its tinted icon, its real one-line description and its
`Continue →` affordance — arriving an eighth apart on **3.00 / 3.25 / 3.50**. (Mail tracking is
admin-only and lives inside Admin, so it is deliberately not a card here.)
Sequential/interaction: yes — a real cursor press on the sign-in button, then three cards on
consecutive beat-grid eighths.
Audio intent: establish, then arrive. The click is the first thing you hear over the bed.
Audio-coupled idea: click on the sign-in press; whoosh as the dashboard replaces the card; one
soft tick per module card.
Transition mood: clean wipe → Scene 2

### Scene 2 — Time Tracker — 7.00s (5.00 → 12.00)
The week view: header **Time Tracker**, and the readouts `Weekly hours:` **32.7** and
`Overtime bank:` **+4h 05m**. Five day cards (**Mon–Fri**) cascade in on beats **5.50 / 6.00 / 6.50 / 7.00 / 7.50**, each showing its weekday, a `%` figure, `8h 12m worked`, and the
segmented cyan progress bar from the real component. Caption at 6.00: *"Your whole week."*

At **8.00** (beat) the cursor clicks the **Thu** card. At **8.50** the day editor opens over a
dimmed week: `Day type` as four chips — **Normal · Vacation · Public Holiday · Sick leave** —
plus `Start` **08:15**, `Stop` **17:30**, `Breaks` **45 min**. At **9.50** the cursor picks
**Vacation**; the chip turns amber and the real helper line appears: *"Excused from your target.
Hours logged count as overtime."* At **10.00** it presses **Save day**. At **10.50** the editor
whooshes out and the Thu card returns carrying an amber **VAC** badge reading **Vacation**,
while `Overtime bank` ticks up to **+12h 05m**. Caption at 10.40: *"Click a day. Done."*
Sequential/interaction: yes — five cards on the beat grid, then three simulated cursor actions
(open, pick a type, save).
Audio intent: the texture of using the app. Every action answers back.
Audio-coupled idea: soft drop per day card; click + whoosh on the card press; click on the
Vacation chip; click on Save day; whoosh + soft chime as the editor closes and the badge lands.
Transition mood: clean wipe → Scene 3

### Scene 3 — Mail Composer — 5.00s (12.00 → 17.00)
Form on the left, live preview on the right. `Company Name` → **Alpine Grid AG**,
`Training type` → **Operator**, `Training days` → **2** fill on beats **12.50 / 13.00 / 13.50**.
The `Training brief` field then types out *"Two-day operator training, on site."* character by
character. The cursor presses **Generate draft** at **14.50** (beat); the button flips to
**Generating…**. At **15.00** (beat) the preview panel slides in with the written mail — greeting,
body, a tracked link, and the **Create Gmail draft** button waiting for a human. Caption at
15.00: *"Describe it. Get a draft."*
Sequential/interaction: yes — three beat-locked fields, per-character typing, one cursor press.
Audio intent: work happening quickly and cleanly.
Audio-coupled idea: soft drop per field; thinned keypresses under the typing; click on Generate
draft; whoosh + card-slide as the preview lands.
Transition mood: clean wipe, preceded by the riser → Scene 4

### Scene 4 — Mail Tracking — 5.00s (17.00 → 22.00)
The riser tops out and at **17.00s** (strong cue, beat-locked) the Mail Tracking panel lands
hard — big whoosh, impact and sub-boom together. Four `StatTile` cards cascade on beats
**17.50 / 18.00 / 18.50 / 19.00**: **Mails sent 148 · Recipients 96 · Real clicks 312 ·
Scanner clicks 972**. The full set then holds.

At **20.00s** (strong cue, beat-locked) `Scanner clicks` drops to 30% and a bright rule strikes
through its value while `Real clicks` takes a cyan border and glow. Caption at 20.40:
*"See who actually clicked."* Holds to 22.01.
Sequential/interaction: yes — four tiles on the beat grid, then one deliberate state change.
Audio intent: the biggest moment in the video, twice — the entrance and the payoff.
Audio-coupled idea: riser into 17.02; whoosh-big + sub-boom + impact at 17.02; soft drop per
tile; impact + sub-boom at the 20.02 strike.
Transition mood: soft → Scene 5

### Scene 5 — Lockup — 2.50s (22.00 → 24.50)
Full `#020617`. The gradient mark lands at **22.50** (beat). At **23.00s** (strong cue,
beat-locked) the wordmark **Flya Allrounder** settles beneath it with a deep bell allowed to
ring over the music fade. `flya.space` appears in Geist Mono at **23.35**. Everything holds to
24.50s.
Sequential/interaction: none — a three-step lockup, each element held past its reading floor.
Audio intent: one resonant close, then the bed retreats.
Audio-coupled idea: soft whoosh into the mark; deep bell on the wordmark.
Transition mood: — (end)

**Music mood for this video:** driving, energetic, scored to a hard 120 BPM grid.
**Audio summary:** A 0.35 bed runs the full 24.50s. Every scene change is whooshed, every
cursor action is clicked, and every cascading element has its own soft cue on the beat. A 1.3s
riser builds into the Mail Tracking entrance at 17.02, where a big whoosh, an impact and a
sub-boom land together; the same weight returns on the strike-through at 20.02. A single deep
bell closes it on the wordmark at 23.02 as the bed fades out.
