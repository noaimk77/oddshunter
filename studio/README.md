# Studio vidéo Odds Hunter

Chaîne de fabrication des vidéos (format Suspicious Game) : animation HTML rendue image par image,
sous-titres synchronisés sur la voix off de Noaim, musique générée (libre de droits), mixage.

## Étapes
1. **Script** : texte parlé, naturel, tutoiement, phrases courtes. Faits vérifiés et sourcés,
   « selon / d'après » pour tout ce qui n'est pas confirmé, aucun joueur accusé sans preuve,
   jamais d'incitation à parier, pas de bookmaker ni code promo.
2. **Voix off** : Noaim lit le script et envoie l'audio (MP3/MOV).
3. **Transcription** (`asr/`) : `pip install sherpa-onnx soundfile`, modèles depuis les releases GitHub
   `k2-fsa/sherpa-onnx` (tag `asr-models`) : `sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2`
   (horodatage mot à mot) et `sherpa-onnx-whisper-small.tar.bz2` (texte fiable).
   `voice/v16.wav` (16 kHz mono) et `voice/v48.wav` (48 kHz) via ffmpeg, puis
   `python3 zf.py ../voice/v16.wav zf.json && python3 words.py && python3 vad.py`.
   `wtest.py a:b,c:d …` transcrit des morceaux (et des morceaux recollés) pour valider une coupe.
4. **Montage voix** (`voice/edit.py`) : liste des phrases (scène, texte réellement dit, début, fin),
   coupes des faux départs / bruits, blancs raccourcis → `voice-edit.wav` + `caps.json`.
5. **Vidéo** (`video/`) : `index.html = head.html + body.html + script.html` (CAPS = caps.json),
   scènes dans `body.html`, animations calées sur les mots via `P(i)`, `W(i, "mot")`, `E(i)`.
   `node render.mjs timing` → `timing.json`, `node render.mjs preview t1,t2` → captures,
   `node render.mjs` → `video-silent.mp4`. Format actuel 1080x1920 (Shorts/Reels) ; pour une
   vidéo longue YouTube, passer en 1920x1080.
6. **Musique** (`video/music.py`, lit `timing.json`) puis mixage ffmpeg : voix (highpass, afftdn léger,
   EQ, deesser, compresseur, loudnorm −15) + musique à −20 LUFS avec sidechaincompress sur la voix,
   master loudnorm −14 LUFS / TP −1. Pré-remplir la voix de silence jusqu'à la durée vidéo.
7. **Miniature** (`thumb/`) : 1280x720, gros score ou chiffre choc + question en jaune, `node shot.mjs`.

Playwright : `/opt/node-tools/node_modules/playwright/index.mjs` (Chromium préinstallé).

## Vidéo longue quotidienne (format actuel, depuis le 23/10/2026)
Noaim veut la vidéo **déjà montée** (animations + sous-titres karaoké + musique) : il ajoute sa voix dans CapCut en lisant les sous-titres.
Modèle : `long16x9/` (1920x1080, exemple iBUYPOWER).
- `script.html` : `CAPS` = phrases (scène, texte) ; timing calculé à 14,5 caractères/s (nombres comptés comme prononcés).
  Les animations se calent sur les mots avec `P("début de phrase")`, `W("début de phrase", "mot")`, `S("s3")`.
- `body.html` : une `<div class="scene" id="sN">` par séquence (zone utile 70→830 px, sous-titres en bas).
- `node render.mjs timing` puis `python3 music.py` (musique, puis loudnorm −18 LUFS),
  rendu parallèle : `node render.mjs part 0 3 & node render.mjs part 1 3 & node render.mjs part 2 3`,
  concat ffmpeg (`-f concat -c copy`) puis mux avec la musique.
