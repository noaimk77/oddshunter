# Synthesises a dark "investigation" background track synced to timing.json
# (scene cuts + key hits). Fully generated here, so no copyright issue.
import json, wave
import numpy as np

SR = 44100
T = json.load(open("timing.json"))
DUR = T["DURATION"]
CUTS, HITS = T["CUTS"], T["HITS"]
S = {s[0]: s[1] for s in T["SCENES"]}
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(23)

BPM = 80; BEAT = 60 / BPM; BAR = 4 * BEAT
mf = lambda m: 440 * 2 ** ((m - 69) / 12)
# Cm - Ab - Fm - G, two bars each
CHORDS = [[48, 51, 55, 60], [44, 51, 56, 60], [41, 53, 56, 60], [43, 50, 55, 59]]
ROOTS = [36, 32, 29, 31]

def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * (1 - pan) ** 0.5
    R[i:i + len(sig)] += sig * (1 + pan) ** 0.5

def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")

# Pad: additive, detuned, slow harmonic movement, crossfaded chords.
seg = 2 * BAR
for c in range(int(DUR / seg) + 1):
    start = c * seg
    n = int((seg + 2.0) * SR); tt = np.arange(n) / SR
    env = np.minimum(1, tt / 1.2) * np.clip((seg + 2.0 - tt) / 2.0, 0, 1)
    for side, det in ((-1, -0.004), (1, 0.004)):
        sig = np.zeros(n)
        for m in CHORDS[c % 4]:
            f = mf(m) * (1 + det)
            for h in range(1, 6):
                mod = 0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * (tt + start) + h * 1.3)
                sig += np.sin(2 * np.pi * f * h * tt + h) * (1 / h ** 1.6) * mod
        add(sig * env, start, pan=0.5 * side, gain=0.018)

# Clock tick on 8th notes (accent on beats), whole track.
tick_n = int(0.02 * SR)
tick = np.diff(rng.standard_normal(tick_n + 1)) * np.exp(-np.arange(tick_n) / (0.004 * SR))
k = 0
while k * BEAT / 2 < DUR:
    add(tick, k * BEAT / 2, pan=0.25 * (1 if k % 2 else -1), gain=0.05 if k % 2 == 0 else 0.025)
    k += 1

# Heartbeat sub bass from scene 2.
hb_n = int(0.5 * SR); hb_t = np.arange(hb_n) / SR
for b in range(int(DUR / BAR) + 1):
    start = b * BAR
    if start < S["s2"] - 0.01: continue
    root = mf(ROOTS[(int(start / seg)) % 4])
    tone = np.sin(2 * np.pi * root * hb_t) + 0.3 * np.sin(4 * np.pi * root * hb_t)
    for off, g in ((0, 1.0), (0.3 * BEAT, 0.7)):
        add(tone * np.exp(-hb_t / 0.18) * np.minimum(1, hb_t / 0.005), start + off, gain=0.16 * g)

# Sparse arpeggio pluck from scene 3, more notes in scene 6.
pl_n = int(0.6 * SR); pl_t = np.arange(pl_n) / SR
PATTERN = [0, 2, 1, 3, 2, 1, 3, 0]
step = BEAT / 2
for k in range(int(DUR / step) + 1):
    st = k * step
    if st < S["s3"] or st > DUR - 3: continue
    if st < S["s6"] and k % 2: continue
    chord = CHORDS[int(st / seg) % 4]
    f = mf(chord[PATTERN[k % 8]] + 12)
    sig = sum(np.sin(2 * np.pi * f * h * pl_t) / h ** 2 for h in (1, 3, 5)) * np.exp(-pl_t / 0.22)
    add(sig, st, pan=0.35 * np.sin(k), gain=0.03)

# Whoosh into each cut, boom on cuts and key hits.
wn = int(0.8 * SR); wt = np.arange(wn) / SR
for c in CUTS:
    noise = np.diff(rng.standard_normal(wn + 1))
    add(lowpass(noise, 3) * (wt / 0.8) ** 2.5, c - 0.8, gain=0.035)
bn = int(1.4 * SR); bt = np.arange(bn) / SR
freq = 38 + 55 * np.exp(-bt / 0.12)
boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-bt / 0.45)
boom += lowpass(rng.standard_normal(bn), 40) * np.exp(-bt / 0.08) * 0.6
for h in CUTS + HITS:
    add(boom, h, gain=0.16)

mix = np.stack([L, R], axis=1)
fade = np.ones(N); fade[: int(0.6 * SR)] = np.linspace(0, 1, int(0.6 * SR))
fo = int(2.5 * SR); fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix /= np.abs(mix).max() / 0.9
with wave.open("music-raw.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("music-raw.wav", round(DUR, 2), "s")
