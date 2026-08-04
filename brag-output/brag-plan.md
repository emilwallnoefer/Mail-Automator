# Brag Plan: Flya Allrounder

## What is this app?
Flya Allrounder is Flyability's internal workspace: it writes training emails with Claude,
drops them into Gmail as drafts, tracks who actually clicked the links, and logs everyone's
hours and overtime bank — all behind one Google sign-in.

## The angle
Every link tracker on earth reports inflated numbers, because corporate security scanners
open every URL in an inbound email before a human ever sees it. Flya Allrounder is the
tool that refuses to count those. The whole video is built on one honest, specific,
verifiable engineering decision — `Real clicks` and `Scanner clicks` are two different
tiles on the dashboard — and then shows the two other things the workspace does properly:
drafts that never send themselves, and an overtime bank that adds up.

The flex is precision, not scale. This is an internal tool that tells its users the truth.

## Hook (first 2-3 seconds)
Cold open on the app's own near-black `#020617`. Two short lines, hard-cut in:

> **Security scanners click your links.**
> **Your click rate is fiction.**

No UI yet. The claim lands first, the proof follows. It earns the next 18 seconds because
anyone who has ever read an email-tracking dashboard has quietly suspected exactly this.

## Key moments (the middle)
- The Mail Tracking stat row rebuilt tile-for-tile from `stat-tile.tsx` — four tiles
  cascading in: **Mails sent 148 · Recipients 96 · Real clicks 312 · Scanner clicks 972.**
- The payoff: `Scanner clicks` desaturates and takes a hairline strike-through while
  `Real clicks` picks up the cyan accent glow. Caption: *"Only 312 of those were a person."*
- The Mail Composer working: fields filling (`Company Name`, `Training type`, `Training days`),
  the `Training brief` textarea typing a real line, a cursor pressing **Generate draft** →
  the button flipping to **Generating…** → the live preview panel sliding in with the
  generated mail.
- The deadpan rule, held on screen: **It drafts. It never sends.**
- Time Tracker: the week bar filling and `Overtime bank:` counting up to `+6h 20m`.

## Outro / punchline
Logo lockup on black. **Flya Allrounder** — *"Four modules. One login. No inflated numbers."*
Then `flya.space`.

## User flow worth showing
Three beats of real use, pulled straight from the routed app rather than any marketing page:

1. **Entry** — Admin → Mail tracking, the stat row loads with the period's real numbers.
2. **Key action** — Mail Composer: fill the training brief, press `Generate draft`.
3. **Result** — the live preview renders the generated mail; `Create Gmail draft` sits
   waiting for a human to press it.

The Time Tracker week bar is a fourth, shorter beat that proves the workspace is more than
a mail tool.

## Tone
- Preset: **polished** (with `app-store` structural influence — five scenes rather than
  three, because the product genuinely has two halves to show)
- Creative direction: *the quiet internal-tool flex — a dashboard that tells you the truth
  even when the truth is a smaller number*
- Interpretation: restrained motion, long settled holds, no comedy timing. Type does the
  work; the UI recreations are exact rather than stylised. Nothing bounces. The only
  emphatic moment in the whole video is the strike-through on `Scanner clicks`.

## Format: landscape — 1920x1080
## Duration: 23.46 seconds

## Visual identity (from the project)
Pulled verbatim from `web/src/app/tokens.css` (the dark skin is the base skin).

- Background: `#020617` (`--surface`, slate-950)
- Panel: `#0f172a` (`--panel`, slate-900)
- Raised: `#1e293b` (`--raised`, slate-800)
- Text: `#f1f5f9` (`--ink`) · secondary `#cbd5e1` (`--ink-3`) · muted `#94a3b8` (`--ink-4`)
- Accent: `#22d3ee` (`--accent`, cyan-400) · soft `#a5f3fc` · deep `#06b6d4`
- Accent gradient: `#67e8f9` → `#818cf8` (`--accent-from` → `--accent-to`)
- Positive: `#a7f3d0` · Warn: `#fde68a`
- Glass hairline: `#ffffff` at 10–15% alpha (`border-glass/10`, `bg-glass/5`)
- Display font: **Geist** (`--font-geist-sans`)
- Body font: **Geist**; numerals **Geist Mono** (`--font-geist-mono`), `tabular-nums`
- Strongest visual element: the `StatTile` — `rounded-xl border border-glass/10 bg-glass/5`,
  an 11px uppercase `tracking-[0.15em]` label in `ink-3/70` over a `text-xl font-semibold
  tabular-nums` value. Four of them in a row is the app's signature.

