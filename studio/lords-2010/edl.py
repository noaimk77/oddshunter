# Builds edl.json (footage plan) from timing.json: one shot per phrase (long ones split),
# themed by what the line says; real-photo windows come from TIMING.PHOTOS.
import json
T = json.load(open("timing.json"))
PH, DUR = T["PH"], T["DURATION"]
THEMES = [
 "cricket", "cricket", "news", "police",
 "data", "money", "cricket", "data", "fans",
 "city", "news", "phone", "news", "cricket", "money",
 "cricket", "cricket", "cricket", "cricket", "cricket",
 "news", "news", "police", "fans",
 "money", "money", "money", "cricket",
 "court", "court", "court", "court", "court", "court",
 "cricket", "cricket", "cricket", "fans", "fans",
 "cricket", "court", "data", "cricket", "data",
 "city", "city",
]
assert len(THEMES) == len(PH), (len(THEMES), len(PH))
cuts = [0.0] + [p["a"] - 0.15 for p in PH[1:]] + [DUR]
segs = []
for i in range(len(PH)):
    a, b = cuts[i], cuts[i + 1]
    n = 1 if b - a <= 8.5 else 2
    for k in range(n):
        segs.append([a + (b - a) * k / n, a + (b - a) * (k + 1) / n, THEMES[i]])
# photo windows replace whatever they cover
out = []
for name, pa, pb in T["PHOTOS"]:
    pass
def photo_at(t):
    for name, pa, pb in T["PHOTOS"]:
        if pa <= t < pb: return name, pa, pb
    return None
for a, b, th in segs:
    pts = sorted({a, b, *[x for _, pa, pb in T["PHOTOS"] for x in (pa, pb) if a < x < b]})
    for x, y in zip(pts, pts[1:]):
        ph = photo_at((x + y) / 2)
        out.append([x, y, "photo:" + ph[0] if ph else th])
merged = []
for s in out:
    if merged and (s[2] == merged[-1][2] and s[2].startswith("photo") or s[1] - s[0] < 1.0):
        merged[-1][1] = s[1]
    else:
        merged.append(s)
json.dump({"DURATION": DUR, "EDL": [[round(a, 4), round(b, 4), th] for a, b, th in merged]}, open("edl.json", "w"), indent=0)
print(len(merged), "shots")
for s in merged: print(round(s[0], 1), round(s[1], 1), s[2])
