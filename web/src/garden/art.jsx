/** Garden data shared by the 3D island, the classic view, the panels and the mini-games. */

export const SEED_ORDER = ['radis', 'fraise', 'tournesol', 'lavande', 'champignon', 'chene', 'bambou', 'rose', 'lotus'];
export const SEED_TAGS = { radis: 'Rapide', rose: 'Grand rendement', lotus: 'Meilleur rendement', champignon: 'Brille la nuit' };
export const HONEY_COLOR = '#ffb627';

// Colours of each species once grown: leaves, and the flower / crown / fruit.
export const LOOK = {
    radis: { leaf: '#5fcf6b', head: '#e5486b', headHi: '#ff9bb0' },
    fraise: { leaf: '#3fae58', head: '#ef3b4f', headHi: '#ffd166' },
    tournesol: { leaf: '#4fbf5a', head: '#f7c531', headHi: '#7a4a12' },
    lavande: { leaf: '#7fae86', head: '#9b7bea', headHi: '#d9c8ff' },
    champignon: { leaf: '#3d8f6a', head: '#3fe0d0', headHi: '#e9fffb' },
    chene: { leaf: '#3f9e4f', head: '#2f8a43', headHi: '#7cc96a' },
    bambou: { leaf: '#6ccf5a', head: '#8fd16a', headHi: '#e9f7b5' },
    rose: { leaf: '#46b07a', head: '#b98cff', headHi: '#f0e3ff' },
    lotus: { leaf: '#3aa58a', head: '#ff8fc0', headHi: '#fff0f7' },
};

// Villagers posting orders.
export const NPCS = {
    herisson: { name: 'Hector le hérisson', emoji: '🦔', color: '#c9a27a', lines: ['Mes piquants ont faim, tu as de quoi ?', "C'est pour un pique-nique sous la haie !"] },
    chouette: { name: 'Mme Chouette', emoji: '🦉', color: '#a08cd6', lines: ['Hou hou ! Une commande pour la bibliothèque.', 'Livre-moi avant la nuit, veux-tu ?'] },
    renard: { name: 'Roux le renard', emoji: '🦊', color: '#f08a4b', lines: ["J'ai un plan… il me faut juste ça.", 'Chut, c\'est pour une surprise.'] },
    lapin: { name: 'Lou la lapine', emoji: '🐰', color: '#f4b6c8', lines: ['Mes petits adorent ton potager !', 'Vite vite, je suis en retard !'] },
    blaireau: { name: 'Basile le blaireau', emoji: '🦡', color: '#9aa3ad', lines: ['Pour ma soupe du soir, merci bien.', 'Je creuse un garde-manger tout neuf.'] },
    ecureuil: { name: 'Noisette', emoji: '🐿️', color: '#d98a4e', lines: ["Je fais des réserves pour l'hiver !", 'Tout le chêne en parle, de ton jardin.'] },
    grenouille: { name: 'Rainette', emoji: '🐸', color: '#6fd66b', lines: ['Croâ ! Pour la fête de la mare.', "C'est pour décorer mon nénuphar."] },
    abeille: { name: 'Reine Abeille', emoji: '🐝', color: '#ffc93c', lines: ['La ruche a besoin de fleurs fraîches.', 'Bzz, une livraison royale !'] },
};
export const npcLine = (order) => {
    const n = NPCS[order.npc] || NPCS.herisson;
    return n.lines[parseInt(order.id.slice(0, 2), 16) % n.lines.length];
};

// What each garden level brings (mirror of UNLOCKS and TITLES in functions/api/garden.mjs).
export const ROADMAP = [
    [2, "L'atelier : compost → engrais"], [3, 'Graine de fraise des bois'], [4, 'Boutique de décorations'],
    [5, 'Arrosoir géant : arrose tout en un geste'], [5, 'Titre « Main verte »'], [6, 'Graine de lavande'], [7, 'Potion de croissance'],
    [8, 'Une 4e commande'], [10, 'Champignon lumineux'], [10, "Titre « Cœur d'abeille »"], [14, 'Bambou géant'],
    [15, 'Titre « Esprit de la forêt »'], [20, 'Lotus céleste'], [20, 'Titre « Souffle des saisons »'],
    [30, 'Titre « Légende verte »'], [40, 'Titre « Âme du jardin »'],
];

