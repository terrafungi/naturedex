import { useEffect, useId, useState } from 'react';
import { api } from '../api.jsx';

// The drawn character. Prices and ownership come from the API (functions/api/avatar.mjs);
// only the drawings live here, keyed by the same ids.
export const SKINS = ['#ffe0c7', '#f6c9a0', '#e3a878', '#c98d5c', '#9c6440', '#6b4128'];
export const HAIR_COLORS = ['#2b1d16', '#5a3a22', '#8b5a2b', '#c98a3d', '#e8c770', '#b8452c', '#d9d4cc', '#4f7cc9'];
export const BGS = ['#2f6b4f', '#3a6f8f', '#8a5a9c', '#b5704a', '#5d7a3a', '#384152'];
export const HAIRS = { court: 'Court', meche: 'Mèche', boucles: 'Boucles', long: 'Long', chignon: 'Chignon', tresses: 'Tresses', rase: 'Ras' };
export const SLOT_NAMES = { shirt: 'T-shirts', hat: 'Chapeaux', face: 'Visage', neck: 'Cou', pet: 'Compagnons' };

const SHIRTS = {
    foret: { base: '#2e7d4f' },
    ciel: { base: '#4a90c8' },
    terre: { base: '#c0643b' },
    feuille: { base: '#3f9a63', motif: 'leaf', ink: '#d9f5c4' },
    rayures: { base: '#f3efe6', motif: 'stripes', ink: '#2b3f6b' },
    sapin: { base: '#1f5138', motif: 'tree', ink: '#7fd39a' },
    champignon: { base: '#c8352c', motif: 'dots', ink: '#fff7ee' },
    carreaux: { base: '#b8322e', motif: 'plaid', ink: '#2a1414' },
    abeille: { base: '#f2c230', motif: 'bee', ink: '#2a2118' },
    salopette: { base: '#f3efe6', motif: 'overalls', ink: '#3c6aa8' },
    coccinelle: { base: '#d8322b', motif: 'ladybug', ink: '#1d1d1d' },
    tournesol: { base: '#2f7a4a', motif: 'sunflower', ink: '#ffd23f' },
    ocean: { base: '#1d6fa5', motif: 'waves', ink: '#9fe0ff' },
    papillon: { base: '#a98ad8', motif: 'butterfly', ink: '#ffd36e' },
    flocons: { base: '#b8323a', motif: 'snow', ink: '#ffffff' },
    camouflage: { base: '#5b6b3a', motif: 'camo', ink: '#3b4626' },
    nuit: { base: '#1b2350', motif: 'stars', ink: '#fff3b0' },
    arcenciel: { gradient: ['#e94b4b', '#f2a53a', '#f2d64b', '#4fc16b', '#4a90e2', '#8a5ad8'] },
    aurore: { gradient: ['#1fae7a', '#2fb6c4', '#7b5cd6'], motif: 'aurora', ink: '#e8fff6' },
    legende: { gradient: ['#f7d774', '#d9a531', '#a8741a'], motif: 'star', ink: '#fffbe6' },
    mecene: { base: '#173d2b', motif: 'patron', ink: '#e9c46a' },
};

const hash = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Players who never opened the editor still get a character, always the same for a pseudo.
export function defaultAvatar(name) {
    const h = hash(name);
    const hairs = Object.keys(HAIRS);
    return {
        skin: h % SKINS.length, hair: hairs[(h >> 3) % hairs.length], hairColor: (h >> 6) % 6, bg: (h >> 9) % BGS.length,
        shirt: ['foret', 'ciel', 'terre', 'feuille'][(h >> 12) % 4], hat: 'aucun', face: 'aucun', neck: 'aucun', pet: 'aucun',
    };
}

// Avatars cached from before the slots had a single "acc" field.
const LEGACY_ACC = { lunettes: 'face', jumelles: 'neck', casquette: 'hat', explorateur: 'hat', bandana: 'hat', fleur: 'hat' };
const upgrade = (a) => (a && 'acc' in a ? { ...a, [LEGACY_ACC[a.acc] || 'hat']: LEGACY_ACC[a.acc] ? a.acc : 'aucun' } : a);

const TORSO = 'M12 104 C12 82 27 73 50 73 C73 73 88 82 88 104 Z';
const heart = (x, y, s = 1) => `M${x} ${y + 4 * s} C${x - 7 * s} ${y - s} ${x - 4 * s} ${y - 6 * s} ${x} ${y - 2.5 * s} C${x + 4 * s} ${y - 6 * s} ${x + 7 * s} ${y - s} ${x} ${y + 4 * s} Z`;
const dots = (list, fill) => <g fill={fill}>{list.map(([x, y, r]) => <circle key={`${x},${y}`} cx={x} cy={y} r={r} />)}</g>;
const flower = (x, y, petal, r = 2.2) => (
    <g key={`${x},${y}`}>{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={x} cy={y - r} rx={r * 0.6} ry={r} fill={petal} transform={`rotate(${a} ${x} ${y})`} />)}<circle cx={x} cy={y} r={r * 0.55} fill="#ffd36e" /></g>
);
const eye = (x, y, r = 1.2) => <g key={`${x},${y}`}><circle cx={x} cy={y} r={r} fill="#1d1410" /><circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" /></g>;

