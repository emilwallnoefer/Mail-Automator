# /brag skill — local additions

Everything learned building `brag-output/` was folded back into the installed `/brag` skill at
`~/.agents/skills/brag/` (symlinked from `~/.claude/skills/brag/`).

**Those edits are not permanent.** `/brag` is a third-party skill installed with
`npx skills add latent-spaces/brag@brag`; running `npx skills update brag` (or reinstalling)
overwrites the whole directory. This folder is the backup — re-apply from here if that happens.

## What was added

| File | Change |
|---|---|
| `references/render-safety.md` | **New.** The GSAP seek-safety traps that pass `check` and still ship a broken mp4, plus how to verify the rendered file and the mix. Copy kept here as `render-safety.md`. |
| `SKILL.md` | Step 3 now reads `render-safety.md` before writing the timeline, and says plainly that `check` is necessary but not sufficient. Step 4's gate now requires inspecting the **rendered** file frame-by-frame and checking levels with `volumedetect`. |
| `references/step-3-compose.md` | Added "Two motion recipes worth reusing" — the cut-then-drift camera move (with the `transform-origin` maths) and the word-by-word centred text build. Self-review checklist gained three seek-safety items. |
| `references/step-4-deliver.md` | New "Verify the rendered file" section before the poster step — `ffmpeg … tile` contact sheets and `volumedetect`. |
| `references/audio.md` | Added "When the library doesn't have the sound" (synthesising a damp/lean whoosh and the rest of a coherent kit), "When the library's music doesn't fit" (scoring to the edit), and "Check the mix before you ship". |

## Why `render-safety.md` exists

Three GSAP behaviours are invisible to `check`/`snapshot` — which drive the timeline forward from
0 in one browser — and destructive under `render`, which uses parallel workers seeking
independently:

1. `fromTo` applies its **from-values at build time** (`immediateRender: true`). In a chain, the
   last one wins, so the composition opens wearing the final tween's start state.
2. `tl.set()` is not reverted on a backward seek, and is never applied by a worker whose first
   seek is later than it.
3. `tl.call()` is **suppressed during seeks**, so callback-driven state never happens.

All three produced a mp4 that was silently wrong while `check` reported zero errors.
