#!/usr/bin/env python3
"""
Flya Allrounder brag theme — written to the edit, not fitted to it.

Modern minimal-electronic bed: 120 BPM (0.50s beat, 2.00s bar), A minor,
i–VI–III–VII. The arrangement is built around the cut's own structure:

    0.0 - 2.0   pad only .................... the login card
    2.0 - 4.0   pluck arp enters ........... the dashboard arriving
    4.0 - 16.0  full groove ................ Time Tracker, Mail Composer
   16.0 - 17.0  BREAK: drums out, riser .... the build
   17.0 - 23.0  DROP: everything ........... Mail Tracking
   23.0 - 24.6  outro tail ................. the lockup

Everything is deterministic (fixed seed), so re-running reproduces the file.
Run:  python3 assets/music/make-theme.py
"""

import numpy as np
import wave
import os

SR = 44100
DUR = 24.8
BEAT = 0.5           # 120 BPM
BAR = BEAT * 4
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7314)

mix = np.zeros(N)


def add(sig, at, gain=1.0):
    """Mix `sig` into the master at time `at` seconds."""
    i = int(at * SR)
    if i >= N:
        return
    end = min(N, i + len(sig))
    mix[i:end] += sig[: end - i] * gain


def env_ad(n, attack, decay, curve=2.0):
    """Attack/decay envelope, `n` samples long."""
    e = np.ones(n)
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    e[:a] = np.linspace(0, 1, a) ** 0.6
    tail = np.linspace(0, 1, max(1, n - a))
    e[a:] = np.exp(-curve * tail * (n - a) / d)
    return e


# --------------------------------------------------------------------------
# Harmony — one chord per 4 seconds: Am · F · C · G · Am · F · (Am tail)
# --------------------------------------------------------------------------
CHORDS = [
    (0.0, "Am", 110.00, [261.63, 329.63, 440.00]),
    (4.0, "F", 87.31, [261.63, 349.23, 440.00]),
    (8.0, "C", 130.81, [329.63, 392.00, 523.25]),
    (12.0, "G", 98.00, [293.66, 392.00, 493.88]),
    (16.0, "Am", 110.00, [261.63, 329.63, 440.00]),
    (20.0, "F", 87.31, [261.63, 349.23, 440.00]),
    (24.0, "Am", 110.00, [261.63, 329.63, 440.00]),
]


def chord_at(time):
    cur = CHORDS[0]
    for c in CHORDS:
        if c[0] <= time + 1e-6:
            cur = c
    return cur


# --------------------------------------------------------------------------
# Pad — the bed. Slightly detuned sines, slow swell on each chord change.
# --------------------------------------------------------------------------
for i, (start, _name, root, tones) in enumerate(CHORDS):
    if start >= DUR:
        break
    length = min(4.6, DUR - start)
    n = int(length * SR)
    tt = np.arange(n) / SR
    voice = np.zeros(n)
    for f in tones:
        for det in (-0.18, 0.0, 0.22):          # gentle chorus
            voice += np.sin(2 * np.pi * (f + det) * tt) / 3.0
    voice += 0.55 * np.sin(2 * np.pi * root * tt)
    e = np.minimum(1.0, tt / 0.9) * np.exp(-0.30 * tt)
    # the pad opens up once the piece gets going, and closes at the outro
    lvl = 0.22 if start < 2.0 else (0.30 if start < 16.0 else 0.34)
    add(voice * e, start, lvl)


# --------------------------------------------------------------------------
# Kick — four on the floor, out for the 16-17s break, done at 23.0
# --------------------------------------------------------------------------
def kick():
    n = int(0.34 * SR)
    tt = np.arange(n) / SR
    f = 48 + 105 * np.exp(-32 * tt)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-7.0 * tt)
    click = rng.standard_normal(n) * np.exp(-160 * tt) * 0.25
    return body + click


KICK = kick()
kick_times = []
b = 4.0
while b < 23.0:
    if not (16.0 <= b < 17.0):               # the break
        kick_times.append(b)
    b += BEAT
for k in kick_times:
    add(KICK, k, 0.92)


# --------------------------------------------------------------------------
# Sidechain — everything tonal ducks under each kick. This is most of what
# makes a bed read as "modern" rather than "library music".
# --------------------------------------------------------------------------
duck = np.ones(N)
for k in kick_times:
    i = int(k * SR)
    seg = min(int(0.30 * SR), N - i)
    if seg <= 0:
        continue
    tt = np.arange(seg) / SR
    duck[i : i + seg] = np.minimum(duck[i : i + seg], 1 - 0.55 * np.exp(-tt / 0.11))
mix *= duck  # ducks the pad written so far


# --------------------------------------------------------------------------
# Sub bass — 8th-note root pulses, following the chord
# --------------------------------------------------------------------------
sub = np.zeros(N)
b = 5.0
while b < 23.0:
    if not (16.0 <= b < 17.0):
        root = chord_at(b)[2] / 2.0          # an octave down
        n = int(0.24 * SR)
        tt = np.arange(n) / SR
        note = np.sin(2 * np.pi * root * tt) * env_ad(n, 0.006, 0.16, 3.0)
        i = int(b * SR)
        end = min(N, i + n)
        sub[i:end] += note[: end - i]
    b += BEAT / 2