function Motif({ kind, ink }) {
    switch (kind) {
        case 'leaf':
            return <path d="M50 96 C40 92 40 82 50 79 C60 82 60 92 50 96 Z M50 96 L50 81" fill={ink} stroke="#2e7d4f" strokeWidth="0.8" />;
        case 'stripes':
            return [80, 86, 92, 98].map((y) => <rect key={y} x="0" y={y} width="100" height="2.6" fill={ink} />);
        case 'tree':
            return <g fill={ink}><path d="M50 78 L58 89 L42 89 Z" /><path d="M50 83 L60 96 L40 96 Z" /><rect x="48.5" y="96" width="3" height="4" fill="#8b5a2b" /></g>;
        case 'dots':
            return dots([[30, 86, 3], [44, 81, 2.2], [57, 88, 3.4], [70, 82, 2.4], [38, 96, 2.6], [66, 97, 2.8], [52, 98, 1.8]], ink);
        case 'plaid':
            return <g fill={ink} opacity="0.35">{[22, 38, 54, 70].map((x) => <rect key={x} x={x} y="70" width="5" height="34" />)}{[80, 92].map((y) => <rect key={y} x="0" y={y} width="100" height="4" />)}</g>;
        case 'bee':
            return <g fill={ink}>{[83, 92, 101].map((y) => <rect key={y} x="0" y={y} width="100" height="4" />)}</g>;
        case 'overalls':
            return <g fill={ink}><rect x="38" y="84" width="24" height="20" rx="2" /><path d="M30 76 L38 86 L41 85 L34 75 Z M70 76 L62 86 L59 85 L66 75 Z" /><circle cx="40" cy="86.5" r="1.3" fill="#f2c230" /><circle cx="60" cy="86.5" r="1.3" fill="#f2c230" /><rect x="45" y="90" width="10" height="6" rx="1" fill="#2f5688" /></g>;
        case 'ladybug':
            return <g fill={ink}><rect x="49.2" y="73" width="1.6" height="31" />{dots([[36, 84, 3], [64, 84, 3], [30, 96, 2.6], [70, 96, 2.6], [42, 95, 2.2], [58, 95, 2.2]], ink)}</g>;
        case 'sunflower':
            return <g>{[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => <ellipse key={a} cx="50" cy="83" rx="2.2" ry="5" fill={ink} transform={`rotate(${a} 50 89)`} />)}<circle cx="50" cy="89" r="4.2" fill="#6b3f1d" /></g>;
        case 'waves':
            return <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round">{[84, 92].map((y) => <path key={y} d={`M14 ${y} q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0`} />)}</g>;
        case 'butterfly':
            return <g fill={ink}><ellipse cx="45" cy="85" rx="5" ry="6" transform="rotate(-20 45 85)" /><ellipse cx="55" cy="85" rx="5" ry="6" transform="rotate(20 55 85)" /><ellipse cx="46" cy="93" rx="3.5" ry="4" /><ellipse cx="54" cy="93" rx="3.5" ry="4" /><rect x="49.2" y="82" width="1.6" height="14" rx="0.8" fill="#3a2a5a" /></g>;
        case 'snow':
            return <g><rect x="0" y="88" width="100" height="5" fill={ink} opacity="0.9" />{[[30, 81], [50, 80], [70, 81], [38, 98], [62, 98]].map(([x, y]) => (
                <path key={`${x}${y}`} d={`M${x - 3} ${y} H${x + 3} M${x} ${y - 3} V${y + 3} M${x - 2} ${y - 2} L${x + 2} ${y + 2} M${x + 2} ${y - 2} L${x - 2} ${y + 2}`} stroke={ink} strokeWidth="0.9" />))}
                {[22, 34, 46, 58, 70, 82].map((x) => <path key={x} d={`M${x} 90.5 l3 -1.8 l3 1.8 l-3 1.8 Z`} fill="#b8323a" />)}</g>;
        case 'camo':
            return <g><path d="M18 86 C24 80 32 84 30 90 C26 95 18 93 18 86 Z M44 78 C52 75 58 80 54 85 C48 88 40 84 44 78 Z M62 90 C68 84 78 88 76 95 C70 100 60 97 62 90 Z M34 98 C40 95 48 99 44 103 L32 104 Z" fill={ink} /><path d="M26 78 C30 76 34 79 31 82 C28 83 25 81 26 78 Z M60 80 C64 78 70 80 67 84 C63 85 59 83 60 80 Z M48 92 C52 90 56 93 53 96 C50 97 46 95 48 92 Z" fill="#8a8a5a" /></g>;
        case 'stars':
            return <g fill={ink}><path d="M60 80 a6 6 0 1 0 5 9 a5 5 0 1 1 -5 -9 Z" />{[[30, 84], [40, 92], [36, 80], [72, 94], [50, 98], [24, 96]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />)}</g>;
        case 'aurora':
            return <path d="M14 90 C28 80 40 92 52 84 C64 76 74 88 86 82" fill="none" stroke={ink} strokeWidth="1.6" opacity="0.7" />;
        case 'star':
            return <path d="M50 79 L52.6 85.2 L59.2 85.6 L54.1 89.8 L55.8 96.2 L50 92.6 L44.2 96.2 L45.9 89.8 L40.8 85.6 L47.4 85.2 Z" fill={ink} stroke="#a8741a" strokeWidth="0.6" />;
        case 'patron':
            return <g><path d="M50 97 C39 92 40 81 52 78 C60 85 59 93 50 97 Z M50 97 C51 90 52 85 52 78" fill={ink} stroke="#173d2b" strokeWidth="0.7" /><path d="M38 73.5 Q50 82 62 73.5" fill="none" stroke={ink} strokeWidth="1.6" /></g>;
        default:
            return null;
    }
}

