# One-shot build in a fresh Vercel sandbox (network access): finds free clips (Mixkit) and real
# photos (Wikimedia Commons), cuts the footage track from edl.json, then composites the
# transparent graphics layer + music rendered elsewhere. Progress goes to /tmp/www/status.txt.
# Usage: python3 build.py <raw base URL of the video folder>  (that folder holds config.json)
import json, os, re, subprocess, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
R = sys.argv[1].rstrip("/") + "/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 Chrome/120 Safari/537.36"
W = "/vercel/w/"; C = W + "clips/"; S = W + "segs/"; WWW = "/tmp/www/"
for d in (W, C, S, WWW): os.makedirs(d, exist_ok=True)
def status(x):
    open(WWW + "status.txt", "w").write(x + "\n"); print("STATUS", x, flush=True)
def get(url, ua=UA):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    return urllib.request.urlopen(req, timeout=60).read()
def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True); return r.returncode, r.stdout + r.stderr

status("tools")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "imageio-ffmpeg"], capture_output=True)
import site, importlib; site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()  # --user dir may not exist at startup
import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
for f in ("config.json", "edl.json", "overlay.webm", "music.m4a", "thumb-text.png"):
    open(W + f, "wb").write(get(R + f))
EDL = json.load(open(W + "edl.json")); CFG = json.load(open(W + "config.json"))
try: open(W + "font.ttf", "wb").write(get("https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"))
except Exception as e: print("font", e)

status("scouting")
THEMES = {k: list(v) for k, v in CFG["themes"].items()}
found = {}
def scan(u):
    try: return re.findall(r"/free-stock-video/([a-z0-9-]+)-(\d+)/", get(u).decode("utf8", "ignore"))
    except Exception: return []
for theme, rule in CFG.get("discover", {}).items():
    rx = re.compile(rule["rx"]); hits = {}
    pages = [f"https://mixkit.co/free-stock-video/{c}/?page={p}" for c in rule["cats"] for p in range(1, rule.get("pages", 3) + 1)]
    with ThreadPoolExecutor(8) as ex:
        for res in ex.map(scan, pages):
            for slug, i in res:
                if rx.search(slug) and not re.search(rule.get("not", "^$"), slug): hits[i] = slug
    found[theme] = hits
    THEMES[theme] = list(hits)[:rule.get("max", 10)] + THEMES.get(theme, [])
for theme, extra in CFG.get("pad", {}).items():  # too few dedicated clips: mix in related ones
    for k in extra:
        if len(THEMES.get(theme, [])) < 6: THEMES[theme] = THEMES.get(theme, []) + THEMES.get(k, [])[:4]
print("FOUND", json.dumps(found), flush=True)
def dl(i):
    if os.path.exists(C + i + ".mp4"): return
    for q in ("1080", "720"):
        try:
            open(C + i + ".mp4", "wb").write(get(f"https://assets.mixkit.co/videos/{i}/{i}-{q}.mp4")); return
        except Exception: pass
with ThreadPoolExecutor(8) as ex: list(ex.map(dl, sorted({i for v in THEMES.values() for i in v})))
for k in THEMES: THEMES[k] = [i for i in THEMES[k] if os.path.exists(C + i + ".mp4") and os.path.getsize(C + i + ".mp4") > 100000]
for k in THEMES: THEMES[k] = THEMES[k] or THEMES[CFG["fallback"].get(k, "city")] or THEMES["city"]
def probe(i):
    _, o = sh([FF, "-i", C + i + ".mp4"])
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", o); wh = re.search(r", (\d{3,4})x(\d{3,4})", o)
    return (int(d[1]) * 3600 + int(d[2]) * 60 + float(d[3])), int(wh[1]), int(wh[2])
INFO = {i: probe(i) for v in THEMES.values() for i in v}

status("photos")
CREDITS = {}
def commons_photo(key, name):
    q = urllib.parse.quote(f'"{name}"')
    api = ("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=20"
           f"&gsrsearch={q}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=LicenseShortName|Artist&format=json")
    try: pages = json.loads(get(api, "OddsHunterBot/1.0 (video credits)"))["query"]["pages"].values()
    except Exception as e: print("commons", key, e); return
    best = None
    for p in pages:
        ii = p["imageinfo"][0]; m = ii.get("extmetadata", {})
        lic = m.get("LicenseShortName", {}).get("value", "")
        if ii.get("mime") != "image/jpeg" or not all(w.lower() in p["title"].lower() for w in name.split()): continue
        if not re.search(r"CC BY|CC0|Public domain", lic, re.I) or "NC" in lic or "ND" in lic: continue
        if best is None or ii["width"] * ii["height"] > best[0]["width"] * best[0]["height"]: best = (ii, lic, m, p["title"])
    if not best: print("no photo for", key); return
    ii, lic, m, title = best
    artist = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip() or "auteur inconnu"
    open(W + key + ".jpg", "wb").write(get(ii["url"].split("?")[0], "OddsHunterBot/1.0 (video credits)"))
    CREDITS[key] = {"title": title, "artist": artist[:60], "license": lic}
for key, name in CFG["photos"].items(): commons_photo(key, name)
print("CREDITS", json.dumps(CREDITS, ensure_ascii=False), flush=True)

