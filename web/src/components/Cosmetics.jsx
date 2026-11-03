/**
 * Honey-shop cosmetics drawn in the browser, keyed by the ids in functions/api/cosmetics.mjs:
 * scenes (avatar backgrounds) and effects (small animations over the avatar), both drawn in a
 * 100 × 100 box. Card frames are plain CSS (index.css, .nd-card[data-frame]).
 */

const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const t = Math.PI / 3 * i + Math.PI / 6;
    return `${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`;
}).join(' ');

const stars = (n, seed, maxY = 60) => {
    const r = rnd(seed);
    return Array.from({ length: n }, (_, i) => <circle key={i} cx={r() * 100} cy={r() * maxY} r={0.35 + r() * 0.6} fill="#fff" opacity={0.4 + r() * 0.6} />);
};

const flower = (x, y, c, k, s = 1) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-1.6" rx="1.1" ry="1.7" fill={c} transform={`rotate(${a})`} />)}
        <circle r="0.9" fill="#ffd54a" />
    </g>
);

/** Background `id` in 100 × 100 (`u` makes the gradient ids unique on the page). */
export function SceneArt({ id, u }) {
    const g = (name) => `${name}${u}`;
    switch (id) {
        case 'prairie': return (
            <g>
                <defs><linearGradient id={g('sp')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd3ff" /><stop offset="1" stopColor="#e9f8ff" /></linearGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('sp')})`} />
                <circle cx="82" cy="16" r="8" fill="#fff4b0" />
                <ellipse cx="20" cy="18" rx="10" ry="3.5" fill="#fff" opacity="0.85" />
                <path d="M-5 68 Q25 52 55 66 T105 60 V105 H-5 Z" fill="#8bcf5a" />
                <path d="M-5 80 Q30 66 60 78 T105 74 V105 H-5 Z" fill="#5fae3f" />
                {[[8, 84, '#ff7aa8'], [22, 90, '#fff'], [78, 86, '#c78bff'], [92, 92, '#ff7aa8'], [14, 96, '#ffd54a'], [86, 78, '#fff']].map(([x, y, c], i) => flower(x, y, c, i, 1.1))}
            </g>
        );
        case 'rayons': return (
            <g>
                <defs><radialGradient id={g('sr')} cx="0.5" cy="0.4" r="0.7"><stop offset="0" stopColor="#ffd666" /><stop offset="1" stopColor="#c9781a" /></radialGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('sr')})`} />
                {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => (
                    <polygon key={`${row}-${col}`} points={hex(col * 15 + (row % 2) * 7.5 - 4, row * 13 - 2, 7.6)} fill="none" stroke="#fff3c4" strokeOpacity="0.45" strokeWidth="1.1" />
                )))}
                {[[22, 24], [70, 12], [84, 64]].map(([x, y]) => <polygon key={x} points={hex(x, y, 6.6)} fill="#ffb020" opacity="0.7" />)}
            </g>
        );
        case 'sousbois': return (
            <g>
                <defs><linearGradient id={g('sb')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f5a3a" /><stop offset="1" stopColor="#173322" /></linearGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('sb')})`} />
                <path d="M30 -5 L48 -5 L70 105 L40 105 Z" fill="#e6ffb0" opacity="0.12" />
                <path d="M62 -5 L72 -5 L92 105 L76 105 Z" fill="#e6ffb0" opacity="0.08" />
                {[[6, 7], [24, 4], [80, 6], [94, 8]].map(([x, w]) => <rect key={x} x={x - w / 2} y="-5" width={w} height="110" fill="#3b2a1d" opacity="0.85" />)}
                <path d="M-5 84 Q20 76 50 84 T105 82 V105 H-5 Z" fill="#244a2c" />
                {[[10, 88], [88, 86], [70, 94]].map(([x, y]) => (
                    <g key={x} transform={`translate(${x} ${y})`} fill="#4f9a4a">
                        {[-50, -25, 0, 25, 50].map((a) => <ellipse key={a} cx="0" cy="-6" rx="1.6" ry="6.5" transform={`rotate(${a})`} />)}
                    </g>
                ))}
            </g>
        );
        case 'couchant': return (
            <g>
                <defs><linearGradient id={g('sc')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b3a8c" /><stop offset="0.5" stopColor="#f06a5a" /><stop offset="1" stopColor="#ffc46b" /></linearGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('sc')})`} />
                <circle cx="50" cy="70" r="20" fill="#ffe08a" opacity="0.9" />
                <path d="M-5 74 L18 60 L34 72 L56 54 L76 70 L90 62 L105 70 V105 H-5 Z" fill="#3a2442" opacity="0.85" />
                <path d="M-5 86 Q30 78 60 86 T105 84 V105 H-5 Z" fill="#26182e" />
                <path d="M14 30 l3 -1.4 l3 1.4 M66 22 l2.4 -1.2 l2.4 1.2" stroke="#2a1a33" strokeWidth="0.9" fill="none" />
            </g>
        );
        case 'lucioles': return (
            <g>
                <defs>
                    <linearGradient id={g('sl')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d1838" /><stop offset="1" stopColor="#1d3a3a" /></linearGradient>
                    <radialGradient id={g('sg')}><stop offset="0" stopColor="#f4ff8a" /><stop offset="1" stopColor="#f4ff8a" stopOpacity="0" /></radialGradient>
                </defs>
                <rect width="100" height="100" fill={`url(#${g('sl')})`} />
                {stars(22, 11)}
                <circle cx="78" cy="18" r="7" fill="#fdf6d8" /><circle cx="81" cy="16" r="6" fill="#16224a" />
                <path d="M-5 80 Q25 70 55 80 T105 76 V105 H-5 Z" fill="#11281f" />
                {[[14, 62], [30, 74], [84, 58], [70, 80], [92, 72], [6, 46]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill={`url(#${g('sg')})`} />)}
            </g>
        );
        case 'cerisiers': return (
            <g>
                <defs><linearGradient id={g('sk')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#fbb6cf" /></linearGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('sk')})`} />
                <path d="M-4 12 Q22 18 36 8 M10 15 Q16 24 26 26 M104 30 Q80 30 70 18 M86 28 Q84 38 76 42" stroke="#6b3b3b" strokeWidth="2" fill="none" strokeLinecap="round" />
                {[[4, 10], [14, 16], [24, 8], [34, 10], [22, 26], [28, 22], [96, 28], [84, 24], [74, 18], [78, 40], [88, 34], [68, 14]].map(([x, y], i) => flower(x, y, i % 2 ? '#ff9ec2' : '#ffd0e1', i, 1.3))}
                <path d="M-5 88 Q30 82 60 88 T105 86 V105 H-5 Z" fill="#f59ac0" opacity="0.6" />
            </g>
        );
        case 'lagon': return (
            <g>
                <defs><linearGradient id={g('so')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fe0e6" /><stop offset="1" stopColor="#11608c" /></linearGradient></defs>
                <rect width="100" height="100" fill={`url(#${g('so')})`} />
                <path d="M10 -5 L22 -5 L40 105 L26 105 Z M60 -5 L68 -5 L84 105 L74 105 Z" fill="#fff" opacity="0.1" />
                {[[12, 70, 2], [18, 58, 1.2], [88, 50, 1.8], [82, 38, 1], [90, 24, 1.4]].map(([x, y, r]) => <circle key={y} cx={x} cy={y} r={r} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.5" />)}
                <path d="M-5 90 Q20 84 45 90 T105 88 V105 H-5 Z" fill="#f2d79a" />
                <path d="M8 92 Q4 78 10 70 M10 92 Q16 80 12 72 M90 92 Q94 80 88 74" stroke="#2f9a6a" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M74 90 l3 -4 l3 4 l-3 1.4 Z" fill="#ff8a5c" />
            </g>
        );
        case 'aurore': return (
            <g>
                <defs>
                    <linearGradient id={g('sa')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#060b24" /><stop offset="1" stopColor="#14284a" /></linearGradient>
                    <linearGradient id={g('sb2')} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3dffb0" stopOpacity="0" /><stop offset="0.3" stopColor="#3dffb0" /><stop offset="0.7" stopColor="#a86bff" /><stop offset="1" stopColor="#a86bff" stopOpacity="0" /></linearGradient>
                </defs>
                <rect width="100" height="100" fill={`url(#${g('sa')})`} />
                {stars(26, 5, 80)}
                <path d="M-5 30 Q25 10 50 28 T105 22 L105 40 Q75 28 50 44 T-5 46 Z" fill={`url(#${g('sb2')})`} opacity="0.55" />
                <path d="M-5 44 Q30 30 55 44 T105 36 L105 48 Q70 40 50 54 T-5 56 Z" fill={`url(#${g('sb2')})`} opacity="0.35" />
                <path d="M-5 84 L16 66 L30 76 L48 60 L66 78 L82 64 L105 80 V105 H-5 Z" fill="#0b1630" />
                <path d="M48 60 L42 66 L48 64 L54 67 Z M16 66 L12 70 L18 69 Z" fill="#dfe9ff" />
            </g>
        );
        default: return null;
    }
}

// SMIL keeps the small avatars cheap: no React re-render, the browser animates the SVG itself.
const anim = (attr, values, dur, begin = 0) => <animate attributeName={attr} values={values} dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />;

/** Effect `id` over the avatar in 100 × 100. */
export function FxArt({ id, u }) {
    const r = rnd(id.length * 977 + 3);
    switch (id) {
        case 'pollen': return (
            <g>{Array.from({ length: 12 }, (_, i) => {
                const x = 6 + r() * 88, d = 3 + r() * 3, b = -r() * d;
                return <circle key={i} cx={x} r={0.7 + r() * 0.9} fill="#ffd54a">{anim('cy', '104;-4', d, b)}{anim('opacity', '0;1;1;0', d, b)}</circle>;
            })}</g>
        );
        case 'petales': return (
            <g>{Array.from({ length: 9 }, (_, i) => {
                const x = r() * 90, d = 4 + r() * 3, b = -r() * d, sway = 6 + r() * 8;
                return (
                    <g key={i}>
                        <animateTransform attributeName="transform" type="translate" values={`${x} -6;${x + sway} 50;${x - 2} 106`} dur={`${d}s`} begin={`${b}s`} repeatCount="indefinite" />
                        <ellipse rx="2" ry="1.1" fill={i % 2 ? '#ff9ec2' : '#ffd0e1'}>
                            <animateTransform attributeName="transform" type="rotate" values="0;360" dur={`${1.5 + r() * 2}s`} repeatCount="indefinite" />
                        </ellipse>
                    </g>
                );
            })}</g>
        );
        case 'lucioles': return (
            <g>
                <defs><radialGradient id={`fl${u}`}><stop offset="0" stopColor="#fbff9a" /><stop offset="0.35" stopColor="#e8ff5a" stopOpacity="0.8" /><stop offset="1" stopColor="#e8ff5a" stopOpacity="0" /></radialGradient></defs>
                {Array.from({ length: 8 }, (_, i) => {
                    const x = 8 + r() * 84, y = 10 + r() * 80, d = 2 + r() * 2;
                    return (
                        <circle key={i} r="3.6" fill={`url(#fl${u})`}>
                            <animate attributeName="cx" values={`${x};${x + 6};${x - 3};${x}`} dur={`${d * 3}s`} repeatCount="indefinite" />
                            <animate attributeName="cy" values={`${y};${y - 5};${y + 3};${y}`} dur={`${d * 2.6}s`} repeatCount="indefinite" />
                            {anim('opacity', '0.1;1;0.1', d, -r() * d)}
                        </circle>
                    );
                })}
            </g>
        );
        case 'papillons': return (
            <g>{[['#ff8a3d', '#ffd166', 'M-8 30 C20 10 40 40 60 18 S100 26 110 12', 7], ['#6bb8ff', '#c4e3ff', 'M110 70 C80 50 60 84 36 62 S0 74 -10 56', 9], ['#c78bff', '#f0d9ff', 'M20 110 C30 80 70 90 76 60 S60 20 90 -10', 11]].map(([c, c2, path, d], i) => (
                <g key={i}>
                    <animateMotion path={path} dur={`${d}s`} repeatCount="indefinite" rotate="auto" />
                    <g transform="rotate(90)">
                        <g>
                            <animateTransform attributeName="transform" type="scale" values="1 1;0.25 1;1 1" dur="0.35s" repeatCount="indefinite" />
                            <path d="M0 0 C-5 -6 -8 -1 -5 2 C-7 5 -2 6 0 1 C2 6 7 5 5 2 C8 -1 5 -6 0 0 Z" fill={c} stroke={c2} strokeWidth="0.5" />
                        </g>
                        <rect x="-0.4" y="-2.5" width="0.8" height="5" rx="0.4" fill="#2b1d16" />
                    </g>
                </g>
            ))}</g>
        );
        case 'flocons': return (
            <g>{Array.from({ length: 12 }, (_, i) => {
                const x = r() * 100, d = 5 + r() * 4, b = -r() * d, s = 0.6 + r() * 0.8;
                return (
                    <g key={i}>
                        <animateTransform attributeName="transform" type="translate" values={`${x} -5;${x + 4} 50;${x - 3} 105`} dur={`${d}s`} begin={`${b}s`} repeatCount="indefinite" />
                        <g transform={`scale(${s})`} stroke="#fff" strokeWidth="0.7" strokeLinecap="round" opacity="0.9">
                            <path d="M0 -2.6 V2.6 M-2.25 -1.3 L2.25 1.3 M-2.25 1.3 L2.25 -1.3" />
                        </g>
                    </g>
                );
            })}</g>
        );
        case 'arcenciel': return (
            <g>
                <defs>
                    <linearGradient id={`fr${u}`} x1="0" y1="0" x2="1" y2="1">
                        {['#ff5a5a', '#ffb13d', '#ffe74a', '#5ee36a', '#4ab8ff', '#9a6bff', '#ff5ad1'].map((c, i) => <stop key={c} offset={i / 6} stopColor={c} />)}
                    </linearGradient>
                </defs>
                <g>
                    <animateTransform attributeName="transform" type="rotate" values="0 50 50;360 50 50" dur="6s" repeatCount="indefinite" />
                    <circle cx="50" cy="50" r="47.5" fill="none" stroke={`url(#fr${u})`} strokeWidth="4" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke={`url(#fr${u})`} strokeWidth="1" opacity="0.5" strokeDasharray="3 5" />
                </g>
                {[0, 1, 2].map((i) => (
                    <path key={i} d="M0 -2.4 L0.7 -0.7 L2.4 0 L0.7 0.7 L0 2.4 L-0.7 0.7 L-2.4 0 L-0.7 -0.7 Z" fill="#fff">
                        <animateMotion path="M50 2.5 A47.5 47.5 0 1 1 49.9 2.5" dur="6s" begin={`${-i * 2}s`} repeatCount="indefinite" />
                        {anim('opacity', '0.3;1;0.3', 1.2, -i * 0.4)}
                    </path>
                ))}
            </g>
        );
        default: return null;
    }
}

export const hasScene = (a) => !!a?.scene && a.scene !== 'aucun';
export const hasFx = (a) => !!a?.fx && a.fx !== 'aucun';

/** A scene or effect alone, filling its box (stage backdrop, shop previews). */
export function CosmeticLayer({ kind, id, className = '', u = kind + id }) {
    if (!id || id === 'aucun') return null;
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden>
            {kind === 'scene' ? <SceneArt id={id} u={u} /> : <FxArt id={id} u={u} />}
        </svg>
    );
}