## Share copy (draft)
Built Flya Allrounder — the internal workspace that writes our training emails with Claude,
drops them in Gmail as drafts, and counts link clicks honestly. Corporate scanners click
every link you send; this one puts them in their own column.

## Audio direction
- Role: warm bed with sparse professional accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` — steady and clean, the
  `polished` pick
- Music treatment: starts at 0.0 at volume 0.32, holds flat, fades to 0 over the last 1.2s
  under the logo lockup. No ducking elsewhere.
- Music cue guidance: bundled preset read from
  `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  (109.96 BPM, 117.36s). Strong-cue locks to target: **8.74s** (the Real/Scanner payoff),
  **13.11s** (the generated mail preview landing), **19.66s** (the logo mark). Beat-grid
  windows for sequential reveals: stat tiles at 4.39 / 4.91 / 5.34 / 6.00, composer fields
  at 10.93 / 11.46 / 12.02, time-tracker rows at 16.93 / 17.47.
- Audio-reactive treatment: subtle — use music RMS to let the cyan accent glow behind the
  stat row and the outro logo breathe slightly. No waveform, equalizer, or particle
  visuals; nothing that moves text.
- SFX posture: sparse. Roughly 6–8 cues across 22 seconds, all at 0.55–0.70.
- Audio-coupled moments: the four-tile cascade (one soft drop per tile), the strike-through
  payoff (one dry announcement cue), per-character typing in the `Training brief` field
  (randomised keypresses, thinned), the `Generate draft` cursor click, the preview landing,
  the overtime counter ticking, the final logo.
- Restraint rule: no sound on scene transitions themselves, nothing percussive under the
  hook lines, and no cue louder than the music bed's perceived level. If a moment is
  already carried by motion, it gets no SFX.

## Storyboard

### Scene 1 — Hook — 3.27s (0.00 → 3.27)
Full-bleed `#020617`. No UI, no chrome. A `#22d3ee` hairline rule draws in from the left
across the lower third as the second line lands. Line 1 hard-cuts in at 0.15s in Geist
SemiBold ~86px `#f1f5f9`: **"Security scanners click your links."** Line 2 at 1.65s, same
size, `#94a3b8`: **"Your click rate is fiction."** Both hold, fully settled, to 3.27s
(line 1 settled 3.1s, line 2 settled 1.6s — both well over the reading floor).
Sequential/interaction: none — two lines, both held, no per-word reveal.
Audio intent: the bed alone, establishing. Let the claim sit in near-silence.
Audio-coupled idea: none.
Music: steady, entering at full bed level.
Transition mood: clean → Scene 2

### Scene 2 — Real clicks vs scanner clicks — 7.10s (3.27 → 10.37)
The Mail Tracking stat row, rebuilt exactly: a `#0f172a` panel on `#020617`, an 11px
uppercase `tracking-[0.15em]` section label **"MAIL TRACKING"** in `#cbd5e1` at 70% top-left,
and four `StatTile` cards in a row — `rounded-xl`, 1px `#ffffff`/10 border, `#ffffff`/5 fill.

The four tiles cascade in fast (0.35s each, 8px rise + fade) on consecutive beats
**4.39 / 4.91 / 5.34 / 6.00**, then the complete set holds untouched for 2.7s:

| Mails sent | Recipients | Real clicks | Scanner clicks |
|---|---|---|---|
| 148 | 96 | 312 | 972 |
| Same period | Same period | Humans only | Hidden unless enabled |

At **8.74s** (strong cue, beat-locked): `Scanner clicks` drops to 35% opacity and a 1px
`#94a3b8` rule strikes through its value left-to-right in 0.4s, while `Real clicks` takes a
`#22d3ee` border and a soft cyan glow. Caption fades up beneath at 9.1s in `#a5f3fc`:
**"Only 312 of those were a person."** Holds to 10.37s.
Sequential/interaction: yes — four tiles arrive one by one on the beat grid, then the whole
set holds; the strike-through is a single deliberate state change, not an animation loop.
Audio intent: quiet arrivals, then one dry hit that means *this is the point of the video*.
Audio-coupled idea: soft drop per tile on each beat; one restrained announcement cue exactly
at the 8.74s strike.
Music: steady bed, unchanged.
Transition mood: soft → Scene 3

