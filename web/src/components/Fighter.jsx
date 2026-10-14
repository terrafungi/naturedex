import { motion } from 'motion/react';
import { Shield, Swords, Wind, Zap } from 'lucide-react';
import { RARITIES, TYPES } from '../game.jsx';
import { ABILITIES, PROFILES, STRONG, typeMult } from '../battle.js';

export const WEAK_TO = Object.fromEntries(Object.keys(TYPES).map((t) => [t, Object.keys(STRONG).filter((k) => STRONG[k].includes(t))]));

// Round portrait with a ring in the type colour.
export function Avatar({ card, size = 48, dim = false, className = '' }) {
    const t = TYPES[card.type] || TYPES.plant;
    return (
        <span className={`relative inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size }} title={card.name}>
            <img src={card.thumb_url} alt={card.name} draggable="false" loading="lazy"
                className={`w-full h-full rounded-full object-cover bg-white/10 ${dim ? 'grayscale opacity-40' : ''}`}
                style={{ boxShadow: `0 0 0 2px ${t.color}, 0 0 0 3.5px rgb(0 0 0 / 0.5)` }} />
            <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full text-white"
                style={{ width: size * 0.42, height: size * 0.42, background: t.color, boxShadow: '0 0 0 2px #05130d' }}>
                <t.Icon style={{ width: size * 0.26, height: size * 0.26 }} />
            </span>
        </span>
    );
}

export function TypeChip({ type, small = false }) {
    const t = TYPES[type];
    if (!t) return null;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-semibold text-white ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
            style={{ background: `color-mix(in oklab, ${t.color} 70%, black)` }}>
            <t.Icon className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} />{t.label}
        </span>
    );
}

export function Stats({ card, className = '', hp = true }) {
    return (
        <span className={`inline-flex items-center gap-2.5 tabular-nums text-xs font-bold ${className}`}>
            {hp && <span title="Points de vie" className="text-[#8ee6a8]">{card.hp ?? card.maxHp} PV</span>}
            <span title="Attaque" className="flex items-center gap-0.5 text-[#ffb4a2]"><Swords className="w-3 h-3" />{card.atk}</span>
            <span title="Défense" className="flex items-center gap-0.5 text-[#a5c8ff]"><Shield className="w-3 h-3" />{card.def}</span>
            <span title="Vitesse" className="flex items-center gap-0.5 text-[#f4d88f]"><Wind className="w-3 h-3" />{card.spd}</span>
        </span>
    );
}

export function AbilityLine({ type, className = '' }) {
    const ab = ABILITIES[type];
    if (!ab) return null;
    return (
        <p className={`text-xs text-white/75 ${className}`}>
            <b className="text-white">{ab.name}</b> <span className="inline-flex items-center text-[#f4d88f] font-bold">{ab.cost}<Zap className="w-3 h-3 fill-current" /></span> · {ab.text}
        </p>
    );
}

export function RarityDot({ rarity }) {
    const r = RARITIES[rarity] || RARITIES.common;
    return <span className="text-[10px] font-bold" style={{ color: r.color }} title={r.label}>{r.symbol} {r.label}</span>;
}

export function HpBar({ hp, max, shield = 0, height = 10 }) {
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
    const color = pct > 50 ? '#4fd18b' : pct > 25 ? '#e9c46a' : '#e76f51';
    return (
        <div className="relative w-full rounded-full bg-black/50 overflow-hidden ring-1 ring-white/10" style={{ height }}>
            <motion.div className="absolute inset-y-0 left-0 rounded-full" initial={false} animate={{ width: `${pct}%`, background: color }} transition={{ duration: 0.45 }} />
            {shield > 0 && (
                <motion.div className="absolute inset-y-0 rounded-full bg-[#a5c8ff]/80" initial={false}
                    animate={{ left: `${pct}%`, width: `${Math.min(100 - pct, (shield / max) * 100)}%` }} transition={{ duration: 0.45 }} />
            )}
        </div>
    );
}

// ×1.5 / ×0.75 label for a matchup, or nothing when neutral.
export function MultTag({ mult, prefix = '', invert = false }) {
    if (!mult || mult === 1) return null;
    const good = (mult > 1) !== invert;
    return (
        <span className={`inline-block rounded px-1 text-[10px] font-black tabular-nums ${good ? 'bg-[#4fd18b]/20 text-[#8ee6a8]' : 'bg-[#e76f51]/20 text-[#ffb4a2]'}`}>
            {prefix}×{String(mult).replace('.', ',')}
        </span>
    );
}

// How my card fares against theirs: dealt and taken multipliers.
export const matchup = (mine, theirs) => ({ dealt: typeMult(mine.type, theirs.type), taken: typeMult(theirs.type, mine.type) });

export { ABILITIES, PROFILES, STRONG, typeMult };
