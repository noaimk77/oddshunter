# Energy VAD on ../voice/v16.wav -> vad.json (speech segments), printed with the
# zipformer words that fall inside each segment (needs zf_words.json).
import json, numpy as np, soundfile as sf
a, sr = sf.read("../voice/v16.wav", dtype="float32")
hop = int(0.01 * sr)
db = 20 * np.log10(np.array([np.sqrt(np.mean(a[i:i + hop * 2] ** 2) + 1e-12) for i in range(0, len(a) - hop * 2, hop)]))
thr = np.percentile(db, 95) - 30
sp = db > thr
segs, i, n = [], 0, len(sp)
while i < n:
    if sp[i]:
        j = i
        while j < n and sp[j]: j += 1
        segs.append([i / 100, j / 100]); i = j
    else: i += 1
m = []
for s in segs:
    if m and s[0] - m[-1][1] < 0.15: m[-1][1] = s[1]
    else: m.append(s)
m = [s for s in m if s[1] - s[0] >= 0.08]
w = json.load(open("zf_words.json"))
for s in m:
    print(f"{s[0]:6.2f}-{s[1]:6.2f} " + " ".join(x[0] for x in w if s[0] - 0.1 <= x[1] - 0.25 < s[1]))
json.dump(m, open("vad.json", "w"))