mix += sub * duck * 0.50


# --------------------------------------------------------------------------
# Pluck arp — 8th notes climbing the chord. The melodic hook.
# --------------------------------------------------------------------------
def pluck(freq, length=0.30):
    n = int(length * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for h, amp in ((1, 1.0), (2, 0.42), (3, 0.20), (4, 0.10)):
        sig += amp * np.sin(2 * np.pi * freq * h * tt)
    cutoff_env = np.exp(-9 * tt)             # a filter closing, faked by tilt
    return sig * env_ad(n, 0.004, 0.13, 3.2) * (0.45 + 0.55 * cutoff_env)


arp = np.zeros(N)
step = 0
b = 2.0
while b < 23.2:
    if not (16.0 <= b < 17.0):
        tones = chord_at(b)[3]
        pattern = [0, 1, 2, 1]
        f = tones[pattern[step % len(pattern)]]
        if step % 8 == 0:
            f *= 2                            # an octave lift on the downbeat
        note = pluck(f)
        i = int(b * SR)
        end = min(N, i + len(note))
        arp[i:end] += note[: end - i]
    step += 1
    b += BEAT / 2
# the arp is quiet under the tour, and opens up on the drop
arp_lvl = np.where(t < 17.0, 0.13, 0.22)
arp_lvl = np.where(t > 23.0, 0.10, arp_lvl)
mix += arp * duck * arp_lvl


# --------------------------------------------------------------------------
# Hats — offbeat 8ths, doubling to 16ths through the build
# --------------------------------------------------------------------------
def hat(length=0.055, bright=1.0):
    n = int(length * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(9) / 9, mode="same")   # crude highpass
    return hp * np.exp(-70 * tt / bright)


b = 5.25
while b < 23.0:
    if not (16.0 <= b < 16.5):
        add(hat(), b, 0.20 if b < 17.0 else 0.26)
    b += BEAT / 2
# build: 16ths through the break
b = 16.5
while b < 17.0:
    add(hat(0.045), b, 0.16 + 0.34 * (b - 16.5) / 0.5)
    b += BEAT / 4


# --------------------------------------------------------------------------
# Clap — backbeat, from 8.0
# --------------------------------------------------------------------------
def clap():
    n = int(0.22 * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    body = noise - np.convolve(noise, np.ones(5) / 5, mode="same")
    e = np.exp(-24 * tt)
    for off in (0.008, 0.016):                # the three-tap smear
        s = int(off * SR)
        e[s:] += np.exp(-24 * tt[: n - s]) * 0.7
    return body * e * 0.5


CLAP = clap()
b = 8.0 + BEAT
while b < 23.0:
    if not (16.0 <= b < 17.0):
        add(CLAP, b, 0.34)
    b += BAR / 2


# --------------------------------------------------------------------------
# The break: a noise riser and a downward sweep into the drop
# --------------------------------------------------------------------------
n = int(1.0 * SR)
tt = np.linspace(0, 1, n)
noise = rng.standard_normal(n)
riser = np.zeros(n)
prev = 0.0
a_coef = 0.010 + 0.42 * tt ** 2.4
for i in range(n):
    prev += a_coef[i] * (noise[i] - prev)
    riser[i] = prev
riser *= tt ** 2.2
riser += 0.35 * np.sin(2 * np.pi * np.cumsum(180 * np.exp(1.7 * tt)) / SR) * tt ** 3
add(riser, 16.0, 0.42)

# impact on the drop
n = int(1.6 * SR)
tt = np.arange(n) / SR
imp = np.sin(2 * np.pi * np.cumsum(85 * np.exp(-2.4 * tt) + 36) / SR) * np.exp(-2.6 * tt)
noise = rng.standard_normal(n)
imp += 0.30 * (noise - np.convolve(noise, np.ones(7) / 7, mode="same")) * np.exp(-9 * tt)
add(imp, 17.0, 0.70)


# --------------------------------------------------------------------------
# Outro — a last low note under the lockup, then out
# --------------------------------------------------------------------------
n = int(2.0 * SR)
tt = np.arange(n) / SR
tail = (np.sin(2 * np.pi * 110 * tt) + 0.5 * np.sin(2 * np.pi * 220 * tt)) * np.exp(-1.5 * tt)
add(tail, 22.9, 0.30)

# global fade-out so nothing is cut mid-cycle
fade = np.ones(N)
fi = int(23.4 * SR)
fade[fi:] = np.linspace(1, 0, N - fi) ** 1.4
mix *= fade

# soft-clip, then normalise with headroom
mix = np.tanh(mix * 0.85)
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.89

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "flya-theme.wav")
with wave.open(out, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f"wrote {out}  {DUR:.1f}s  peak {np.max(np.abs(mix)):.3f}")
