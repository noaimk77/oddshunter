#!/bin/bash
# Final assembly in the sandbox: real-footage track + transparent graphics + music.
set -e
F=/vercel/.local/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
R=https://raw.githubusercontent.com/noaimk77/oddshunter/claude/social-media-assets/studio/donaghy-real
mkdir -p /vercel/final /tmp/www && cd /vercel/final
for f in overlay.webm music.m4a thumb-text.png; do curl -sfL -o $f $R/$f; done
ls -la
# thumbnail: court-room frame, real DOJ photo on the left, text layer on top
$F -loglevel error -y -ss 6 -i /vercel/clips/46820.mp4 -i /vercel/clips/donaghy_mugshot.jpg -i thumb-text.png -filter_complex \
 "[0:v]scale=1280:720,boxblur=6:1,eq=brightness=-0.18:saturation=0.7[bg];[1:v]scale=-2:620:flags=lanczos,unsharp=5:5:0.6,pad=iw+16:ih+16:8:8:white[ph];[bg][ph]overlay=60:42[a];[a][2:v]overlay" \
 -frames:v 1 -q:v 2 /tmp/www/donaghy-miniature.jpg
# video: libvpx decoder keeps the alpha channel of the overlay
$F -loglevel error -y -i /vercel/bg.mp4 -c:v libvpx-vp9 -i overlay.webm -i music.m4a -filter_complex \
 "[0:v][1:v]overlay=format=auto,format=yuv420p[v]" -map "[v]" -map 2:a -t 318.5148 \
 -c:v libx264 -preset fast -crf 19 -profile:v high -c:a aac -b:a 192k -movflags +faststart /tmp/www/oddshunter-donaghy-vraies-images.mp4
cp /tmp/www/oddshunter-donaghy-vraies-images.mp4 /tmp/www/oddshunter-donaghy-vraies-images.mov
$F -loglevel error -y -ss 24 -i /tmp/www/oddshunter-donaghy-vraies-images.mp4 -frames:v 1 -vf scale=640:-2 /tmp/www/check24.jpg
echo COMP_DONE
