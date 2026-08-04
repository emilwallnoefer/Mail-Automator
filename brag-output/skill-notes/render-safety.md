# Render safety — the traps that pass `check` and still ship broken frames

Read this **before writing the timeline**, not after the render looks wrong.

## Why this file exists

`hyperframes check`, `snapshot` and `preview` all drive the timeline **forward from 0 in one
browser**. `render` uses **several parallel workers**, each of which loads the page fresh and
seeks straight to an arbitrary time, then possibly seeks backwards.

Three GSAP behaviours are invisible in the first mode and destructive in the second. All three
produce a render that is *silently* wrong — `check` reports zero errors, snapshots look perfect,
and the mp4 is broken.

---

## 1. `fromTo` applies its from-values at BUILD time

`gsap.fromTo()` defaults to **`immediateRender: true`**. The *from* vars are written to the
element the moment the tween is **created** — not when the playhead arrives.

With a chain of `fromTo`s on the same property, every from-value is applied in order at build
time and **the last one wins**, so the composition starts life wearing the final tween's start
state.

```js
// ✗ the page opens with backgroundColor #e6edf3 — the LAST from-value
tl.fromTo("#bg", { backgroundColor: "#fcfaf5" }, { backgroundColor: "#faf7ef", ... }, 4.0);
tl.fromTo("#bg", { backgroundColor: "#faf7ef" }, { backgroundColor: "#f6f2e8", ... }, 9.0);
tl.fromTo("#bg", { backgroundColor: "#f6f2e8" }, { backgroundColor: "#e6edf3", ... }, 16.0);

// ✓ only the tween that legitimately owns the opening state renders immediately
tl.fromTo("#bg", { backgroundColor: "#fcfaf5" }, { backgroundColor: "#faf7ef", ... }, 4.0);
tl.fromTo("#bg", { backgroundColor: "#faf7ef" }, { immediateRender: false, backgroundColor: "#f6f2e8", ... }, 9.0);
tl.fromTo("#bg", { backgroundColor: "#f6f2e8" }, { immediateRender: false, backgroundColor: "#e6edf3", ... }, 16.0);
```

This bites hardest on **camera / zoom pairs**. A push-in tween (identity → framed) is fine —
its from-state *is* the correct baseline. The matching pull-back tween (framed → identity) has a
zoomed from-state, so at build time the wrapper is stuck framed and every frame before the move
renders magnified and offset.

> **Rule:** in any chain of `fromTo`s on the same target+property, exactly one may render
> immediately — the one whose from-state is the correct state at `t = 0`. Mark every other one
> `immediateRender: false`.

## 2. `tl.set()` is not revertible, and is skippable

A zero-duration `tl.set(target, vars, T)`:

- is **not undone** when the playhead moves back past `T`; and
- is **never applied at all** by a worker whose first seek is later than `T` — it was never
  rendered, so the element keeps its CSS value.

So state flipped with `set` is wrong in both directions. Use a **sub-frame `fromTo`** instead —
identical on screen (shorter than one frame at 30fps), but revertible and seek-safe:

```js
var CUT = 0.02; // < 1 frame

function show(target, at, to) {
  tl.fromTo(target, { opacity: 0 },
    { opacity: to === undefined ? 1 : to, duration: CUT, ease: "none", immediateRender: false }, at);
}
function hide(target, at, from) {
  tl.fromTo(target, { opacity: from === undefined ? 1 : from },
    { opacity: 0, duration: CUT, ease: "none", immediateRender: false }, at);
}
```

`tl.set(..., 0)` at time zero is still fine for a **baseline** that never changes back.

## 3. `tl.call()` is suppressed during seeks

The renderer seeks; it does not play. GSAP suppresses callbacks on a seek, so a `tl.call()` that
swaps text or flips a class may **never fire**.

```js
// ✗ the button may still read "Generate draft" at render time
tl.call(function () { btn.textContent = "Generating…"; }, [], 14.44);

// ✓ two stacked labels, cross-faded — a tween, so it renders on any seek
tl.fromTo("#cta-a", { opacity: 1 }, { opacity: 0, duration: CUT, ease: "none", immediateRender: false }, 14.44);
tl.fromTo("#cta-b", { opacity: 0 }, { opacity: 1, duration: CUT, ease: "none" }, 14.44);
```

The same applies to the **audio-reactive sampling loop**. The `hyperframes-creative`
audio-reactive reference shows one `tl.call()` per frame; hundreds of suppressed callbacks means
the effect silently does nothing. Use a single tween and sample inside `onUpdate`, which *does*
run whenever the tween renders:

```js
var probe = { p: 0 };
tl.to(probe, {
  p: 1, duration: TOTAL, ease: "none",
  onUpdate: function () {
    var f = AUDIO_DATA.frames[Math.round(probe.p * (AUDIO_DATA.totalFrames - 1))];
    root.style.setProperty("--a-rms", f.rms.toFixed(3));
  }
}, 0);
```

`onUpdate` on a value-tween is also the right tool for counters and typed text — both stay
deterministic because the value is derived from timeline time alone.

---

## Verify the rendered file, not the snapshots

Because `snapshot` cannot reproduce the parallel-seek conditions, **a passing `check` plus good
snapshots is not evidence that the mp4 is correct**. Always look at frames from the rendered
file. `ffmpeg`'s `tile` filter makes this one command:

```bash
# every 14th frame of the whole film, as one contact sheet
ffmpeg -y -i brag.mp4 -vf "select='not(mod(n,14))',scale=380:-1,tile=5x10" \
  -frames:v 1 -q:v 3 -vsync 0 /tmp/whole.jpg

# every 4th frame of a suspect stretch, to inspect a cut frame by frame
ffmpeg -y -i brag.mp4 -vf "select='lt(t,3.7)*not(mod(n,4))',scale=440:-1,tile=4x7" \
  -frames:v 1 -q:v 3 -vsync 0 /tmp/opening.jpg

# two ranges at once, to compare framing on two different moves
ffmpeg -y -i brag.mp4 -vf \
  "select='between(t,9.0,10.4)*not(mod(n,6))+between(t,17.9,19.9)*not(mod(n,8))',scale=460:-1,tile=4x4" \
  -frames:v 1 -q:v 3 -vsync 0 /tmp/framing.jpg
```

What to look for: a background colour that belongs to a later section, an element rendered at the
wrong scale or offset, a label showing the wrong state, or a panel shoved against the frame edge.

## Check the mix

`check` says nothing about audio. A music bed plus a stack of SFX clips very easily:

```bash
ffmpeg -i brag.mp4 -af volumedetect -f null /dev/null 2>&1 | grep -E "mean_volume|max_volume"
```

Aim for `max_volume` at **−1 dB or lower**. `−0.0 dB` means it is clipping — lower the bed and
the payoff cues and re-render. A narrated cut lands around −20 dB mean; an unnarrated one around
−22 dB.

## Positioned children inside a positioned parent

`check`'s `escaped_container` finding is real and easy to trigger: a `position: absolute` child of
an absolutely-positioned panel takes coordinates **relative to that panel**, not the canvas. A
button placed at the canvas coordinates you measured will land far outside the panel. Subtract the
parent's origin, or let flow layout place it.

## Layout escape hatches, used narrowly

- `data-layout-allow-overlap` — intentional layering (a held line over a dimmed scene).
- `data-layout-allow-occlusion` — something deliberately covering text (a strike-through).
- `data-layout-allow-overflow` — a zoom/camera wrapper, whose children legitimately leave frame.
- `data-layout-ignore` — an off-screen measuring twin.

Scope each to the smallest element that needs it; on a wrapper it also silences the perception
checks for everything inside.