export const DECOR_EMOJI ={ lanterne: '🏮', champis: '🍄', nichoir: '🐦', banc: '🪑', epouvantail: '🧑‍🌾', fontaine: '⛲', arche: '🌸', moulin: '🌬️', cerisier: '🌸',
    tulipes: '🌷', nid: '🪺', oeufs: '🥚', parasol: '⛱️', pasteques: '🍉', tournesols: '🌻',
    feuilles: '🍂', chataignes: '🌰', citrouilles: '🎃', bonhomme: '⛄', cadeaux: '🎁', sapin: '🎄' };
export const SEASON_EMOJI = { printemps: '🌷', ete: '☀️', automne: '🍁', hiver: '❄️' };

export const duration = (minutes) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} h`);
export function left(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, '0')}` : m ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
}

/** Growth of a plot at `now`: stage 0 seed, 1 sprout, 2 young, 3 ready. */
export function growth(plot, now) {
    if (!plot) return null;
    const from = new Date(plot.plantedAt).getTime(), to = new Date(plot.readyAt).getTime();
    const ready = to <= now;
    const progress = Math.min(1, Math.max(0, (now - from) / Math.max(1, to - from)));
    const pest = !!plot.pestAt && !ready && new Date(plot.pestAt).getTime() <= now;
    return { ready, progress, stage: ready ? 3 : progress < 0.3 ? 0 : progress < 0.7 ? 1 : 2, pest, left: to - now };
}

// Graines available once every pépite is converted (planting converts only what is missing).
export const per = (user) => user.nuggetsPerSeed ?? 2;
export const budgetOf = (user) => user.coins + Math.floor(user.nuggets / per(user));
export const nuggetsFor = (user, cost) => Math.max(0, cost - user.coins) * per(user);

/** Paris hour (0-24, fractional): drives day and night on the island. */
export function parisHour(now = Date.now()) {
    const [h, m] = new Date(now).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
    return h + m / 60;
}
/** 0 = full night, 1 = full day, with dawn 6-8 h and dusk 19-21 h. */
export function daylight(hour) {
    if (hour < 6 || hour >= 21) return 0;
    if (hour < 8) return (hour - 6) / 2;
    if (hour >= 19) return 1 - (hour - 19) / 2;
    return 1;
}

export function Honey({ className = 'w-4 h-4' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-label="miel">
            <path d="M12 2.5 20.2 7.2v9.6L12 21.5l-8.2-4.7V7.2z" fill={HONEY_COLOR} stroke="#8a4f00" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M7 9.5c2 1.4 8 1.4 10 0v2.8c-.8.6-1 2-1.9 2-.8 0-.9-1.3-1.8-1.3s-.9 2.6-2.1 2.6-1.1-2-2.2-2-1.1 1.2-2 1.1z" fill="#fff1b8" opacity="0.65" />
        </svg>
    );
}
export function Compost({ className = 'w-4 h-4' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-label="compost">
            <path d="M3 13c0-4 4-6 9-6s9 2 9 6l-1.5 7h-15z" fill="#7a4a26" stroke="#3b220f" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M8 7c-1-2 0-4 2-4.5M15 7c.6-2.4 2.6-3.4 4-3" stroke="#6fd66b" strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx="9" cy="14" r="1.2" fill="#c98b55" /><circle cx="14.5" cy="16" r="1" fill="#c98b55" /><circle cx="16" cy="12.5" r=".9" fill="#c98b55" />
        </svg>
    );
}
export function Fertilizer({ className = 'w-4 h-4' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-label="engrais">
            <path d="M6 6h12l1.5 14.5h-15z" fill="#e9d6a8" stroke="#6b4a12" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M6 6 8 3h8l2 3" fill="#cdb27a" stroke="#6b4a12" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M12 17c-3-1-3.5-4.5-1-7 1.5 2 3.5 4 1 7zm0 0c1.5-1.5 3.5-2 5-1.5-1 2-3 2.5-5 1.5" fill="#3fae58" />
        </svg>
    );
}

