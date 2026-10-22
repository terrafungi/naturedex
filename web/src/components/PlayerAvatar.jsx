import { useEffect, useId, useState } from 'react';
import { api } from '../api.jsx';

// The drawn character. Prices and ownership come from the API (functions/api/avatar.mjs);
// only the drawings live here, keyed by the same ids.
export const SKINS = ['#ffe0c7', '#f6c9a0', '#e3a878', '#c98d5c', '#9c6440', '#6b4128'];
export const HAIR_COLORS = ['#2b1d16', '#5a3a22', '#8b5a2b', '#c98a3d', '#e8c770', '#b8452c', '#d9d4cc', '#4f7cc9'];
export const BGS = ['#2f6b4f', '#3a6f8f', '#8a5a9c', '#b5704a', '#5d7a3a', '#384152'];
export const HAIRS = { court: 'Court', meche: 'Mèche', boucles: 'Boucles', long: 'Long', chignon: 'Chignon', tresses: 'Tresses', rase: 'Ras' };
export const ACCS = { aucun: 'Aucun', lunettes: 'Lunettes', casquette: 'Casquette', explorateur: 'Chapeau d\'explorateur', bandana: 'Bandana', jumelles: 'Jumelles', fleur: 'Fleur' };

const SHIRTS = {
    foret: { base: '#2e7d4f' },
    ciel: { base: '#4a90c8' },
    terre: { base: '#c0643b' },
    feuille: { base: '#3f9a63', motif: 'leaf', ink: '#d9f5c4' },
    rayures: { base: '#f3efe6', motif: 'stripes', ink: '#2b3f6b' },
    sapin: { base: '#1f5138', motif: 'tree', ink: '#7fd39a' },
    champignon: { base: '#c8352c', motif: 'dots', ink: '#fff7ee' },
    abeille: { base: '#f2c230', motif: 'bee', ink: '#2a2118' },
    ocean: { base: '#1d6fa5', motif: 'waves', ink: '#9fe0ff' },
    papillon: { base: '#a98ad8', motif: 'butterfly', ink: '#ffd36e' },
    nuit: { base: '#1b2350', motif: 'stars', ink: '#fff3b0' },
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
        skin: h % SKINS.length, hair: hairs[(h >> 3) % hairs.length], hairColor: (h >> 6) % 6,
        acc: 'aucun', bg: (h >> 9) % BGS.length, shirt: ['foret', 'ciel', 'terre', 'feuille'][(h >> 12) % 4],
    };
}

const TORSO = 'M12 104 C12 82 27 73 50 73 C73 73 88 82 88 104 Z';

