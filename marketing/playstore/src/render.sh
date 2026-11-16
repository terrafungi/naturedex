#!/bin/sh
# Rendu des visuels Play Store : node build.mjs, petit serveur HTTP local, puis capture de chaque page.
set -e
cd "$(dirname "$0")"
node build.mjs
python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!
sleep 1
U=http://127.0.0.1:8765
shot() { # page largeur hauteur sortie
    agent-browser open "$U/$1" >/dev/null
    agent-browser set viewport "$2" "$3" 1 >/dev/null
    agent-browser wait --load networkidle >/dev/null
    agent-browser wait 800 >/dev/null
    agent-browser screenshot "$4" >/dev/null
    echo "$4"
}
for f in 0*.html; do shot "$f" 1080 1920 "../screenshots/${f%.html}.png"; done
shot feature.html 1024 500 ../feature-graphic-1024x500.png
agent-browser close --all >/dev/null
kill $SRV