status("footage")
FPS = 30; fr = lambda t: round(t * FPS)
def seg(k):
    a, b, th = EDL["EDL"][k]
    draw = ""
    n = fr(b) - fr(a); d = n / FPS
    photo = th.split(":")[1] if th.startswith("photo:") else None
    pool = THEMES[CFG["photo_bg"] if photo else th]; j = use_idx[k]
    clip = pool[j % len(pool)]; dur, w, h = INFO[clip]
    inp = (j // len(pool)) * 3.0 % max(dur - 2, 0.1)
    s = 1.0
    if dur - inp < d: inp = 0.0
    if dur < d: s = min(d / dur, 1.5)
    loop = ["-stream_loop", "-1"] if dur * s < d + 0.2 else []
    vf = ["scale=2112:-2,crop=2112:1188:0:(ih-1188)/2" if h > w else "scale=2112:1188"]
    if j % 3 == 1: vf.append("hflip")
    dx = f"(iw-1920)*t/{d:.3f}" if k % 2 == 0 else f"(iw-1920)*(1-t/{d:.3f})"
    vf += [f"setpts={s:.4f}*(PTS-STARTPTS)", "fps=30", f"crop=1920:1080:{dx}:(ih-1080)/2", "eq=brightness=-0.07:saturation=0.8:contrast=1.06"]
    if th == "city" and k >= len(EDL["EDL"]) - 2: vf.append("eq=brightness=-0.2")
    cmd = [FF, "-y", "-loglevel", "error", *loop, "-ss", f"{inp:.2f}", "-i", C + clip + ".mp4"]
    if photo and os.path.exists(W + photo + ".jpg"):
        cr = CREDITS[photo]
        open(W + photo + ".txt", "w").write(f"Photo : {cr['artist']} · {cr['license']} · Wikimedia Commons")
        draw = f",drawtext=fontfile={W}font.ttf:textfile={W}{photo}.txt:fontsize=19:fontcolor=white@0.8:shadowcolor=black@0.9:shadowx=1:shadowy=1:x=150:y=812" if os.path.exists(W + "font.ttf") else ""
        cmd += ["-loop", "1", "-i", W + photo + ".jpg", "-filter_complex",
                "[0:v]" + ",".join(vf) + ",boxblur=18:2,eq=brightness=-0.12[bg];"
                "[1:v]scale='min(700,iw*620/ih)':'min(620,ih*700/iw)':flags=lanczos,unsharp=5:5:0.5,pad=iw+16:ih+16:8:8:white[ph];"
                "[bg][ph]overlay=x=510-w/2:y=470-h/2" + draw + ",format=yuv420p[v]", "-map", "[v]"]
    else:
        cmd += ["-vf", ",".join(vf) + ",format=yuv420p"]
    cmd += ["-frames:v", str(n), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", "30", S + f"seg{k:03d}.mp4"]
    rc, o = sh(cmd)
    if rc and photo:  # drawtext missing in this build: retry without the burnt-in credit
        cmd = [x.replace(draw, "") if isinstance(x, str) and draw else x for x in cmd]; rc, o = sh(cmd)
    return k, rc, o[-200:]
use_idx = {}; counters = {}
for k, (a, b, th) in enumerate(EDL["EDL"]):
    key = CFG["photo_bg"] if th.startswith("photo:") else th
    use_idx[k] = counters.get(key, 0); counters[key] = use_idx[k] + 1
with ThreadPoolExecutor(os.cpu_count()) as ex:
    for k, rc, o in ex.map(seg, range(len(EDL["EDL"]))):
        if rc: print("SEGFAIL", k, o, flush=True)
open(S + "list.txt", "w").write("".join(f"file 'seg{k:03d}.mp4'\n" for k in range(len(EDL["EDL"]))))
sh([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", S + "list.txt", "-c", "copy", W + "bg.mp4"])

status("thumbnail")
tb = THEMES[CFG["thumb_bg"]][0]
inputs = ["-ss", "2", "-i", C + tb + ".mp4"]
fc = "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=4:1,eq=brightness=-0.2:saturation=0.75[bg];"
TP = W + CFG["thumb_photo"] + ".jpg"
if os.path.exists(TP):
    inputs += ["-i", TP]; fc += "[1:v]scale=-2:600:flags=lanczos,pad=iw+16:ih+16:8:8:white[ph];[bg][ph]overlay=50:52[a];"; last = "[a]"; ti = 2
else:
    last = "[bg]"; ti = 1
inputs += ["-i", W + "thumb-text.png"]; fc += f"{last}[{ti}:v]overlay"
sh([FF, "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, "-frames:v", "1", "-q:v", "2", WWW + CFG["name"] + "-miniature.jpg"])

status("assembling")
out = WWW + CFG["name"] + ".mp4"
rc, o = sh([FF, "-y", "-loglevel", "error", "-i", W + "bg.mp4", "-c:v", "libvpx-vp9", "-i", W + "overlay.webm", "-i", W + "music.m4a",
            "-filter_complex", "[0:v][1:v]overlay=format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a", "-t", f"{EDL['DURATION']:.3f}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out])
print("ASSEMBLE", rc, o[-300:], flush=True)
sh(["cp", out, out.replace(".mp4", ".mov")])
json.dump({"credits": CREDITS, "found": found}, open(WWW + "credits.json", "w"), ensure_ascii=False)
status("done")