function Motif({ kind, ink }) {
    switch (kind) {
        case 'leaf':
            return <path d="M50 96 C40 92 40 82 50 79 C60 82 60 92 50 96 Z M50 96 L50 81" fill={ink} stroke="#2e7d4f" strokeWidth="0.8" />;
        case 'stripes':
            return [80, 86, 92, 98].map((y) => <rect key={y} x="0" y={y} width="100" height="2.6" fill={ink} />);
        case 'tree':
            return <g fill={ink}><path d="M50 78 L58 89 L42 89 Z" /><path d="M50 83 L60 96 L40 96 Z" /><rect x="48.5" y="96" width="3" height="4" fill="#8b5a2b" /></g>;
        case 'dots':
            return <g fill={ink}>{[[30, 86, 3], [44, 81, 2.2], [57, 88, 3.4], [70, 82, 2.4], [38, 96, 2.6], [66, 97, 2.8], [52, 98, 1.8]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}</g>;
        case 'bee':
            return <g fill={ink}>{[83, 92, 101].map((y) => <rect key={y} x="0" y={y} width="100" height="4" />)}</g>;
        case 'waves':
            return <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round">{[84, 92].map((y) => <path key={y} d={`M14 ${y} q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0`} />)}</g>;
        case 'butterfly':
            return <g fill={ink}><ellipse cx="45" cy="85" rx="5" ry="6" transform="rotate(-20 45 85)" /><ellipse cx="55" cy="85" rx="5" ry="6" transform="rotate(20 55 85)" /><ellipse cx="46" cy="93" rx="3.5" ry="4" /><ellipse cx="54" cy="93" rx="3.5" ry="4" /><rect x="49.2" y="82" width="1.6" height="14" rx="0.8" fill="#3a2a5a" /></g>;
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

function Accessory({ acc }) {
    switch (acc) {
        case 'lunettes':
            return <g fill="none" stroke="#1d1d1d" strokeWidth="1.4"><circle cx="43" cy="47" r="4.6" fill="#ffffff22" /><circle cx="57" cy="47" r="4.6" fill="#ffffff22" /><path d="M47.6 47 L52.4 47 M38.4 46 L34 44.5 M61.6 46 L66 44.5" /></g>;
        case 'casquette':
            return <g><path d="M31 39 C31 22 69 22 69 39 Z" fill="#d9483b" /><path d="M48 38 L78 38 C80 38 80 42 77 42 L48 42 Z" fill="#a8322a" /><circle cx="50" cy="25" r="1.6" fill="#a8322a" /></g>;
        case 'explorateur':
            return <g><ellipse cx="50" cy="33" rx="29" ry="6" fill="#b89a62" /><path d="M35 33 C35 17 65 17 65 33 Z" fill="#cdb07a" /><rect x="35" y="28.5" width="30" height="3.4" fill="#6b5130" /></g>;
        case 'bandana':
            return <g fill="#d9483b"><path d="M32 37 Q50 28 68 37 L68 42 Q50 33 32 42 Z" /><path d="M67 38 L76 34 L74 41 Z" /><circle cx="44" cy="35" r="0.9" fill="#fff" /><circle cx="56" cy="35" r="0.9" fill="#fff" /></g>;
        case 'jumelles':
            return <g><path d="M43 73 L44 84 M57 73 L56 84" stroke="#3b2a1a" strokeWidth="1.2" fill="none" /><rect x="38.5" y="83" width="9" height="11" rx="3" fill="#2a2a2a" /><rect x="52.5" y="83" width="9" height="11" rx="3" fill="#2a2a2a" /><rect x="46.5" y="86" width="7" height="3" fill="#444" /><circle cx="43" cy="92" r="2.4" fill="#7fb7d9" /><circle cx="57" cy="92" r="2.4" fill="#7fb7d9" /></g>;
        case 'fleur':
            return <g>{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="64" cy="27" rx="2.6" ry="4.2" fill="#ff8fb1" transform={`rotate(${a} 64 31)`} />)}<circle cx="64" cy="31" r="2.4" fill="#ffd36e" /></g>;
        default:
            return null;
    }
}

export function AvatarFigure({ avatar, size = 40, className = '', ring }) {
    const uid = useId().replace(/:/g, '');
    const a = avatar || defaultAvatar('');
    const skin = SKINS[a.skin] || SKINS[0];
    const hairColor = HAIR_COLORS[a.hairColor] || HAIR_COLORS[0];
    const shirt = SHIRTS[a.shirt] || SHIRTS.foret;
    const fill = shirt.gradient ? `url(#g${uid})` : shirt.base;
    return (
        <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 rounded-full ${className}`}
            style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined} role="img" aria-label="Avatar">
            <defs>
                <clipPath id={`c${uid}`}><circle cx="50" cy="50" r="50" /></clipPath>
                <clipPath id={`t${uid}`}><path d={TORSO} /></clipPath>
                {shirt.gradient && (
                    <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
                        {shirt.gradient.map((c, i) => <stop key={c} offset={i / (shirt.gradient.length - 1)} stopColor={c} />)}
                    </linearGradient>
                )}
            </defs>
            <g clipPath={`url(#c${uid})`}>
                <rect width="100" height="100" fill={BGS[a.bg] || BGS[0]} />
                <circle cx="50" cy="40" r="34" fill="#ffffff" opacity="0.07" />
                <BackHair hair={a.hair} color={hairColor} />
                <rect x="43" y="58" width="14" height="18" rx="5" fill={skin} />
                <path d={TORSO} fill={fill} />
                <g clipPath={`url(#t${uid})`}><Motif kind={shirt.motif} ink={shirt.ink} /></g>
                <path d="M41 73.5 Q50 81 59 73.5" fill="none" stroke="#00000033" strokeWidth="1.6" />
                <circle cx="33" cy="48" r="4" fill={skin} />
                <circle cx="67" cy="48" r="4" fill={skin} />
                <ellipse cx="50" cy="46" rx="17" ry="19" fill={skin} />
                <FrontHair hair={a.hair} color={hairColor} />
                <circle cx="43" cy="48" r="2.1" fill="#24170f" />
                <circle cx="57" cy="48" r="2.1" fill="#24170f" />
                <circle cx="43.7" cy="47.3" r="0.7" fill="#fff" />
                <circle cx="57.7" cy="47.3" r="0.7" fill="#fff" />
                <ellipse cx="39" cy="54" rx="3" ry="1.8" fill="#ff7a7a" opacity="0.25" />
                <ellipse cx="61" cy="54" rx="3" ry="1.8" fill="#ff7a7a" opacity="0.25" />
                <path d="M45.5 55.5 Q50 59.5 54.5 55.5" fill="none" stroke="#7a3b2a" strokeWidth="1.5" strokeLinecap="round" />
                <Accessory acc={a.acc} />
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
