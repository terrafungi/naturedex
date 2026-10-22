// Makes NatureDex installable. Nothing is cached, so a deploy is always live at once;
// pages only fall back to a small offline screen when the network is gone.
const OFFLINE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NatureDex — hors ligne</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05130d;color:#a3b5a9;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><img src="/icon-192.png" width="96" height="96" alt="" style="border-radius:22px"><h1 style="color:#fff;font-family:Georgia,serif;font-weight:600">Pas de réseau</h1>
<p>NatureDex a besoin d'internet pour jouer.<br>Reconnecte-toi puis réessaie.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:12px 24px;border:0;border-radius:999px;background:#e9c46a;color:#2a1c00;font-weight:700;font-size:16px">Réessayer</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
    if (e.request.mode !== 'navigate') return;
    e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
