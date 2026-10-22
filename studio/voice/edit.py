# Cleans the voice-over timeline: removes the false start and the noise blip,
# shortens long pauses, then writes voice-edit.wav and caps.json (phrase times
# on the new timeline) for the video renderer.
import json, numpy as np, soundfile as sf

SR = 48000
src, sr = sf.read("v48.wav", dtype="float32")
assert sr == SR
x = src.mean(axis=1) if src.ndim == 2 else src

vad = json.load(open("../asr/vad.json"))
# Drop the noise blip (no speech, Whisper hears "[bruit]").
vad = [s for s in vad if not (56.40 <= s[0] <= 56.50)]
# Remove the false start "L'a..." before "l'argent".
CUTS = [(95.44, 95.84)]
TAIL = 110.20  # end of "parier dessus"

# Phrases: (scene, text, orig start, orig end). Split points inside a VAD run
# are given explicitly.
P = [
 ("s1", "618 matchs de foot suspects.", 1.63, 3.12),
 ("s1", "En une seule année.", 4.28, 5.08),
 ("s1", "Ça fait presque deux par jour, tu imagines ?", 5.93, 7.47),
 ("s2", "Un des derniers exemples ? C'était cet été, en Asie.", 9.46, 11.46),
 ("s2", "Le Laos enchaîne les défaites : 5-0, 4-0, 4-1…", 12.99, 16.79),
 ("s2", "Et pour finir, grosse claque : 7-2 contre la Birmanie.", 17.92, 20.76),
 ("s3", "Neuf buts dans un match international.", 22.14, 24.29),
 ("s3", "Deux buts contre son camp…", 25.04, 26.00),
 ("s3", "et trois cartons rouges.", 26.84, 27.65),
 ("s3", "Bizarre, non ?", 28.59, 29.22),
 ("s3", "C'est la seule équipe du tournoi dans ce cas.", 30.60, 32.49),
 ("s4", "Du coup, la fédé convoque tous les joueurs.", 33.97, 35.73),
 ("s4", "Ensuite, elle file le dossier à la police.", 36.88, 39.21),
 ("s4", "Et en octobre, d'après la presse…", 40.39, 41.99),
 ("s4", "un joueur a été arrêté.", 42.70, 43.87),
 ("s4b", "Et une autre source du Guardian raconte même", 45.51, 47.42),
 ("s4b", "qu'un joueur se serait vanté d'avoir truqué trois matchs…", 47.87, 50.10),
 ("s4b", "à plus de 10 000 dollars chacun.", 52.33, 54.02),
 ("s4b", "Alors que leur salaire était seulement de 10 par jour.", 54.31, 57.42),
 ("s4b", "Rien d'officiel pour l'instant, on reste prudents.", 57.90, 60.25),
 ("s5", "Et le pire, c'est que c'est loin d'être le seul.", 61.81, 64.12),
 ("s5", "En juin, à Hong Kong : 19 arrestations.", 65.43, 67.83),
 ("s5", "Joueurs et entraîneurs compris.", 68.69, 70.06),
 ("s5", "Et au Laos, 45 joueurs avaient déjà été bannis à vie…", 71.03, 73.80),
 ("s5", "de tous les matchs.", 74.36, 75.09),
 ("s6", "Et concrètement, comment ça se voit ?", 75.89, 77.40),
 ("s6", "Ce genre de match, d'habitude,", 78.56, 80.27),
 ("s6", "il y a quelques centaines d'euros misés, pas plus.", 80.62, 82.86),
 ("s6", "Et là, maintenant, imagine : d'un coup, plus de 10 000 €", 84.13, 87.67),
 ("s6", "qui tombent sur le « plus de 5,5 buts »…", 88.33, 90.45),
 ("s6", "La cote s'écroule, de 9 à 2,40.", 91.43, 94.65),
 ("s6", "L'argent arrive avant le scandale.", 95.84, 97.28),
 ("s7", "Ce genre de mouvement, notre bot le repère direct.", 98.43, 100.46),
 ("s7", "Et l'alerte tombe aussitôt dans notre canal Telegram.", 101.69, 103.94),
 ("s7", "Mon canal est gratuit, et en bio.", 104.82, 106.50),
 ("s7", "N'hésite pas à cliquer", 106.50, 107.62),
 ("s7", "si tu veux détecter plus de matchs truqués", 107.62, 109.04),
 ("s7", "et pouvoir parier dessus.", 109.04, 109.90),
]

PRE, POST = 0.08, 0.14
keep = []
for a, b in vad:
    a, b = max(0, a - PRE), min(TAIL, b + POST)
    if a >= TAIL: continue
    for ca, cb in CUTS:  # split around removed regions
        if a < cb and b > ca:
            if a < ca: keep.append([a, ca])
            a = cb
    if b > a: keep.append([a, b])
keep.sort()
merged = []
for s in keep:
    if merged and s[0] <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], s[1])
    else: merged.append(s)

def phrase_of(t):
    for i, p in enumerate(P):
        if p[2] - 0.2 <= t <= p[3] + 0.2: return i
    return None

# Build the output: segments in order, gaps shortened. Gap audio is taken from
# the real pause (head + tail with crossfade) so room tone stays continuous.
LEAD = 0.45
out = [np.zeros(int(LEAD * SR), dtype="float32")]
tmap = []  # (orig_start, orig_end, new_start)
cur = LEAD
XF = int(0.015 * SR)
for k, (a, b) in enumerate(merged):
    seg = x[int(a * SR):int(b * SR)].copy()
    if k > 0:
        pa, pb = merged[k - 1][1], a
        g = pb - pa
        pi, ni = phrase_of(pa - 0.15), phrase_of(a + 0.15)
        if pi is not None and pi == ni: target = min(g, 0.22)          # pause inside a phrase
        elif pi is not None and ni is not None and P[pi][0] != P[ni][0]: target = min(g, 0.70)  # scene change
        else: target = min(g, 0.42)
        if target < g:
            h = int(target * SR / 2)
            gap = np.concatenate([x[int(pa * SR):int(pa * SR) + h], x[int(pb * SR) - h:int(pb * SR)]])
        else:
            gap = x[int(pa * SR):int(pb * SR)]
        out.append(gap); cur += len(gap) / SR
    # short fades at every join so no click survives
    seg[:XF] *= np.linspace(0, 1, XF); seg[-XF:] *= np.linspace(1, 0, XF)
    tmap.append((a, b, cur))
    out.append(seg); cur += len(seg) / SR
out.append(np.zeros(int(0.5 * SR), dtype="float32"))
y = np.concatenate(out)
sf.write("voice-edit.wav", y, SR)

def remap(t):
    best = None
    for a, b, n in tmap:
        if a - 1e-6 <= t <= b + 1e-6: return n + (t - a)
        if t < a: return n  # inside a removed gap: snap to next segment start
        best = n + (b - a)
    return best

caps = [{"sc": sc, "text": txt, "a": round(remap(a), 3), "b": round(remap(b), 3)} for sc, txt, a, b in P]
json.dump({"caps": caps, "voice_len": round(len(y) / SR, 3)}, open("caps.json", "w"), ensure_ascii=False, indent=1)
print("voice", round(len(y) / SR, 2), "s (was", round(TAIL, 2), ")")
for c in caps: print(f"{c['a']:6.2f}-{c['b']:6.2f} {c['text']}")
