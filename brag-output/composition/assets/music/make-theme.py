#!/usr/bin/env python3
"""
Flya Allrounder brag theme — written to the edit, not fitted to it.

Snappy minimal-electronic bed: **150 BPM** (0.40s beat, 1.60s bar), A minor,
i-VI-III-VII. Fast, tight and dry — short arp notes, 16th hats, a hard
backbeat clap, and a sidechained sub. Built around the cut:

    0.0 -  1.6  pad + pluck, no drums ..... the login card, wide
    1.6 - 15.2  full groove ............... dashboard → tracker → composer
   15.2 - 16.0  BUILD: drums thin, riser ..
   16.0 - 23.2  DROP: everything ......... Mail Tracking
   23.2 - 24.8  outro tail ............... the lockup

Everything is deterministic (fixed seed), so re-running reproduces the file.
Run:  python3 assets/music/make-theme.py
"""

import numpy as np
import wave
import os

SR = 44100
DUR = 25.2
BEAT = 0.4  # 150 BPM
BAR = BEAT * 4
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7314)

DROP = 16.0
BUILD = 15.2
END = 23.2

mix = np.zeros(N)


def add(sig, at, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    end = min(N, i + len(sig))
    mix[i:end] += sig[: end - i] * gain


def env_ad(n, attack, decay, curve=2.0):
    e = np.ones(n)
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    e[:a] = np.linspace(0, 1, a) ** 0.6
    tail = np.linspace(0, 1, max(1, n - a))
    e[a:] = np.exp(-curve * tail * (n - a) / d)
    return e


# --------------------------------------------------------------------------
# Harmony — one chord per 2 bars (3.2s)
# --------------------------------------------------------------------------
CHORDS = [
    (0.0, 110.00, [261.63, 329.63, 440.00]),   # Am
    (3.2, 87.31, [261.63, 349.23, 440.00]),    # F
    (6.4, 130.81, [329.63, 392.00, 523.25]),   # C
    (9.6, 98.00, [293.66, 392.00, 493.88]),    # G
    (12.8, 110.00, [261.63, 329.63, 440.00]),  # Am
    (16.0, 110.00, [261.63, 329.63, 440.00]),  # Am — the drop
    (19.2, 87.31, [261.63, 349.23, 440.00]),   # F
    (22.4, 110.00, [261.63, 329.63, 440.00]),  # Am — the lockup
    (25.6, 110.00, [261.63, 329.63, 440.00]),  # Am — tail
]


def chord_at(time):
    cur = CHORDS[0]
    for c in CHORDS:
        if c[0] <= time + 1e-6:
            cur = c
    return cur


# --------------------------------------------------------------------------
# Pad
# --------------------------------------------------------------------------
for start, root, tones in CHORDS:
    if start >= DUR:
        break
    length = min(3.8, DUR - start)
    n = int(length * SR)
    tt = np.arange(n) / SR
    voice = np.zeros(n)
    for f in tones:
        for det in (-0.18, 0.0, 0.22):
            voice += np.sin(2 * np.pi * (f + det) * tt) / 3.0
    voice += 0.55 * np.sin(2 * np.pi * root * tt)
    e = np.minimum(1.0, tt / 0.55) * np.exp(-0.42 * tt)
    lvl = 0.24 if start < 1.6 else (0.28 if start < DROP else 0.32)
    add(voice * e, start, lvl)


# --------------------------------------------------------------------------
# Kick — quarters, with a driving offbeat push in the drop
# --------------------------------------------------------------------------
def kick():
    n = int(0.28 * SR)
    tt = np.arange(n) / SR
    f = 50 + 110 * np.exp(-38 * tt)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9.0 * tt)
    click = rng.standard_normal(n) * np.exp(-190 * tt) * 0.28
    return body + click


KICK = kick()
kick_times = []
b = 1.6
while b < END:
    if not (BUILD <= b < DROP):
        kick_times.append(b)
        # a pushed 16th before every other downbeat once the drop lands
        if b >= DROP and abs((b / BAR) % 1.0) < 1e-6:
            kick_times.append(b - BEAT / 4)
    b += BEAT
for k in kick_times:
    add(KICK, k, 0.95)


# --------------------------------------------------------------------------
# Sidechain
# --------------------------------------------------------------------------
duck = np.ones(N)
for k in kick_times:
    i = int(k * SR)
    seg = min(int(0.24 * SR), N - i)
    if seg <= 0:
        continue
    tt = np.arange(seg) / SR
    duck[i : i + seg] = np.minimum(duck[i : i + seg], 1 - 0.58 * np.exp(-tt / 0.085))
mix *= duck


