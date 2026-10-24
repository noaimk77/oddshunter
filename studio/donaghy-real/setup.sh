#!/bin/bash
# One-shot rebuild in a fresh Vercel sandbox: tools, free clips (Mixkit), real photos (Wikimedia), footage track, final assembly.
R=https://raw.githubusercontent.com/noaimk77/oddshunter/claude/social-media-assets/studio/donaghy-real
cd /vercel && mkdir -p clips /tmp/www && echo starting > /tmp/www/status.txt
pip install -q --user imageio-ffmpeg >/dev/null 2>&1 || pip install -q --user --break-system-packages imageio-ffmpeg
export FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
export JOBS=$(nproc)
curl -sfL -o bg.py $R/bg.py && curl -sfL -o comp.sh $R/comp.sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 Chrome/120 Safari/537.36'
cd clips
for id in 13733 17206 44464 2285 44448 309 23073 18296 18304 45703 40746 49329 6754 29914 49254 46820 47686 47602 47803 24343 17536 41161; do
  ( for q in 1080 720; do code=$(curl -s -A "$UA" -o $id.mp4 -w '%{http_code}' https://assets.mixkit.co/videos/$id/$id-$q.mp4); [ "$code" = 200 ] && break; done ) &
done
curl -sfL -A 'OddsHunterBot/1.0' -o donaghy_mugshot.jpg 'https://commons.wikimedia.org/wiki/Special:FilePath/Mugshot_of_Tim_Donaghy.jpg'
curl -sfL -A 'OddsHunterBot/1.0' -o donaghy_2010.jpg 'https://commons.wikimedia.org/wiki/Special:FilePath/Tim_Donaghy_in_2010.jpg'
wait
ls -la > /tmp/www/clips.txt
cd /vercel && echo footage > /tmp/www/status.txt
python3 bg.py > /tmp/www/bg.log 2>&1
cd /vercel/bg && $FF -loglevel error -y -f concat -safe 0 -i list.txt -c copy /vercel/bg.mp4
echo assembling > /tmp/www/status.txt
bash /vercel/comp.sh > /tmp/www/comp.log 2>&1
echo done > /tmp/www/status.txt
