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
## Duration: 24.80 seconds — hard cuts between scenes, **two** camera moves within them

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
- Role: **a fast score written for this edit**, plus a light interaction layer. **No voiceover** —
  the cut is quick enough that narration would fight it.
- Music: `assets/music/flya-theme.mp3`, bespoke (`assets/music/make-theme.py`). **150 BPM**
  (0.40s beat, 1.60s bar), A minor, i–VI–III–VII. Short dry 16th arp notes, 16th hats with an
  accent pattern, a hard backbeat clap, a pushed offbeat kick in the drop, and a sidechained sub.
  Constant 0.40 — no ducking, and the track fades itself out.
- Arrangement, mapped to the cut:
  - `0.0–1.6` pad + pluck, no drums — the login card, wide
  - `1.6–15.2` full groove — dashboard, tracker, composer
  - `15.2–16.0` **build**: drums thin out, riser, accelerating hats
  - `16.0–21.6` **drop** — lands exactly on the Mail Tracking cut
  - `21.6–23.2` tail under the lockup
- **Whooshes: darker, longer, mostly tonal.** Two rounds of "still too bright" led here — the
  cutoff now peaks at ~300 Hz (soft) / ~380 Hz (big) instead of 760/980, they run 0.55s / 0.85s
  instead of 0.22s / 0.34s, and 62% of the signal is a low tonal swell rather than noise. The
  envelope is asymmetric (swell into a longer decay) instead of a symmetric bump. Measured:
  **only 0.4–0.6% of the energy sits above 1 kHz** — the band that was making them hiss. Each
  whoosh now starts ~0.25s *before* its cut so the swell leads into it.
- **A click on every word** as the text beats build (six in total, ~0.26).
- Every **zoom jump cut** gets a dry `cut` marker; every scene cut gets a whoosh; every press gets
  a click; every cascading element gets a tick.
- Volumes: music 0.40 · whooshes 0.30–0.34 · clicks 0.38–0.40 · cut markers 0.26–0.32 ·
  ticks 0.16–0.24 · typing 0.14 · payoff 0.24–0.30 · bell 0.30. Peak **−2.0 dBFS**, mean −22.0 dB.
- Audio-reactive: subtle dusty-blue washes driven by the score's RMS/bass.

## The cut

Nothing crossfades: scene changes are the framework's clip windows, hard cut on the 0.40s grid.

**Camera moves are now rare — two, not five.** Spamming them flattened their meaning, so they are
reserved for the two moments that genuinely need the room: choosing `Vacation` in the day editor,
and the `Real clicks` / `Scanner clicks` payoff. The login button, the Thursday card and
`Generate draft` all read fine at full width. Each remaining move is also gentler: less
magnification (1.55× and 2.0×), a smaller cut step (90% of final scale) and a longer drift (1.1s
in, 0.6s settle), so more of the move is motion and less of it is jump.

| Scene | In → out | |
|---|---|---|
| S1 sign-in → dashboard | 0.0 → 4.0 | `Login`; three module cards on one overlapping wave |
| T1 text | 4.0 → 5.6 | *"Your whole **week**."* — a click on every word |
| S2 Time Tracker | 5.6 → 11.2 | the rebuilt week; **camera move** on the `Day type` chips 9.2 → 10.0 |
| T2 text | 11.2 → 12.8 | *"Now the **email**."* |
| S3 Mail Composer | 12.8 → 16.0 | unchanged |
| S4 Mail Tracking | 16.0 → 22.4 | chart draws 16.2 → 18.1 · tiles 18.2 · **camera move** 19.6 → 21.0 |
| S5 lockup | 22.4 → 24.8 | |

## Cascades — one wave, not a queue

Cards used to run 0.24s each with 0.20s gaps, so consecutive cards overlapped by only 0.04s and
the group arrived as a queue. Now **0.50s each on a 0.11s stagger**, with a 0.985 → 1 scale
alongside the lift: four cards are in flight at once, which reads both smoother *and* quicker.
Per-card ticks dropped to ~0.11 so the tighter stagger is a soft riffle rather than a rattle.

## Time Tracker — rebuilt

The old page was five hollow boxes: `.day` was 300px tall with the progress bar pinned to the
bottom by `margin-top: auto`, and the weekly readouts floated in the top-right corner,
disconnected from the cards they described.

Now it sits in the same `.panel` container Mail Tracking uses — which is what anchors it — with:

- **a hero on the left**: `THIS WEEK`, `32.7` at 104px, `hours logged`, a hairline, then
  `+4h 05m` and `overtime bank`;
- **five dense day cards on the right**, each running day → hours → bar → percentage with nothing
  floating: the bar sits directly under the hours and carries a **target notch at 8h30**, which is
  what makes the fill mean something.

## Mail Tracking — rebuilt around a rising chart

A `#3e6d8e` line over a gradient area, rising across seven day buckets
(18 · 26 · 34 · 45 · 52 · 61 · 76 — summing to the 312 on the `Real clicks` tile), with gridlines
and axis labels in the language of the app's own `timeline-chart.tsx`, and a dot riding the
leading edge as it draws. The four stat tiles restack as a compact 2×2 beside it so the chart is
the hero.

The line is revealed by translating a panel-coloured cover left→right — transform-only, so it
stays composited and seek-safe. The axes layer sits *above* the cover, so the grid is visible
throughout and only the line and area wipe in.

## Text beats — word by word
Both text beats build a word at a time, centred, sliding left to make room:

- The row is laid out left-aligned with `white-space: nowrap`; the words are `inline-block` and
  start at `opacity: 0`, so they occupy layout from the start and the row's width never changes.
- Each word fades in (0.18s) on a 0.26s cadence, and **the row's own `x` animates** to
  `(1920 − rightEdgeOf(word k)) / 2` over 0.24s with `power2.inOut` — ease in *and* out — so the
  visible sentence stays centred while the earlier words slide left.
- Widths are read from an off-screen twin (`#tb-measure`) through GSAP function-based values, so
  the measurement happens after the webfont has loaded rather than at parse time.
- The accent rule draws from its centre once the last word has landed.