### Scene 3 — The composer, and the rule — 6.01s (10.37 → 16.38)
Left half: the Mail Composer form on a `#0f172a` panel. Three labelled fields fill on
beats **10.93 / 11.46 / 12.02** — `Company Name` → "Alpine Grid AG", `Training type` →
"Operator", `Training days` → "2". Then the `Training brief` textarea types out, character
by character, a real one-liner: *"Two-day operator training, on site, follow up on the
Elios 3 demo."*

An oversized cursor enters from the lower right and presses **Generate draft** at ~12.9s;
the button label flips to **Generating…**. At **13.11s** (strong cue, beat-locked) the live
preview panel slides in from the right and settles — a rendered mail with a visible greeting
line and a tracked link — and the button beneath it reads **Create Gmail draft**.

At 14.6s everything dims to 25% and one line holds centred in Geist SemiBold ~72px
`#f1f5f9`: **"It drafts. It never sends."** Settled 14.9 → 16.38 (1.5s, over the floor for
five words). This is the video's only editorial line and it gets the room.
Sequential/interaction: yes — three fields fill in sequence, the brief types character by
character, and a cursor visibly clicks `Generate draft`.
Audio intent: the texture of real work — typing, one click, one arrival.
Audio-coupled idea: randomised keypresses under the typed brief (thinned to roughly every
other character so it reads as typing, not machine-gun); one mouse click on the button; one
soft card-slide as the preview lands.
Music: steady bed.
Transition mood: clean → Scene 4

### Scene 4 — Time Tracker — 2.72s (16.38 → 19.10)
Hard cut to the Time Tracker week strip: five day cards in a row on `#0f172a`, each with a
thin `#22d3ee` progress bar. The bars fill left to right in a 0.5s cascade starting at
**16.93** (beat). At **17.47** (beat) two mono readouts count up in `tabular-nums`:
`Weekly hours:` **41.5** and `Overtime bank:` **+6h 20m** in `#a7f3d0`. Both settle by 18.2s
and hold to 19.10s.
Sequential/interaction: yes — five bars fill in sequence, then two counters tick up.
Audio intent: light, mechanical, brief. This scene is a proof point, not a feature tour.
Audio-coupled idea: a short stacking tick under the counter, ending exactly when it settles.
Music: steady bed.
Transition mood: soft → Scene 5

### Scene 5 — Lockup — 4.36s (19.10 → 23.46)
Back to full `#020617`. At **19.66s** (strong cue, beat-locked) the mark lands centre-frame:
a rounded-square glyph filled with the `#67e8f9` → `#818cf8` gradient. The wordmark
**Flya Allrounder** fades up beneath it at 20.19s (beat) in Geist SemiBold 82px `#f1f5f9`. At
20.75s (beat) the tagline settles below in `#94a3b8`: **"Four modules. One login. No inflated
numbers."** At 21.84s (beat) `flya.space` appears in Geist Mono `#a5f3fc`. Everything holds
to 23.46s.

The scene runs 4.36s rather than the 2.74s first sketched: the tagline is seven words, so the
reading floor is ~2.1s of settled time and a 2.74s scene could not pay it. Total runtime moved
21.84s → 23.46s, still inside the 15-25s law.
Sequential/interaction: none — a three-step lockup, each element held.
Audio intent: one resonant close, then the bed retreats.
Audio-coupled idea: a single deep bell exactly on the 19.66s mark landing, allowed to ring
over the music.
Music: bed continues, then fades to 0 across the final 1.2s (22.26 → 23.46).
Transition mood: — (end)

**Music mood for this video:** clean, steady, corporate-adjacent — supportive, never driving.
**Audio summary:** A flat, unobtrusive bed runs the whole 23.46s with three moments allowed
to break through it — the dry hit on the `Scanner clicks` strike-through at 8.74s, the
texture of typing and one cursor click through the composer, and a single bell on the logo
landing at 19.66s — before the bed fades out under the lockup.