function BackHair({ hair, color }) {
    if (hair === 'long') return <path d="M31 46 C29 24 42 19 50 19 C58 19 71 24 69 46 L71 70 C64 74 59 71 57 69 L43 69 C41 71 36 74 29 70 Z" fill={color} />;
    if (hair === 'tresses') return <g fill={color}>{[33, 67].map((x) => [56, 63, 70].map((y) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="3.6" ry="4.2" />))}</g>;
    if (hair === 'chignon') return <circle cx="50" cy="20" r="8" fill={color} />;
    return null;
}

function FrontHair({ hair, color }) {
    switch (hair) {
        case 'meche':
            return <path d="M32 47 C29 27 44 20 52 21 C64 22 71 31 68 47 C67 39 63 34 58 32 C51 39 40 39 32 47 Z" fill={color} />;
        case 'boucles':
            return <g fill={color}>{[[36, 36, 7], [42, 29, 7], [50, 26, 8], [58, 29, 7], [64, 36, 7], [33, 44, 5], [67, 44, 5]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}</g>;
        case 'rase':
            return <path d="M33 42 C33 28 42 24 50 24 C58 24 67 28 67 42 C63 35 57 32 50 32 C43 32 37 35 33 42 Z" fill={color} opacity="0.45" />;
        default: // court, long, chignon, tresses share the same fringe
            return <path d="M32 45 C31 28 41 21 50 21 C59 21 69 28 68 45 C65 36 58 32 50 33 C42 32 35 36 32 45 Z" fill={color} />;
    }
}

function Hat({ id }) {
    switch (id) {
        case 'casquette':
            return <g><path d="M31 39 C31 22 69 22 69 39 Z" fill="#d9483b" /><path d="M48 38 L78 38 C80 38 80 42 77 42 L48 42 Z" fill="#a8322a" /><circle cx="50" cy="25" r="1.6" fill="#a8322a" /></g>;
        case 'explorateur':
            return <g><ellipse cx="50" cy="33" rx="29" ry="6" fill="#b89a62" /><path d="M35 33 C35 17 65 17 65 33 Z" fill="#cdb07a" /><rect x="35" y="28.5" width="30" height="3.4" fill="#6b5130" /></g>;
        case 'bandana':
            return <g fill="#d9483b"><path d="M32 37 Q50 28 68 37 L68 42 Q50 33 32 42 Z" /><path d="M67 38 L76 34 L74 41 Z" /><circle cx="44" cy="35" r="0.9" fill="#fff" /><circle cx="56" cy="35" r="0.9" fill="#fff" /></g>;
        case 'fleur':
            return flower(64, 31, '#ff8fb1', 4);
        case 'bonnet':
            return <g><path d="M31 40 C31 17 69 17 69 40 Z" fill="#3a7bd5" />{[38, 44, 50, 56, 62].map((x) => <path key={x} d={`M${x} 22 V36`} stroke="#2a5ea8" strokeWidth="1.2" />)}<rect x="30" y="35" width="40" height="7" rx="3" fill="#2a5ea8" /><circle cx="50" cy="16" r="5" fill="#f3efe6" /></g>;
        case 'paille':
            return <g><ellipse cx="50" cy="33" rx="32" ry="6.5" fill="#e9cf7a" stroke="#c9a94a" strokeWidth="0.8" /><path d="M36 33 C36 16 64 16 64 33 Z" fill="#f2db8a" /><rect x="36" y="27.5" width="28" height="4" fill="#d9483b" /></g>;
        case 'beret':
            return <g><ellipse cx="46" cy="29" rx="21" ry="8" fill="#2b2b3a" transform="rotate(-8 46 29)" /><rect x="45" y="18" width="2.4" height="4" rx="1" fill="#2b2b3a" /></g>;
        case 'bob':
            return <g><path d="M34 35 C34 19 66 19 66 35 Z" fill="#e0c84a" /><path d="M27 38 Q50 29 73 38 L70 43 Q50 35 30 43 Z" fill="#c9b03a" />{dots([[42, 27, 1.2], [50, 24, 1.2], [58, 27, 1.2]], '#f2711c')}</g>;
        case 'couronne_fleurs':
            return <g><path d="M33 36 Q50 22 67 36" fill="none" stroke="#4caf6a" strokeWidth="2" />{[[34, 35, '#ff8fb1'], [40, 29, '#fff3b0'], [47, 26, '#9fc7ff'], [54, 26, '#ff8fb1'], [61, 29, '#fff3b0'], [67, 35, '#c7a4ff']].map(([x, y, c]) => flower(x, y, c, 2.6))}</g>;
        case 'champi':
            return <g><path d="M24 37 C24 8 76 8 76 37 Q50 31 24 37 Z" fill="#d8322b" />{dots([[36, 24, 3], [50, 17, 3.4], [64, 24, 3], [43, 31, 2], [58, 31, 2]], '#fff7ee')}</g>;
        case 'renard':
            return <g><path d="M33 33 L35 10 L48 25 Z M67 33 L65 10 L52 25 Z" fill="#e07a2f" /><path d="M36 28 L37 16 L44 25 Z M64 28 L63 16 L56 25 Z" fill="#ffe0c0" /></g>;
        case 'sorcier':
            return <g><path d="M33 34 L56 0 L67 34 Z" fill="#4b2d7a" /><ellipse cx="50" cy="34" rx="26" ry="5.5" fill="#3a2260" /><rect x="34" y="28" width="32" height="4" fill="#f2c230" /><path d="M54 12 L55.2 15 L58.4 15.2 L55.9 17.2 L56.8 20.4 L54 18.6 L51.2 20.4 L52.1 17.2 L49.6 15.2 L52.8 15 Z" fill="#f2c230" /></g>;
        case 'couronne':
            return <g><path d="M35 31 L34 14 L42 22 L50 11 L58 22 L66 14 L65 31 Z" fill="#f2c230" stroke="#a8741a" strokeWidth="1" />{dots([[50, 25, 2.2], [41, 27, 1.6], [59, 27, 1.6]], '#d8322b')}<circle cx="50" cy="11" r="1.6" fill="#4fc1e9" /></g>;
        case 'lauriers':
            return <g fill="#e9c46a" stroke="#a8741a" strokeWidth="0.4">{[[33, 37, -60], [35, 31, -40], [39, 26, -20], [44, 23, -5], [67, 37, 60], [65, 31, 40], [61, 26, 20], [56, 23, 5]].map(([x, y, r]) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="2.4" ry="4.4" transform={`rotate(${r} ${x} ${y})`} />)}<circle cx="50" cy="22" r="1.8" /></g>;
        default:
            return null;
    }
}

function Face({ id, hairColor }) {
    switch (id) {
        case 'lunettes':
            return <g fill="none" stroke="#1d1d1d" strokeWidth="1.4"><circle cx="43" cy="47" r="4.6" fill="#ffffff22" /><circle cx="57" cy="47" r="4.6" fill="#ffffff22" /><path d="M47.6 47 L52.4 47 M38.4 46 L34 44.5 M61.6 46 L66 44.5" /></g>;
        case 'rousseur':
            return <g opacity="0.55">{dots([[37, 52, 0.7], [39.5, 53.5, 0.7], [41, 51.5, 0.6], [63, 52, 0.7], [60.5, 53.5, 0.7], [59, 51.5, 0.6]], '#a35a35')}</g>;
        case 'soleil':
            return <g><rect x="36.5" y="43" width="12" height="8.5" rx="3.5" fill="#1d1d1d" /><rect x="51.5" y="43" width="12" height="8.5" rx="3.5" fill="#1d1d1d" /><path d="M48.5 45.5 H51.5 M36.5 45.5 L33 44 M63.5 45.5 L67 44" stroke="#1d1d1d" strokeWidth="1.4" /><path d="M39 45 L42 45" stroke="#ffffff66" strokeWidth="1" /></g>;
        case 'moustache':
            return <path d="M41 54.5 C43 50.5 47 51 50 53 C53 51 57 50.5 59 54.5 C56 53 53 54.5 50 54.5 C47 54.5 44 53 41 54.5 Z" fill={hairColor} />;
        case 'rondes':
            return <g fill="none" stroke="#d9a531" strokeWidth="1.3"><circle cx="43" cy="47.5" r="5" fill="#fff6d622" /><circle cx="57" cy="47.5" r="5" fill="#fff6d622" /><path d="M48 46.5 Q50 45 52 46.5 M38 47 L34 45 M62 47 L66 45" /></g>;
        case 'monocle':
            return <g fill="none" stroke="#d9a531" strokeWidth="1.3"><circle cx="57" cy="48" r="5" fill="#ffffff22" /><path d="M61 51.5 Q66 58 64 66" strokeWidth="0.7" /></g>;
        case 'peinture':
            return <g fill="#4caf6a">{[[37, 53, -30], [63, 53, 30]].map(([x, y, r]) => <path key={x} d={`M${x} ${y + 3} C${x - 3} ${y + 1} ${x - 2} ${y - 3} ${x} ${y - 4} C${x + 2} ${y - 3} ${x + 3} ${y + 1} ${x} ${y + 3} Z`} transform={`rotate(${r} ${x} ${y})`} />)}<path d="M47 38 L50 35 L53 38" fill="none" stroke="#4caf6a" strokeWidth="1.4" /></g>;
        case 'plongee':
            return <g><path d="M33 47 H67" stroke="#2a2a2a" strokeWidth="2" /><rect x="35" y="40.5" width="30" height="13.5" rx="6" fill="#7fd3f0" fillOpacity="0.5" stroke="#f2711c" strokeWidth="2.2" /><path d="M69 52 L71 52 L71 22 Q71 19 74 19" fill="none" stroke="#f2c230" strokeWidth="2.6" strokeLinecap="round" /></g>;
        case 'coeurs':
            return <g><path d={heart(43, 47.5, 1.15)} fill="#e84a6f" /><path d={heart(57, 47.5, 1.15)} fill="#e84a6f" /><path d="M48.5 46.5 H51.5 M36 46 L33 44.5 M64 46 L67 44.5" stroke="#b8264a" strokeWidth="1.2" /></g>;
        default:
            return null;
    }
}

function Neck({ id }) {
    switch (id) {
        case 'jumelles':
            return <g><path d="M43 73 L44 84 M57 73 L56 84" stroke="#3b2a1a" strokeWidth="1.2" fill="none" /><rect x="38.5" y="83" width="9" height="11" rx="3" fill="#2a2a2a" /><rect x="52.5" y="83" width="9" height="11" rx="3" fill="#2a2a2a" /><rect x="46.5" y="86" width="7" height="3" fill="#444" /><circle cx="43" cy="92" r="2.4" fill="#7fb7d9" /><circle cx="57" cy="92" r="2.4" fill="#7fb7d9" /></g>;
        case 'foulard':
            return <g fill="#e8b84a"><path d="M39 71 Q50 77 61 71 L50 86 Z" /><circle cx="50" cy="75" r="2.2" fill="#c9952a" /></g>;
        case 'noeud':
            return <g fill="#c0392b"><path d="M50 77 L41 72.5 L41 81.5 Z M50 77 L59 72.5 L59 81.5 Z" /><circle cx="50" cy="77" r="2.2" fill="#8e2a20" /></g>;
        case 'echarpe':
            return <g><path d="M37 68 Q50 77 63 68 L64 75 Q50 83 36 75 Z" fill="#e05a47" /><rect x="54" y="75" width="7" height="18" rx="1.5" fill="#e05a47" /><path d="M54 82 H61 M54 87 H61" stroke="#f3efe6" strokeWidth="1.6" /><path d="M38 71 Q50 79 62 71" fill="none" stroke="#f3efe6" strokeWidth="1.2" /></g>;
        case 'loupe':
            return <g><path d="M45 74 L40 85" stroke="#3b2a1a" strokeWidth="0.9" /><path d="M42 95 L46 101" stroke="#8b5a2b" strokeWidth="2.6" strokeLinecap="round" /><circle cx="38" cy="90" r="5.5" fill="#bfe6ff" fillOpacity="0.6" stroke="#8b5a2b" strokeWidth="1.6" /></g>;
        case 'appareil':
            return <g><path d="M42 73 L42 83 M58 73 L58 83" stroke="#3b2a1a" strokeWidth="1.2" /><rect x="39" y="82" width="22" height="14" rx="2.5" fill="#2a2a2a" /><rect x="42" y="80" width="6" height="3" rx="1" fill="#2a2a2a" /><circle cx="50" cy="89" r="5" fill="#555" /><circle cx="50" cy="89" r="3" fill="#7fb7d9" /><circle cx="57.5" cy="85" r="1" fill="#f2c230" /></g>;
        case 'coquillages':
            return <g><path d="M38 72 Q50 82 62 72" fill="none" stroke="#8b5a2b" strokeWidth="0.7" />{[[41, 76.5, '#ffd9c7'], [45.5, 78.7, '#fff3e0'], [50, 79.5, '#ffb3a7'], [54.5, 78.7, '#fff3e0'], [59, 76.5, '#ffd9c7']].map(([x, y, c]) => <path key={x} d={`M${x - 2} ${y} Q${x} ${y - 2.8} ${x + 2} ${y} Q${x} ${y + 2.4} ${x - 2} ${y} Z`} fill={c} stroke="#c98a6a" strokeWidth="0.4" />)}</g>;
        case 'medaille':
            return <g><path d="M44 72 L48 86 L52 86 L56 72" fill="#3a6fd8" /><path d="M50 72 L48 86 L52 86 Z" fill="#d8322b" /><circle cx="50" cy="90" r="6" fill="#f2c230" stroke="#a8741a" strokeWidth="1" /><path d="M50 86.5 L51.1 89 L53.7 89.2 L51.7 90.9 L52.3 93.4 L50 92 L47.7 93.4 L48.3 90.9 L46.3 89.2 L48.9 89 Z" fill="#fff6d6" /></g>;
        default:
            return null;
    }
}

// The companion sits on the shoulder; drawn around (0, 0), about 22 units wide.
function Pet({ id }) {
    switch (id) {
        case 'coccinelle':
            return <g><circle cx="-5" cy="0" r="3" fill="#1d1d1d" /><ellipse cx="1" cy="1" rx="6.5" ry="5.5" fill="#d8322b" stroke="#1d1d1d" strokeWidth="0.6" /><path d="M-2 1 H7.5" stroke="#1d1d1d" strokeWidth="0.7" />{dots([[1, -2, 1.1], [4, -1.5, 0.9], [1, 4, 1.1], [4.5, 3.5, 0.9]], '#1d1d1d')}{eye(-6, -0.5, 0.6)}</g>;
        case 'escargot':
            return <g><path d="M-11 8 C-11 2 -8 0 -7 -3 L-6 -9 M-8 -3 L-10 -8" stroke="#a6c46a" strokeWidth="1" fill="none" /><path d="M-12 8 C-12 3 -9 1 -7 3 L10 6 C11 8 10 9 8 9 L-10 9 Z" fill="#bfd88a" /><circle cx="2" cy="0" r="7.5" fill="#c98a3d" stroke="#8b5a2b" strokeWidth="0.8" /><path d="M2 0 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a3 3 0 0 1 3 -3 a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="#8b5a2b" strokeWidth="1" />{eye(-6, -8, 0.8)}{eye(-10, -8, 0.8)}</g>;
        case 'grenouille':
            return <g><ellipse cx="0" cy="4" rx="10" ry="7" fill="#5cb85c" /><ellipse cx="0" cy="6" rx="6" ry="4" fill="#a6e08a" /><circle cx="-4.5" cy="-3" r="3.6" fill="#5cb85c" /><circle cx="4.5" cy="-3" r="3.6" fill="#5cb85c" /><circle cx="-4.5" cy="-3.2" r="2.3" fill="#fff" /><circle cx="4.5" cy="-3.2" r="2.3" fill="#fff" />{eye(-4.5, -3, 1.2)}{eye(4.5, -3, 1.2)}<path d="M-4 2 Q0 4.5 4 2" fill="none" stroke="#2f6b2f" strokeWidth="0.8" /></g>;
        case 'tortue':
            return <g><ellipse cx="9.5" cy="3" rx="3.6" ry="3" fill="#9ccf6a" />{eye(10.5, 2, 0.7)}<ellipse cx="-6" cy="8" rx="2.5" ry="1.6" fill="#9ccf6a" /><ellipse cx="5" cy="8" rx="2.5" ry="1.6" fill="#9ccf6a" /><path d="M-10 7 C-10 -7 8 -7 8 7 Z" fill="#5d8a3a" stroke="#3f6526" strokeWidth="0.8" /><path d="M-5 6 L-3 0 L3 0 L4 6 M-3 0 L-5 -3 M3 0 L2 -4" fill="none" stroke="#3f6526" strokeWidth="0.8" /></g>;
        case 'herisson':
            return <g><path d="M-9 8 L-12 3 L-9 1 L-12 -3 L-7 -3 L-8 -8 L-3 -6 L-1 -10 L2 -6 L6 -8 L6 -3 L9 -2 L8 8 Z" fill="#6b4a2e" /><path d="M2 8 C2 0 7 -2 9 0 L13 4 C13 7 10 8 8 8 Z" fill="#e8c9a0" /><circle cx="13" cy="4" r="1.2" fill="#1d1410" />{eye(8, 2, 0.9)}</g>;
        case 'lapin':
            return <g><ellipse cx="-3" cy="-12" rx="2.3" ry="6.5" fill="#f2ede4" /><ellipse cx="3" cy="-12" rx="2.3" ry="6.5" fill="#f2ede4" /><ellipse cx="-3" cy="-12" rx="1" ry="4.5" fill="#f5b5c4" /><ellipse cx="3" cy="-12" rx="1" ry="4.5" fill="#f5b5c4" /><ellipse cx="0" cy="6" rx="8.5" ry="6.5" fill="#f2ede4" /><circle cx="0" cy="-2" r="6.5" fill="#f2ede4" />{eye(-2.5, -2.5, 1)}{eye(2.5, -2.5, 1)}<circle cx="0" cy="0.5" r="0.9" fill="#f08aa0" /></g>;
        case 'chat':
            return <g><ellipse cx="0" cy="8" rx="8" ry="5" fill="#e59a4a" /><path d="M-8 -2 L-7 -11 L-2 -6 Z M8 -2 L7 -11 L2 -6 Z" fill="#e59a4a" /><circle cx="0" cy="0" r="8" fill="#e59a4a" /><path d="M-2 -7.5 V-5 M0 -8 V-5 M2 -7.5 V-5" stroke="#b86b25" strokeWidth="0.9" /><ellipse cx="-3" cy="0" rx="1.1" ry="1.6" fill="#2f6b2f" /><ellipse cx="3" cy="0" rx="1.1" ry="1.6" fill="#2f6b2f" /><path d="M-1 3 L1 3 L0 4 Z" fill="#f08aa0" /><path d="M-3 4 L-9 3 M-3 5 L-9 6 M3 4 L9 3 M3 5 L9 6" stroke="#fff" strokeWidth="0.4" /></g>;
        case 'ecureuil':
            return <g><path d="M3 10 C14 10 15 -4 10 -9 C7 -12 2 -10 5 -6 C9 -2 8 4 3 4 Z" fill="#c9752a" /><ellipse cx="-2" cy="6" rx="6" ry="5.5" fill="#b5651d" /><ellipse cx="-2" cy="7" rx="3.5" ry="3.5" fill="#f2d6a8" /><circle cx="-3" cy="-3" r="5.5" fill="#b5651d" /><path d="M-6 -7 L-6 -11 L-3 -8 Z" fill="#b5651d" />{eye(-5, -3.5, 1)}<circle cx="-8.2" cy="-1.8" r="0.8" fill="#1d1410" /><ellipse cx="-6" cy="4" rx="2" ry="2.4" fill="#8b5a2b" /><rect x="-7.3" y="1.2" width="2.6" height="1.2" rx="0.6" fill="#5a3a1a" /></g>;
        case 'chouette':
            return <g><path d="M-7 -8 L-5 -12 L-3 -8 Z M7 -8 L5 -12 L3 -8 Z" fill="#8b6a4a" /><ellipse cx="0" cy="1" rx="8.5" ry="10.5" fill="#8b6a4a" /><ellipse cx="0" cy="5" rx="5.5" ry="5.5" fill="#d9c09a" /><circle cx="-3.4" cy="-3" r="3.4" fill="#fff" /><circle cx="3.4" cy="-3" r="3.4" fill="#fff" /><circle cx="-3.4" cy="-3" r="1.9" fill="#f2a53a" /><circle cx="3.4" cy="-3" r="1.9" fill="#f2a53a" />{eye(-3.4, -3, 1)}{eye(3.4, -3, 1)}<path d="M-1 0 L1 0 L0 2.5 Z" fill="#f2a53a" /><path d="M-3 4 l1 1 l1 -1 M1 6 l1 1 l1 -1" fill="none" stroke="#8b6a4a" strokeWidth="0.6" /></g>;
        case 'renard':
            return <g><path d="M4 10 C14 12 16 2 12 -2 C11 4 8 6 4 6 Z" fill="#e07a2f" /><path d="M12 -2 C13 0 13.5 2 13 3.5 C12 2 11.5 0 12 -2 Z" fill="#fff" /><ellipse cx="0" cy="7" rx="7" ry="5" fill="#e07a2f" /><path d="M-9 -9 L-6 -1 L-2 -6 Z M9 -9 L6 -1 L2 -6 Z" fill="#e07a2f" /><path d="M-8 -7 L-6 -3 L-4 -5.5 Z M8 -7 L6 -3 L4 -5.5 Z" fill="#3b2a1a" /><path d="M-8 -3 C-8 -8 8 -8 8 -3 C8 2 3 5 0 6 C-3 5 -8 2 -8 -3 Z" fill="#e07a2f" /><path d="M-8 -1 C-5 1 -2 3 0 6 C2 3 5 1 8 -1 C6 4 3 6 0 6.5 C-3 6 -6 4 -8 -1 Z" fill="#fff" />{eye(-3, -2.5, 1)}{eye(3, -2.5, 1)}<circle cx="0" cy="5.5" r="1" fill="#1d1410" /></g>;
        case 'panda':
            return <g><path d="M4 10 C14 12 15 2 11 -1 C11 4 8 7 4 7 Z" fill="#c8552a" /><path d="M13 3 L9 4 M13.5 6.5 L9 7" stroke="#7a3315" strokeWidth="1.2" /><ellipse cx="0" cy="7" rx="7" ry="5" fill="#5a2a18" /><circle cx="-6.5" cy="-7" r="3" fill="#c8552a" /><circle cx="6.5" cy="-7" r="3" fill="#c8552a" /><circle cx="-6.5" cy="-7" r="1.5" fill="#fff" /><circle cx="6.5" cy="-7" r="1.5" fill="#fff" /><ellipse cx="0" cy="-1" rx="8.5" ry="7.5" fill="#c8552a" /><path d="M-6 -4 C-5 -6 -3 -6 -2.5 -4 M6 -4 C5 -6 3 -6 2.5 -4" stroke="#fff" strokeWidth="1.2" fill="none" /><ellipse cx="0" cy="3" rx="4" ry="3" fill="#fff" /><path d="M-5 0 L-3 3 M5 0 L3 3" stroke="#7a3315" strokeWidth="1.1" />{eye(-3, -1, 1)}{eye(3, -1, 1)}<ellipse cx="0" cy="2" rx="1.2" ry="0.8" fill="#1d1410" /></g>;
        case 'dragon':
            return <g><path d="M-2 -1 L-12 -9 L-10 -2 L-13 1 Z M2 -1 L12 -9 L10 -2 L13 1 Z" fill="#9b6bd8" /><path d="M5 9 C12 11 13 6 11 4 L13 3 L11 2" fill="none" stroke="#3faa6a" strokeWidth="2" strokeLinecap="round" /><ellipse cx="0" cy="6" rx="6.5" ry="5.5" fill="#3faa6a" /><ellipse cx="0" cy="7" rx="3.6" ry="3.6" fill="#f2d66b" /><path d="M-4 -9 L-5 -13 L-2 -10 Z M4 -9 L5 -13 L2 -10 Z" fill="#f2d66b" /><ellipse cx="0" cy="-4" rx="7" ry="6" fill="#3faa6a" />{eye(-2.8, -5, 1.2)}{eye(2.8, -5, 1.2)}<circle cx="-1.3" cy="-1" r="0.5" fill="#1d4a2a" /><circle cx="1.3" cy="-1" r="0.5" fill="#1d4a2a" /><path d="M-2 0.5 Q0 1.8 2 0.5" fill="none" stroke="#1d4a2a" strokeWidth="0.6" /></g>;
        case 'faon':
            return <g><ellipse cx="0" cy="7" rx="8" ry="5" fill="#c98a5a" />{dots([[-3, 6, 0.9], [1, 5, 0.9], [4, 7.5, 0.9], [-1, 9, 0.8]], '#fff6e6')}<ellipse cx="-7" cy="-6" rx="2" ry="4" fill="#c98a5a" transform="rotate(-50 -7 -6)" /><ellipse cx="7" cy="-6" rx="2" ry="4" fill="#c98a5a" transform="rotate(50 7 -6)" /><path d="M-6 -4 C-6 -10 6 -10 6 -4 C6 1 3 4 0 4.5 C-3 4 -6 1 -6 -4 Z" fill="#c98a5a" /><ellipse cx="0" cy="2" rx="3" ry="2.4" fill="#f2dcc0" />{eye(-2.6, -3.5, 1.1)}{eye(2.6, -3.5, 1.1)}<ellipse cx="0" cy="1.3" rx="1.1" ry="0.8" fill="#3b2a1a" /><circle cx="0" cy="-7.5" r="2.2" fill="#e9c46a" opacity="0.9" /></g>;
        default:
            return null;
    }
}

export function AvatarFigure({ avatar, size = 40, className = '', ring }) {
    const uid = useId().replace(/:/g, '');
    const a = upgrade(avatar) || defaultAvatar('');
    const skin = SKINS[a.skin] || SKINS[0];
    const hairColor = HAIR_COLORS[a.hairColor] || HAIR_COLORS[0];
    const shirt = SHIRTS[a.shirt] || SHIRTS.foret;
    const fill = shirt.gradient ? `url(#g${uid})` : shirt.base;
    const v = `url(#v${uid})`;
    return (
        <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 rounded-full ${className}`}
            style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined} role="img" aria-label="Avatar">
            <defs>
                <clipPath id={`c${uid}`}><circle cx="50" cy="50" r="50" /></clipPath>
                <clipPath id={`t${uid}`}><path d={TORSO} /></clipPath>
                {/* Clay-like volume: a soft highlight from the top left, a shade along the bottom right, and a
                    small drop shadow so each layer (hat, pet, scarf…) stands out from the one beneath. */}
                <filter id={`v${uid}`} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1.8" result="blur" />
                    <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.6" specularExponent="14" lightingColor="#ffffff" result="spec">
                        <feDistantLight azimuth="225" elevation="48" />
                    </feSpecularLighting>
                    <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine" />
                    <feOffset in="blur" dx="-1.8" dy="-2.2" result="moved" />
                    <feComposite in="SourceAlpha" in2="moved" operator="out" result="rim" />
                    <feGaussianBlur in="rim" stdDeviation="1.1" result="rimSoft" />
                    <feFlood floodColor="#000000" floodOpacity="0.32" />
                    <feComposite in2="rimSoft" operator="in" />
                    <feComposite in2="SourceAlpha" operator="in" result="shade" />
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" />
                    <feOffset dy="1.4" />
                    <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
                    <feMerge result="drop"><feMergeNode /></feMerge>
                    <feMerge><feMergeNode in="drop" /><feMergeNode in="SourceGraphic" /><feMergeNode in="shade" /><feMergeNode in="shine" /></feMerge>
                </filter>
                <radialGradient id={`b${uid}`} cx="0.4" cy="0.32" r="0.8">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
                    <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
                </radialGradient>
                {shirt.gradient && (
                    <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
                        {shirt.gradient.map((c, i) => <stop key={c} offset={i / (shirt.gradient.length - 1)} stopColor={c} />)}
                    </linearGradient>
                )}
            </defs>
            <g clipPath={`url(#c${uid})`}>
                <rect width="100" height="100" fill={BGS[a.bg] || BGS[0]} />
                <rect width="100" height="100" fill={`url(#b${uid})`} />
                <g filter={v}><BackHair hair={a.hair} color={hairColor} /></g>
                <g filter={v}>
                    <rect x="43" y="58" width="14" height="18" rx="5" fill={skin} />
                    <path d={TORSO} fill={fill} />
                    <g clipPath={`url(#t${uid})`}><Motif kind={shirt.motif} ink={shirt.ink} /></g>
                    <path d="M41 73.5 Q50 81 59 73.5" fill="none" stroke="#00000033" strokeWidth="1.6" />
                </g>
                <g filter={v}><Neck id={a.neck} /></g>
                <g filter={v}>
                    <circle cx="33" cy="48" r="4" fill={skin} />
                    <circle cx="67" cy="48" r="4" fill={skin} />
                    <ellipse cx="50" cy="46" rx="17" ry="19" fill={skin} />
                </g>
                <g filter={v}><FrontHair hair={a.hair} color={hairColor} /></g>
                <circle cx="43" cy="48" r="2.1" fill="#24170f" />
                <circle cx="57" cy="48" r="2.1" fill="#24170f" />
                <circle cx="43.7" cy="47.3" r="0.7" fill="#fff" />
                <circle cx="57.7" cy="47.3" r="0.7" fill="#fff" />
                <ellipse cx="39" cy="54" rx="3" ry="1.8" fill="#ff7a7a" opacity="0.25" />
                <ellipse cx="61" cy="54" rx="3" ry="1.8" fill="#ff7a7a" opacity="0.25" />
                <path d="M45.5 55.5 Q50 59.5 54.5 55.5" fill="none" stroke="#7a3b2a" strokeWidth="1.5" strokeLinecap="round" />
                <g filter={v}><Face id={a.face} hairColor={hairColor} /></g>
                <g filter={v}><Hat id={a.hat} /></g>
                {a.pet && a.pet !== 'aucun' && <g filter={v}><g transform="translate(73 79) scale(1.3)"><Pet id={a.pet} /></g></g>}
            </g>
        </svg>
    );
}

// Other players' avatars, fetched in one batch per render pass and cached for the session.
const cache = new Map();
const listeners = new Set();
let queue = new Set();
let timer = null;

function request(name) {
    if (cache.has(name) || queue.has(name)) return;
    queue.add(name);
    timer ??= setTimeout(async () => {
        const names = [...queue];
        queue = new Set();
        timer = null;
        try {
            const { avatars } = await api('avatars', { usernames: names });
            for (const n of names) cache.set(n, avatars[n] || null);
        } catch {
            for (const n of names) cache.set(n, null);
        }
        listeners.forEach((l) => l());
    }, 30);
}

// After saving in the editor, so every list shows the new look at once.
export function rememberAvatar(name, avatar) {
    cache.set(name, avatar);
    listeners.forEach((l) => l());
}

/** A player's avatar by pseudo. Pass `avatar` when the API already returned it. */
export default function PlayerAvatar({ name, avatar, size = 40, className = '', ring }) {
    const [, refresh] = useState(0);
    const known = avatar !== undefined ? avatar : cache.get(name);
    const loading = avatar === undefined && !cache.has(name);
    useEffect(() => {
        if (avatar !== undefined || !name) return undefined;
        const l = () => refresh((n) => n + 1);
        listeners.add(l);
        request(name);
        return () => listeners.delete(l);
    }, [name, avatar]);
    if (loading) return <span className={`inline-block shrink-0 rounded-full bg-white/10 ${className}`} style={{ width: size, height: size }} />;
    return <AvatarFigure avatar={known || defaultAvatar(name)} size={size} className={className} ring={ring} />;
}
