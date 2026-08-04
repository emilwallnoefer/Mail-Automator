#!/usr/bin/env python3
"""
Flya Allrounder brag SFX kit — synthesised so the sound design and the
score (assets/music/make-theme.py) share a palette.

The whooshes are deliberately DAMP and LEAN: heavily low-passed, short, and
narrow-band. No broadband hiss, no long tail — a soft displacement of air
rather than a cymbal-ish sweep.

Deterministic (fixed seed). Run:  python3 assets/sfx/make-sfx.py
"""

import numpy as np
import wave
import os

SR = 44100
rng = np.random.default_rng(4471)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "synth")
os.makedirs(OUT, exist_ok=True)


def write(name, sig, peak=0.9):
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * peak
    with wave.open(os.path.join(OUT, name), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((sig * 32767).astype(np.int16).tobytes())
    print(f"{name:18s} {len(sig) / SR:.3f}s")


def lp_sweep(x, cutoff_hz):
    """One-pole lowpass with a per-sample cutoff, in Hz."""
    a = 1 - np.exp(-2 * np.pi * cutoff_hz / SR)
    y = np.empty_like(x)
    prev = 0.0
    for n in range(len(x)):
        prev += a[n] * (x[n] - prev)
        y[n] = prev
    return y


def damp_whoosh(dur, top_hz, tilt=0.42, tone_hz=120.0, tone_amt=0.62):
    """
    A dark, slow whoosh — air moving, not a cymbal.

    Three things keep it from sounding bright or cheap:

    * the lowpass cutoff never leaves the **low** mids (90 Hz → `top_hz` →
      90 Hz, with `top_hz` around 300), so the hiss band is simply never
      opened;
    * most of the signal is a tonal swell rather than noise (`tone_amt`),
      which gives it pitch and body instead of texture;
    * the envelope is asymmetric — a soft swell into a longer decay
      (t^1.2 · e^-2.2t) rather than a symmetric bump — so it leads somewhere
      and then gets out of the way.
    """
    n = int(SR * dur)
    t = np.linspace(0, 1, n)
    shape = np.where(t < tilt, t / tilt, 1 - (t - tilt) / (1 - tilt))
    shape = np.clip(shape, 0, 1) ** 1.4
    cutoff = 90 + (top_hz - 90) * shape
    body = lp_sweep(rng.standard_normal(n), cutoff)
    body /= np.max(np.abs(body)) + 1e-9
    # the tonal core: a low swell that rises and falls with the sweep
    tone = np.sin(2 * np.pi * np.cumsum(tone_hz * (0.75 + 0.5 * shape)) / SR)
    tone += 0.35 * np.sin(2 * np.pi * np.cumsum(tone_hz * 0.5 * (0.75 + 0.5 * shape)) / SR)
    env = (t ** 1.2) * np.exp(-2.2 * t)
    env /= np.max(env) + 1e-9
    return (body * (1 - tone_amt) + tone * tone_amt) * env


# scene changes — long, dark, mostly tonal. Placed to LEAD the cut, so the
# swell arrives under it rather than trailing after it.
write("whoosh-soft.wav", damp_whoosh(0.55, top_hz=300, tilt=0.38, tone_hz=120, tone_amt=0.62))
# the one bigger move (into Mail Tracking) — same character, more weight
write("whoosh-big.wav", damp_whoosh(0.85, top_hz=380, tilt=0.42, tone_hz=80, tone_amt=0.66))

# a soft blip for a cascading card/tile arriving
n = int(0.055 * SR)
t = np.arange(n) / SR
write("ui-tick.wav", (np.sin(2 * np.pi * 1560 * t) + 0.4 * np.sin(2 * np.pi * 2340 * t)) * np.exp(-46 * t))

# a crisper click for a cursor press
n = int(0.040 * SR)
t = np.arange(n) / SR
noise = rng.standard_normal(n)
hp = noise - np.convolve(noise, np.ones(7) / 7, mode="same")
write("ui-click.wav", (hp * 0.55 + np.sin(2 * np.pi * 980 * t) * 0.8) * np.exp(-95 * t))

# clean impact for the strike-through payoff
n = int(1.1 * SR)
t = np.arange(n) / SR
imp = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-3.0 * t) + 52) / SR) * np.exp(-4.0 * t)
noise = rng.standard_normal(n)
imp += 0.28 * (noise - np.convolve(noise, np.ones(6) / 6, mode="same")) * np.exp(-16 * t)
write("impact.wav", imp)

# sub drop under the payoff
n = int(0.85 * SR)
t = np.arange(n) / SR
write("sub-boom.wav", np.sin(2 * np.pi * np.cumsum(95 * np.exp(-2.1 * t) + 32) / SR) * np.exp(-3.4 * t))

# FM bell for the wordmark
n = int(1.9 * SR)
t = np.arange(n) / SR
car, mod = 523.25, 784.0
bell = np.sin(2 * np.pi * car * t + 2.6 * np.exp(-2.2 * t) * np.sin(2 * np.pi * mod * t)) * np.exp(-1.9 * t)
bell += 0.4 * np.sin(2 * np.pi * car * 0.5 * t) * np.exp(-1.5 * t)
write("bell.wav", bell)

# a dry, quiet cut marker for the jump cuts
n = int(0.09 * SR)
t = np.arange(n) / SR
cut = lp_sweep(rng.standard_normal(n), np.full(n, 900.0)) * np.exp(-38 * t)
cut += 0.5 * np.sin(2 * np.pi * 320 * t) * np.exp(-42 * t)
write("cut.wav", cut)
