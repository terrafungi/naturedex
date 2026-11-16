// Génère les pages HTML des visuels Play Store (captures 1080×1920 + bannière 1024×500).
// Rendu ensuite en PNG avec agent-browser (voir render.sh).
import { writeFileSync } from 'node:fs';

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600..900;1,500..700&family=Plus+Jakarta+Sans:wght@400..800&display=swap" rel="stylesheet">`;

const SLIDES = [
    { file: '01-boosters', shot: 'reveal_best', glow: '#e9c46a', eyebrow: 'Plus de 150 000 espèces réelles', title: 'Ouvre des boosters<br><em>de vraie nature</em>', sub: 'Mammifères, oiseaux, insectes, plantes… chaque carte est une espèce qui existe.' },
    { file: '02-collection', shot: 'collection2', glow: '#c79bff', eyebrow: 'Collection', title: 'Des communes<br>aux <em>secrètes</em>', sub: 'Six raretés à collectionner, et les 50 espèces stars en cartes Secrètes.' },
    { file: '03-exploration', shot: 'explore3', glow: '#4fd18b', eyebrow: 'Exploration', title: 'Sors explorer<br><em>le monde réel</em>', sub: 'Des cartes apparaissent autour de toi. En forêt, les rares sortent plus souvent.' },
    { file: '04-carte', shot: 'card', glow: '#ff7eb6', eyebrow: 'Apprends en jouant', title: 'Chaque carte,<br><em>une vraie fiche</em>', sub: 'Photos et textes issus de Wikipédia et Wikimedia Commons.' },
    { file: '05-duel', shot: 'duelgame3', glow: '#ff8a5c', eyebrow: 'Duel de cartes', title: 'Affronte<br>les <em>rangers</em>', sub: 'Créatures, Énergies et Naturalistes : construis ton deck et gagne de nouvelles cartes.' },
    { file: '06-quiz', shot: 'quizgame', glow: '#e9c46a', eyebrow: 'Quiz Arena', title: 'Deviens<br><em>incollable</em>', sub: '4 modes de jeu et un concours chaque semaine : le podium gagne des pépites.' },
    { file: '07-jardin', shot: 'garden', glow: '#7ee0ff', eyebrow: 'Jardin 3D', title: 'Cultive<br><em>ton île</em>', sub: 'Plante, récolte, installe une ruche et un atelier sur ton jardin en 3D.' },
    { file: '08-solidaire', shot: 'avatar', glow: '#4fd18b', eyebrow: 'Un jeu solidaire', title: '20 % reversés<br><em>à la nature</em>', sub: 'Chaque achat soutient la LPO ou Wikipédia. Et ton avatar 3D t’attend.' },
];

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#05130d}
em{font-style:italic;background:linear-gradient(120deg,#fbe7a6,#e9c46a 50%,#c8973a);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.grain{position:absolute;inset:0;opacity:.07;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
`;

function slide(s) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
body{width:1080px;height:1920px;overflow:hidden;position:relative;font-family:'Plus Jakarta Sans',sans-serif;color:#fff;
  background:radial-gradient(900px 700px at 50% 108%, ${s.glow}55, transparent 70%),radial-gradient(800px 600px at 0% 0%, #1f8a4f40, transparent 70%),linear-gradient(180deg,#0a2117 0%,#05130d 55%,#030b07 100%)}
.top{position:absolute;left:0;right:0;top:120px;text-align:center;padding:0 70px}
.eyebrow{display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:30px;letter-spacing:.16em;text-transform:uppercase;color:#a8f0c6}
.eyebrow img{width:46px;height:46px;border-radius:11px}
h1{margin-top:28px;font-family:'Playfair Display',serif;font-weight:800;font-size:104px;line-height:1.02;letter-spacing:-.01em}
p{margin:30px auto 0;max-width:860px;font-size:36px;line-height:1.38;color:rgba(255,255,255,.72);font-weight:500}
.phone{position:absolute;left:50%;top:700px;width:700px;height:1517px;transform:translateX(-50%);border-radius:96px;padding:20px;
  background:linear-gradient(145deg,#2c3b33,#0d1612 40%,#1b2620);box-shadow:0 0 0 3px #3d4d44, 0 60px 140px -20px #000, 0 0 160px -30px ${s.glow}}
.phone .scr{width:100%;height:100%;border-radius:78px;overflow:hidden;background:#05130d}
.phone img{width:100%;display:block}
.halo{position:absolute;left:50%;top:640px;width:900px;height:900px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(${s.glow}38, transparent 65%);filter:blur(20px)}
</style></head><body>
<div class="halo"></div>
<div class="top"><div class="eyebrow"><img src="logo.svg">${s.eyebrow}</div><h1>${s.title}</h1><p>${s.sub}</p></div>
<div class="phone"><div class="scr"><img src="shots/${s.shot}.jpg"></div></div>
<div class="grain"></div>
</body></html>`;
}

function feature() {
    const card = (shot, x, y, rot, w, glow) => `<div class="ph" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round(w * 2.168)}px;transform:rotate(${rot}deg);box-shadow:0 30px 70px -10px #000,0 0 70px -10px ${glow}"><img src="shots/${shot}.jpg"></div>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
body{width:1024px;height:500px;overflow:hidden;position:relative;font-family:'Plus Jakarta Sans',sans-serif;color:#fff;
  background:radial-gradient(520px 420px at 78% 60%, #e9c46a40, transparent 70%),radial-gradient(600px 500px at 0% 0%, #1f8a4f55, transparent 70%),linear-gradient(120deg,#0b2419,#05130d 60%,#030b07)}
.txt{position:absolute;left:64px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:520px}
.brand{display:flex;align-items:center;gap:16px}
.brand img{width:64px;height:64px;border-radius:15px;box-shadow:0 8px 30px -6px #e9c46a80}
.brand span{font-family:'Playfair Display',serif;font-weight:800;font-size:40px}
h1{margin-top:22px;font-family:'Playfair Display',serif;font-weight:800;font-size:58px;line-height:1.03}
p{margin-top:16px;font-size:20px;color:rgba(255,255,255,.72);font-weight:500;line-height:1.4}
.ph{position:absolute;border-radius:30px;padding:7px;background:linear-gradient(145deg,#2c3b33,#0d1612 40%,#1b2620)}
.ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:24px;display:block}
</style></head><body>
<div class="txt"><div class="brand"><img src="logo.svg"><span>NatureDex</span></div>
<h1>Collectionne<br><em>la nature</em></h1>
<p>Plus de 150 000 espèces réelles en cartes à collectionner.</p></div>
${card('collection2', 600, 70, -9, 190, '#c79bff')}
${card('reveal_best', 800, 40, 7, 190, '#e9c46a')}
${card('explore3', 700, 150, -1, 200, '#4fd18b')}
<div class="grain"></div>
</body></html>`;
}

for (const s of SLIDES) writeFileSync(new URL(`${s.file}.html`, import.meta.url), slide(s));
writeFileSync(new URL('feature.html', import.meta.url), feature());
console.log(SLIDES.length + 1, 'pages');
