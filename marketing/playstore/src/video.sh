#!/bin/sh
# Vidéo promo : capture video.html image par image (25 i/s), génère la bande-son, assemble le MP4 1920×1080.
# Usage : FFMPEG=/chemin/ffmpeg sh video.sh   (ffmpeg via « npm i ffmpeg-static »)
set -e
cd "$(dirname "$0")"
FPS=25; DUR=31; N=$((FPS * DUR))
FR=/tmp/nd-frames; rm -rf $FR; mkdir -p $FR
python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!
sleep 1
agent-browser open http://127.0.0.1:8765/video.html >/dev/null
agent-browser set viewport 1920 1080 1 >/dev/null
agent-browser wait --load networkidle >/dev/null
agent-browser wait 1000 >/dev/null
i=0
while [ $i -lt $N ]; do
    # Lots de 30 images par appel batch pour limiter le coût de démarrage.
    node -e "const [a,n,f,d]=process.argv.slice(1).map(Number);const c=[];for(let k=a;k<Math.min(a+30,n);k++){c.push(['eval','seek('+(k/f).toFixed(4)+')']);c.push(['screenshot','$FR/f'+String(k).padStart(4,'0')+'.png'])}console.log(JSON.stringify(c))" $i $N $FPS | agent-browser batch --bail >/dev/null
    i=$((i + 30)); echo "$i/$N"
done
agent-browser close --all >/dev/null
kill $SRV
node soundtrack.mjs /tmp/nd-music.wav $DUR
"$FFMPEG" -y -loglevel error -framerate $FPS -i $FR/f%04d.png -i /tmp/nd-music.wav \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
    -c:a aac -b:a 192k -shortest ../video/naturedex-promo-1920x1080.mp4
echo ../video/naturedex-promo-1920x1080.mp4
