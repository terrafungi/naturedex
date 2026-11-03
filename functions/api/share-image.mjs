// 1200×630 Open Graph image of a card, drawn as SVG and rasterised with resvg (WebAssembly).
import { readFileSync } from 'node:fs';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const here = (p) => new URL(p, import.meta.url);
const FONTS = ['PlayfairDisplay-Bold.ttf', 'PlusJakartaSans-SemiBold.ttf', 'PlusJakartaSans-ExtraBold.ttf']
    .map((f) => readFileSync(here(`./fonts/${f}`)));
let ready;
const init = () => (ready ??= initWasm(readFileSync(here('./node_modules/@resvg/resvg-wasm/index_bg.wasm'))));

export const RARITY_STYLE = {
    rare: { label: 'Rare', symbol: '★', color: '#4ea8ff', light: '#b9dcff', dark: '#1d5fa8' },
    epic: { label: 'Épique', symbol: '★★', color: '#b46bff', light: '#e2c8ff', dark: '#6526a8' },
    legendary: { label: 'Légendaire', symbol: '★★★', color: '#ffc53d', light: '#fff0b8', dark: '#a8700a' },
    secret: { label: 'Secrète', symbol: '', color: '#ff5fd2', light: '#ffd6f4', dark: '#9a2a7f' },
};
const TYPES = {
    mammal: ['Mammifère', '#e2683c'], bird: ['Oiseau', '#3b82f6'], reptile: ['Reptile & amphibien', '#22a35a'],
    fish: ['Poisson', '#0ea5e9'], arthropod: ['Insecte & arachnide', '#e09b00'], marine: ['Créature marine', '#4f46e5'],
    plant: ['Plante', '#65a30d'], tree: ['Arbre', '#15803d'], alga: ['Algue', '#0d9488'], fungus: ['Champignon', '#c2410c'],
    mold: ['Moisissure & levure', '#889c24'], bacteria: ['Bactérie', '#8b5cf6'], virus: ['Virus', '#e11d74'], fossil: ['Fossile', '#a8763e'], mineral: ['Minéral', '#6d7fa3'],
};
const RAINBOW = ['#ff5fd2', '#ffd36e', '#7dffb0', '#6ec8ff', '#c18bff'];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (text, max) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// Greedy word wrap on an average glyph width (Playfair Bold ≈ 0.5 em).
function wrap(text, size, width, lines) {
    const max = Math.floor(width / (size * 0.5));
    const out = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if (!line || (line + ' ' + word).length <= max) line = line ? `${line} ${word}` : word;
        else { out.push(line); line = word; }
    }
    out.push(line);
    if (out.length > lines) out.splice(lines - 1, out.length, clip(out.slice(lines - 1).join(' '), max));
    return out.map((l) => clip(l, max));
}

// Thin light rays around the card for the brightest rarities.
function rays(cx, cy, style, rainbow) {
    const n = 28;
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, w = 0.035, r = 900;
        const p = (t) => `${(cx + Math.cos(t) * r).toFixed(1)},${(cy + Math.sin(t) * r).toFixed(1)}`;
        const color = rainbow ? RAINBOW[i % RAINBOW.length] : style.color;
        return `<polygon points="${cx},${cy} ${p(a - w)} ${p(a + w)}" fill="${color}" opacity="${i % 2 ? 0.10 : 0.18}"/>`;
    }).join('');
}

// Four-pointed star (the ✦ of secret cards: the fonts have no such glyph).
const star4 = (x, y, r, color) => `<path d="M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="${color}"/>`;

function sparkles(seed, style, rainbow) {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    return Array.from({ length: 26 }, (_, i) => {
        const x = 40 + rand() * 1120, y = 30 + rand() * 570, r = 1.5 + rand() * 3.5;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${rainbow ? RAINBOW[i % 5] : style.light}" opacity="${(0.35 + rand() * 0.5).toFixed(2)}"/>`;
    }).join('');
}