# --------------------------------------------------------------------------
# Sub bass — 8ths
# --------------------------------------------------------------------------
sub = np.zeros(N)
b = 1.6
while b < END:
    if not (BUILD <= b < DROP):
        root = chord_at(b)[1] / 2.0
        n = int(0.18 * SR)
        tt = np.arange(n) / SR
        note = np.sin(2 * np.pi * root * tt) * env_ad(n, 0.005, 0.12, 3.2)
        i = int(b * SR)
        end = min(N, i + n)
        sub[i:end] += note[: end - i]
    b += BEAT / 2
mix += sub * duck * 0.52


# --------------------------------------------------------------------------
# Pluck arp — 16ths. Short and dry; this is what makes it feel quick.
# --------------------------------------------------------------------------
def pluck(freq, length=0.20):
    n = int(length * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for h, amp in ((1, 1.0), (2, 0.40), (3, 0.18), (4, 0.08)):
        sig += amp * np.sin(2 * np.pi * freq * h * tt)
    return sig * env_ad(n, 0.003, 0.075, 3.6) * (0.45 + 0.55 * np.exp(-13 * tt))


arp = np.zeros(N)
step = 0
b = 0.8
while b < END + 0.4:
    if not (BUILD <= b < DROP):
        tones = chord_at(b)[2]
        pattern = [0, 1, 2, 1, 2, 0, 1, 2]
        f = tones[pattern[step % len(pattern)]]
        if step % 8 == 0:
            f *= 2
        note = pluck(f)
        i = int(b * SR)
        end = min(N, i + len(note))
        arp[i:end] += note[: end - i]
    step += 1
    b += BEAT / 2
arp_lvl = np.where(t < DROP, 0.13, 0.20)
arp_lvl = np.where(t > END, 0.09, arp_lvl)
mix += arp * duck * arp_lvl


# --------------------------------------------------------------------------
# Hats — 16ths throughout; this is the main "snappy" driver
# --------------------------------------------------------------------------
def hat(length=0.038, bright=1.0):
    n = int(length * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(9) / 9, mode="same")
    return hp * np.exp(-95 * tt / bright)


b = 1.6
i16 = 0
while b < END:
    if not (BUILD <= b < DROP):
        accent = 0.30 if i16 % 4 == 2 else 0.16
        add(hat(), b, accent if b >= DROP else accent * 0.8)
    b += BEAT / 4
    i16 += 1
# build: accelerating hats through the 0.8s break
b = BUILD
k = 0
while b < DROP:
    add(hat(0.032), b, 0.14 + 0.36 * (b - BUILD) / (DROP - BUILD))
    b += BEAT / 4 if k < 4 else BEAT / 8
    k += 1


# --------------------------------------------------------------------------
# Clap — hard backbeat
# --------------------------------------------------------------------------
def clap():
    n = int(0.18 * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    body = noise - np.convolve(noise, np.ones(5) / 5, mode="same")
    e = np.exp(-30 * tt)
    for off in (0.007, 0.014):
        s = int(off * SR)
        e[s:] += np.exp(-30 * tt[: n - s]) * 0.7
    return body * e * 0.5


CLAP = clap()
b = 1.6 + BEAT
while b < END:
    if not (BUILD <= b < DROP):
        add(CLAP, b, 0.36)
    b += BAR / 2


# --------------------------------------------------------------------------
# The build: riser + reverse swell into the drop
# --------------------------------------------------------------------------
n = int((DROP - BUILD) * SR)
tt = np.linspace(0, 1, n)
noise = rng.standard_normal(n)
riser = np.zeros(n)
prev = 0.0
a_coef = 0.012 + 0.46 * tt**2.2
for i in range(n):
    prev += a_coef[i] * (noise[i] - prev)
    riser[i] = prev
riser *= tt**2.0
riser += 0.35 * np.sin(2 * np.pi * np.cumsum(220 * np.exp(1.9 * tt)) / SR) * tt**3
add(riser, BUILD, 0.46)

# impact on the drop
n = int(1.4 * SR)
tt = np.arange(n) / SR
imp = np.sin(2 * np.pi * np.cumsum(88 * np.exp(-2.6 * tt) + 36) / SR) * np.exp(-3.0 * tt)
noise = rng.standard_normal(n)
imp += 0.30 * (noise - np.convolve(noise, np.ones(7) / 7, mode="same")) * np.exp(-10 * tt)
add(imp, DROP, 0.72)


# --------------------------------------------------------------------------
# Outro
# --------------------------------------------------------------------------
n = int(1.8 * SR)
tt = np.arange(n) / SR
tail = (np.sin(2 * np.pi * 110 * tt) + 0.5 * np.sin(2 * np.pi * 220 * tt)) * np.exp(-1.7 * tt)
add(tail, END - 0.2, 0.32)

fade = np.ones(N)
fi = int(23.7 * SR)
fade[fi:] = np.linspace(1, 0, N - fi) ** 1.3
mix *= fade

mix = np.tanh(mix * 0.88)
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.89

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "flya-theme.wav")
with wave.open(out, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f"wrote {out}  {DUR:.1f}s  150 BPM  drop @ {DROP}s")
