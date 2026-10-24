# Builds the real-footage background track (1920x1080, 30 fps) from the EDL below.
# Each row: start, end, clip, in-point, options (s=slow factor, f=hflip, v=vertical source, p=photo, d=extra darkening)
import subprocess, os, sys
from concurrent.futures import ThreadPoolExecutor
FF = "/vercel/.local/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
C = "/vercel/clips/"
OUT = "/vercel/bg/"
os.makedirs(OUT, exist_ok=True)
EDL = [
 (0, 5.4, "2285", 3.0, {"v": 1}),
 (5.4, 10.0, "44464", 0, {}),
 (10.0, 14.4, "24343", 2, {}),
 (14.4, 19.4315, "49329", 3, {}),
 (19.4315, 28.6, "44448", 0, {"s": 1.6, "p": "donaghy_2010.jpg"}),
 (28.6, 34.0426, "17206", 1, {}),
 (34.0426, 40.2, "13733", 0, {}),
 (40.2, 44.1, "44448", 0, {}),
 (44.1, 50.8, "44464", 0, {"s": 1.35, "f": 1}),
 (50.8, 58.8, "17206", 0, {"f": 1}),
 (58.8, 64.7611, "29914", 0, {}),
 (64.7611, 71.4, "23073", 0, {}),
 (71.4, 74.8, "23073", 8, {}),
 (74.8, 80.6, "309", 0, {}),
 (80.6, 85.5, "309", 12, {}),
 (85.5, 92.7, "44448", 0, {"s": 1.2, "f": 1}),
 (92.7, 97.237, "18296", 0, {}),
 (97.237, 106.0, "18304", 0, {}),
 (106.0, 113.4778, "309", 19, {}),
 (113.4778, 118.1, "41161", 0, {}),
 (118.1, 126.0, "40746", 0, {"v": 1}),
 (126.0, 132.2, "41161", 6, {}),
 (132.2, 145.3815, "17536", 2, {}),
 (145.3815, 158.7, "45703", 2, {}),
 (158.7, 169.6556, "18296", 0, {"s": 1.1, "f": 1}),
 (169.6556, 179.6, "6754", 0, {}),
 (179.6, 186.4, "40746", 4, {"v": 1}),
 (186.4, 199.9, "47803", 0, {"p": "donaghy_mugshot.jpg"}),
 (199.9, 203.3907, "47803", 14, {}),
 (203.3907, 213.6, "49254", 0, {}),
 (213.6, 225.3889, "24343", 5, {}),
 (225.3889, 236.4, "46820", 0, {}),
 (236.4, 244.2, "47602", 0, {"s": 1.25}),
 (244.2, 248.8481, "47686", 3, {}),
 (248.8481, 258.6, "6754", 12, {}),
 (258.6, 266.1, "2285", 1.5, {"v": 1, "f": 1}),
 (266.1, 274.9, "29914", 6, {}),
 (274.9, 279.2, "13733", 2, {}),
 (279.2, 283.6, "44464", 0, {}),
 (283.6, 289.7, "23073", 9, {}),
 (289.7, 301.7, "41161", 0, {"f": 1}),
 (301.7, 307.8889, "17206", 3, {}),
 (307.8889, 318.6, "40746", 0, {"v": 1, "d": 0.25}),
]
FPS = 30
# frame-exact boundaries so the concatenation lands on the overlay's cuts
def frames(t): return round(t * FPS)

def job(i):
    a, b, clip, inp, o = EDL[i]
    n = frames(b) - frames(a)
    d = n / FPS
    s = o.get("s", 1.0)
    pre = []
    if o.get("v"):
        pre.append("scale=2112:-2,crop=2112:1188:0:(ih-1188)/2")
    else:
        pre.append("scale=2112:1188")
    if o.get("f"): pre.append("hflip")
    # slow push-in / drift: alternate direction per segment
    dx = "(iw-1920)*t/%.3f" % d if i % 2 == 0 else "(iw-1920)*(1-t/%.3f)" % d
    pre.append("setpts=%.4f*(PTS-STARTPTS)" % s)
    pre.append("fps=30")
    pre.append("crop=1920:1080:%s:(ih-1080)/2" % dx)
    br = -0.07 - o.get("d", 0)
    pre.append("eq=brightness=%.2f:saturation=0.78:contrast=1.06" % br)
    out = OUT + "seg%02d.mp4" % i
    src_dur = d / s + 0.5
    cmd = [FF, "-y", "-loglevel", "error", "-ss", str(inp), "-t", "%.3f" % src_dur, "-i", C + clip + ".mp4"]
    if o.get("p"):
        cmd += ["-loop", "1", "-i", C + o["p"]]
        if "2010" in o["p"]:
            ph = "[1:v]scale=720:-2:flags=lanczos,unsharp=5:5:0.8,pad=iw+28:ih+28:14:14:white[ph]"
            pos = "overlay=170:230"
        else:
            ph = "[1:v]scale=470:-2:flags=lanczos,unsharp=5:5:0.6,pad=iw+16:ih+16:8:8:white[ph]"
            pos = "overlay=200:150"
        fc = "[0:v]" + ",".join(pre) + ",boxblur=18:2,eq=brightness=-0.12[bg];" + ph + ";[bg][ph]" + pos + ",format=yuv420p[v]"
    else:
        fc = "[0:v]" + ",".join(pre) + ",format=yuv420p[v]"
    cmd += ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(n), "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", "30", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return i, n, r.returncode, r.stderr[-300:]

idx = [int(x) for x in sys.argv[1:]] or range(len(EDL))
with ThreadPoolExecutor(2) as ex:
    for i, n, rc, err in ex.map(job, idx):
        print(i, n, rc, err, flush=True)
with open(OUT + "list.txt", "w") as f:
    for i in range(len(EDL)):
        f.write("file 'seg%02d.mp4'\n" % i)
print("total frames", frames(318.6))