export function shareSvg(card, photo) {
    const style = RARITY_STYLE[card.rarity] || RARITY_STYLE.rare;
    const secret = card.rarity === 'secret';
    const bright = ['epic', 'legendary', 'secret'].includes(card.rarity);
    const [typeLabel, typeColor] = TYPES[card.type] || ['Espèce', '#4fd18b'];
    const size = card.name.length > 34 ? 46 : card.name.length > 20 ? 56 : 68;
    const nameLines = wrap(card.name, size, 590, 2);
    const nameY = 300;
    const sciY = nameY + (nameLines.length - 1) * size * 1.08 + 46;
    const showSci = card.sci_name && card.sci_name !== card.name;
    const pillY = sciY + (showSci ? 30 : -10);
    const pillW = 34 + typeLabel.length * 11.5;
    const border = secret
        ? RAINBOW.map((c, i) => `<stop offset="${i / (RAINBOW.length - 1)}" stop-color="${c}"/>`).join('')
        : `<stop offset="0" stop-color="${style.light}"/><stop offset="0.45" stop-color="${style.color}"/><stop offset="1" stop-color="${style.dark}"/>`;
    const cardName = clip(card.name, 21);

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03100a"/><stop offset="1" stop-color="#0c2b1b"/></linearGradient>
  <radialGradient id="glow" cx="300" cy="315" r="460" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${style.color}" stop-opacity="0.62"/><stop offset="0.55" stop-color="${style.color}" stop-opacity="0.16"/><stop offset="1" stop-color="${style.color}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">${border}</linearGradient>
  <linearGradient id="leaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1f8a4f"/><stop offset="0.6" stop-color="#4fd18b"/><stop offset="1" stop-color="#c8f7d9"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0.3" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.7" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="photo"><rect x="151" y="140" width="298" height="290" rx="10"/></clipPath>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
${bright ? rays(300, 315, style, secret) : ''}
<rect width="1200" height="630" fill="url(#glow)"/>
${sparkles(Number(card.id) || 1, style, secret)}
<g transform="rotate(-4 300 315)">
  <rect x="133" y="78" width="350" height="510" rx="28" fill="#000" opacity="0.55" filter="url(#shadow)"/>
  <rect x="125" y="60" width="350" height="510" rx="26" fill="url(#frame)"/>
  <rect x="137" y="72" width="326" height="486" rx="17" fill="#f4eedc"/>
  <text x="153" y="120" font-family="Playfair Display" font-weight="700" font-size="29" fill="#1d2a20">${esc(cardName)}</text>
  <rect x="148" y="137" width="304" height="296" rx="12" fill="${typeColor}"/>
  ${photo
        ? `<image x="151" y="140" width="298" height="290" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)" xlink:href="${photo}"/>`
        : `<rect x="151" y="140" width="298" height="290" rx="10" fill="#dfe9df"/>`}
  <text x="153" y="470" font-family="Plus Jakarta Sans" font-weight="800" font-size="17" fill="${typeColor}">${esc(typeLabel.toUpperCase())}</text>
  <line x1="153" y1="488" x2="447" y2="488" stroke="#1d2a20" stroke-opacity="0.15" stroke-width="2"/>
  <text x="153" y="532" font-family="Playfair Display" font-weight="700" font-size="22" fill="#1d2a20" opacity="0.75">NatureDex</text>
  <text x="447" y="532" text-anchor="end" font-family="Plus Jakarta Sans" font-weight="800" font-size="18" fill="${secret ? '#d43fb0' : style.dark}">${esc(secret ? style.label : `${style.symbol} ${style.label}`)}</text>
  ${secret ? star4(368, 526, 9, '#d43fb0') : ''}
  ${bright ? '<rect x="125" y="60" width="350" height="510" rx="26" fill="url(#sheen)"/>' : ''}
</g>
<g transform="translate(560 62) scale(1.45)">
  <path d="M7 33C5 18 15 6 34 5c1 19-10 30-25 29z" fill="url(#leaf)"/>
  <path d="M8 32C14 24 20 17 29 10" stroke="#05130d" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.65"/>
</g>
<text x="626" y="108" font-family="Playfair Display" font-weight="700" font-size="40" fill="#ffffff">NatureDex</text>
${secret ? star4(574, 209, 13, style.color) : ''}
<text x="${secret ? 598 : 562}" y="218" font-family="Plus Jakarta Sans" font-weight="800" font-size="25" letter-spacing="4" fill="${style.color}">${esc(secret ? `CARTE ${style.label.toUpperCase()}` : `${style.symbol}  CARTE ${style.label.toUpperCase()}`)}</text>
${nameLines.map((l, i) => `<text x="560" y="${(nameY + i * size * 1.08).toFixed(0)}" font-family="Playfair Display" font-weight="700" font-size="${size}" fill="#ffffff">${esc(l)}</text>`).join('\n')}
${showSci ? `<text x="562" y="${sciY.toFixed(0)}" font-family="Plus Jakarta Sans" font-weight="600" font-size="25" fill="#a9c4b3">${esc(clip(card.sci_name, 44))}</text>` : ''}
<rect x="562" y="${(pillY + 8).toFixed(0)}" width="${pillW.toFixed(0)}" height="38" rx="19" fill="${typeColor}"/>
<text x="${(562 + pillW / 2).toFixed(0)}" y="${(pillY + 34).toFixed(0)}" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="800" font-size="18" fill="#ffffff">${esc(typeLabel)}</text>
<text x="562" y="548" font-family="Plus Jakarta Sans" font-weight="600" font-size="24" fill="#cfe3d6">Collectionne 60 106 espèces du vivant</text>
<text x="562" y="590" font-family="Plus Jakarta Sans" font-weight="800" font-size="27" fill="#4fd18b">naturedex.fr</text>
</svg>`;
}

// Card photo as a data URI (Wikimedia thumbnail first, the original file as a fallback).
async function photoData(card) {
    for (const url of [card.thumb_url, card.image_url].filter(Boolean)) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'NatureDex/1.0 (https://naturedex.fr; share images)' },
                signal: AbortSignal.timeout(6000),
            });
            const type = res.headers.get('content-type') || '';
            if (!res.ok || !/^image\/(jpeg|png|gif|webp)/.test(type)) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 8 * 1024 * 1024) continue;
            return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
        } catch { /* try the next source */ }
    }
    return null;
}

export async function renderShareImage(card) {
    await init();
    const svg = shareSvg(card, await photoData(card));
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
        font: { fontBuffers: FONTS, loadSystemFonts: false, defaultFontFamily: 'Plus Jakarta Sans' },
    });
    const png = resvg.render().asPng();
    resvg.free();
    return Buffer.from(png);
}