/** A plant drawn in 4 stages: 0 seed in the ground, 1 sprout, 2 young plant, 3 grown. */
export function PlantArt({ kind, stage, className = '' }) {
    const c = LOOK[kind] || LOOK.tournesol;
    const stem = [0, 22, 36, 46][stage];
    const top = 92 - stem;
    const custom = stage === 3 && ['champignon', 'bambou', 'lotus', 'lavande'].includes(kind);
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
            <ellipse cx="50" cy="93" rx="22" ry="5" fill="#2a170b" opacity="0.55" />
            {stage === 0 && (
                <>
                    <path d="M34 92q16-12 32 0z" fill="#6b4226" />
                    <ellipse cx="50" cy="86" rx="5" ry="3.5" fill="#d9b26a" />
                    <path d="M50 83q2-5 5-6" stroke={c.leaf} strokeWidth="2.4" strokeLinecap="round" fill="none" />
                </>
            )}
            {stage > 0 && !custom && (
                <>
                    <path d={`M50 92C50 ${92 - stem / 2} 48 ${top + 8} 50 ${top}`} stroke="#3f8f3c" strokeWidth={stage === 3 && kind === 'chene' ? 7 : 3.4} strokeLinecap="round" fill="none" />
                    <path d={`M50 ${92 - stem * 0.35}q-14-4-18-14q12-1 18 10z`} fill={c.leaf} />
                    <path d={`M50 ${92 - stem * 0.55}q14-4 18-14q-12-1-18 10z`} fill={c.leaf} />
                    {stage === 1 && <path d={`M50 ${top}q-7-6-4-12q6 4 4 12zM50 ${top}q7-6 4-12q-6 4-4 12z`} fill={c.leaf} />}
                    {stage === 2 && <circle cx="50" cy={top} r="7" fill={c.head} opacity="0.8" />}
                </>
            )}
            {stage === 3 && kind === 'tournesol' && (
                <g transform={`translate(50 ${top})`}>
                    {Array.from({ length: 12 }, (_, i) => <ellipse key={i} rx="5" ry="11" cy="-13" fill={c.head} transform={`rotate(${i * 30})`} />)}
                    <circle r="10" fill={c.headHi} />
                </g>
            )}
            {stage === 3 && kind === 'radis' && (
                <g>
                    <path d={`M50 ${top + 2}q-12-12-8-24q8 8 8 24zM50 ${top + 2}q12-12 8-24q-8 8-8 24zM50 ${top + 2}q0-16 0-26`} fill={c.leaf} stroke={c.leaf} strokeWidth="2" />
                    <path d="M38 80q12-14 24 0q-2 12-12 14q-10-2-12-14z" fill={c.head} />
                    <path d="M44 80q4-5 8-5" stroke={c.headHi} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>
            )}
            {stage === 3 && kind === 'fraise' && (
                <g>
                    {[[36, top + 16], [62, top + 10], [50, top + 26]].map(([x, y], i) => (
                        <g key={i} transform={`translate(${x} ${y})`}>
                            <path d="M-8-4q8-6 16 0q-1 10-8 15q-7-5-8-15z" fill={c.head} />
                            <path d="M-6-5l3 3 3-4 3 4 3-3" stroke={c.leaf} strokeWidth="2.6" strokeLinejoin="round" fill="none" />
                            <circle cx="-3" cy="2" r="0.9" fill={c.headHi} /><circle cx="3" cy="1" r="0.9" fill={c.headHi} /><circle cx="0" cy="6" r="0.9" fill={c.headHi} />
                        </g>
                    ))}
                </g>
            )}
            {stage === 3 && kind === 'chene' && (
                <g>
                    <circle cx="50" cy={top - 2} r="20" fill={c.head} />
                    <circle cx="36" cy={top + 8} r="13" fill={c.head} />
                    <circle cx="64" cy={top + 8} r="13" fill={c.head} />
                    <circle cx="44" cy={top - 8} r="8" fill={c.headHi} opacity="0.5" />
                    <ellipse cx="60" cy={top + 12} rx="3" ry="4" fill="#b7793a" />
                    <ellipse cx="40" cy={top + 2} rx="3" ry="4" fill="#b7793a" />
                </g>
            )}
            {stage === 3 && kind === 'rose' && (
                <g transform={`translate(50 ${top})`}>
                    {Array.from({ length: 6 }, (_, i) => <ellipse key={i} rx="8" ry="12" cy="-8" fill={c.head} opacity="0.9" transform={`rotate(${i * 60})`} />)}
                    <circle r="8" fill={c.headHi} />
                    <path d="M-3-2a5 5 0 1 0 6-3a4 4 0 1 1-6 3z" fill="#fff8c9" />
                </g>
            )}
            {stage === 3 && kind === 'lavande' && (
                <g>
                    {[[-14, 8, -12], [-6, 0, -5], [2, -4, 2], [10, 2, 9], [17, 10, 15]].map(([dx, dy, r], i) => (
                        <g key={i} transform={`translate(${50 + dx} 92) rotate(${r})`}>
                            <path d={`M0 0V${-48 + dy}`} stroke="#5d8f5f" strokeWidth="2.2" />
                            {Array.from({ length: 6 }, (_, j) => <ellipse key={j} cx="0" cy={-30 + dy - j * 4} rx="3.4" ry="2.6" fill={j % 2 ? c.head : c.headHi} />)}
                        </g>
                    ))}
                </g>
            )}
            {stage === 3 && kind === 'champignon' && (
                <g>
                    <circle cx="50" cy="60" r="34" fill={c.head} opacity="0.12" />
                    {[[36, 18, 0.8], [62, 26, 0.65], [50, 34, 1]].map(([x, h, s], i) => (
                        <g key={i} transform={`translate(${x} 92) scale(${s})`}>
                            <path d={`M-5 0q-1-${h * 0.6} 1-${h}h8q2 ${h * 0.4} 1 ${h}z`} fill="#f2ead8" />
                            <path d={`M-18-${h}q18-26 36 0z`} fill={c.head} />
                            <circle cx="-7" cy={-h - 6} r="2.4" fill={c.headHi} /><circle cx="5" cy={-h - 9} r="2" fill={c.headHi} />
                        </g>
                    ))}
                </g>
            )}
            {stage === 3 && kind === 'bambou' && (
                <g>
                    {[[38, 56], [52, 70], [64, 48]].map(([x, h], i) => (
                        <g key={i}>
                            <rect x={x - 4} y={92 - h} width="8" height={h} rx="3" fill={i === 1 ? c.head : c.leaf} />
                            {Array.from({ length: Math.floor(h / 14) }, (_, j) => <rect key={j} x={x - 5} y={92 - (j + 1) * 14} width="10" height="2.4" rx="1" fill="#3f8f3c" />)}
                            <path d={`M${x} ${94 - h}q10-8 18-4q-9 6-18 4z`} fill={c.leaf} />
                        </g>
                    ))}
                </g>
            )}
            {stage === 3 && kind === 'lotus' && (
                <g transform="translate(50 74)">
                    <ellipse cx="0" cy="12" rx="34" ry="9" fill="#2f9fb8" opacity="0.65" />
                    <ellipse cx="-10" cy="10" rx="18" ry="6" fill="#2e8a5c" />
                    {[-50, -25, 0, 25, 50].map((r, i) => <ellipse key={i} rx="6" ry="16" cy="-10" fill={i % 2 ? c.head : c.headHi} transform={`rotate(${r})`} />)}
                    <circle cy="-2" r="5" fill="#ffd166" />
                </g>
            )}
        </svg>
    );
}
