import { Backpack, Binoculars, Camera, CloudRain, Cloud, Compass, Droplets, Flower2, Footprints, HeartPulse, Mountain, Search, Shield, Snowflake, Sparkles, Sun, SunDim, Trees, Waves, Wrench } from 'lucide-react';
import { RARITIES, TYPES } from '../game.jsx';
import { BIOMES, UNIVERSAL } from '../tcg.js';

export const BIOME_ICON = { foret: Trees, ocean: Waves, montagne: Mountain, desert: Sun, prairie: Flower2, humide: Droplets, ciel: Cloud, [UNIVERSAL]: Sparkles };
export const biomeColor = (b) => (b === UNIVERSAL ? '#d6b3ff' : BIOMES[b]?.color || '#9ca3af');
export const biomeName = (b) => (b === UNIVERSAL ? 'Universelle' : BIOMES[b]?.name || b);
const TRAINER_ICON = {
    jumelles: Binoculars, appareil: Camera, gourde: Droplets, boussole: Compass, filet: Search, trousse: HeartPulse,
    loupe: Search, gilet: Shield, bottes: Footprints, pluie: CloudRain, secheresse: SunDim, canopee: Trees, blizzard: Snowflake,
};
export const KIND_LABEL = { creature: 'Créature', energy: 'Énergie', item: 'Objet', supporter: 'Supporter', stadium: 'Stade', tool: 'Outil' };
const KIND_COLOR = { item: '#4ea8ff', supporter: '#ff8a65', stadium: '#8ee6a8', tool: '#f4d88f' };

/** One energy as a coloured token; 'any' is a grey star. */
export function EnergyDot({ biome, size = 16, title }) {
    const any = biome === 'any';
    const Icon = any ? Sparkles : BIOME_ICON[biome] || Sparkles;
    return (
        <span title={title || (any ? 'N\'importe quelle Énergie' : `Énergie ${biomeName(biome)}`)} className="inline-grid place-items-center rounded-full shrink-0"
            style={{ width: size, height: size, background: any ? '#ffffff30' : biomeColor(biome), boxShadow: '0 0 0 1.5px rgb(0 0 0 / 0.45)' }}>
            <Icon style={{ width: size * 0.62, height: size * 0.62 }} className="text-white" strokeWidth={2.5} />
        </span>
    );
}

export function CostRow({ cost, size = 16 }) {
    return <span className="inline-flex gap-0.5">{cost.map((b, i) => <EnergyDot key={i} biome={b} size={size} />)}</span>;
}

/** Remaining PV as a small bar. */
export function Hp({ left, max, height = 5 }) {
    const pct = Math.max(0, Math.min(1, left / max));
    const color = pct > 0.5 ? '#4fd18b' : pct > 0.25 ? '#f4c84f' : '#ff6b5b';
    return (
        <span className="block w-full rounded-full bg-black/50 overflow-hidden" style={{ height }}>
            <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, background: color }} />
        </span>
    );
}

/**
 * A card on the board or in the hand. size: 'hand' | 'bench' | 'active'.
 * Creatures in play show their remaining PV, energies, tool and poison.
 */
export function GameCard({ card, size = 'hand', selected, highlight, dim, onClick, className = '' }) {
    const W = { hand: 74, bench: 70, active: 118, big: 220 }[size];
    const H = Math.round(W * 1.38);
    const small = W < 100;
    const Tag = onClick ? 'button' : 'div';
    const ring = selected ? '0 0 0 3px #f4d88f, 0 0 18px #f4d88faa' : highlight ? '0 0 0 3px #8ee6a8, 0 0 16px #8ee6a888' : '0 4px 14px rgb(0 0 0 / 0.45)';
    const base = `relative shrink-0 rounded-xl overflow-hidden text-left select-none transition ${dim ? 'opacity-40' : ''} ${highlight ? 'animate-pulse' : ''} ${className}`;
    if (card.kind === 'creature') {
        const t = TYPES[card.type] || TYPES.plant;
        const left = card.hp - (card.damage || 0);
        return (
            <Tag onClick={onClick} className={base} style={{ width: W, height: H, boxShadow: ring, background: `linear-gradient(160deg, ${biomeColor(card.biome)}, #10241a 75%)` }}>
                <img src={card.thumb_url} alt="" draggable="false" loading="lazy" className="absolute inset-x-1 top-1 rounded-lg object-cover bg-black/30" style={{ height: H * 0.56, width: W - 8 }} />
                <span className="absolute top-1.5 left-1.5"><EnergyDot biome={card.biome} size={small ? 13 : 18} /></span>
                <span className="absolute top-1.5 right-1.5 grid place-items-center rounded-full text-white" style={{ width: small ? 14 : 20, height: small ? 14 : 20, background: t.color }}>
                    <t.Icon style={{ width: small ? 9 : 13, height: small ? 9 : 13 }} />
                </span>
                {card.captures > 1 && <span className="absolute left-1.5 font-black text-[9px] px-1 rounded bg-[#ff5fd2] text-white" style={{ top: H * 0.56 - 12 }} title="Rare ou menacée : vaut 2 captures">×2</span>}
                <span className="absolute inset-x-1.5 bottom-1.5 space-y-0.5">
                    <span className={`block font-bold leading-tight truncate text-white ${small ? 'text-[9px]' : 'text-xs'}`}>{card.name}</span>
                    <span className={`flex items-center justify-between font-black tabular-nums ${small ? 'text-[9px]' : 'text-xs'}`}>
                        <span className={left < card.hp ? 'text-[#ffd27a]' : 'text-white'}>{left}<span className="text-white/50 font-bold">/{card.hp}</span></span>
                        <span className="text-white/60 font-bold">PV</span>
                    </span>
                    {card.damage != null && <Hp left={left} max={card.hp} height={small ? 3 : 5} />}
                </span>
                {card.energies?.length > 0 && (
                    <span className="absolute flex flex-wrap gap-0.5" style={{ left: 4, top: H * 0.56 - (small ? 14 : 20) }}>
                        {card.energies.map((b, i) => <EnergyDot key={i} biome={b} size={small ? 11 : 16} />)}
                    </span>
                )}
                {card.tool && <span className="absolute right-1.5 grid place-items-center rounded-full bg-[#f4d88f] text-[#2a1c00]" style={{ top: H * 0.56 - (small ? 14 : 20), width: small ? 12 : 18, height: small ? 12 : 18 }} title="Outil équipé"><Wrench style={{ width: small ? 8 : 11, height: small ? 8 : 11 }} /></span>}
                {card.poisoned && <span className="absolute inset-0 bg-[#a855f7]/25 pointer-events-none" title="Empoisonnée" />}
                {card.shield > 0 && <span className="absolute inset-0 ring-2 ring-inset ring-[#a5c8ff] rounded-xl pointer-events-none" title={`Protégée (−${card.shield})`} />}
            </Tag>
        );
    }
    if (card.kind === 'energy') {
        const Icon = BIOME_ICON[card.biome] || Sparkles;
        const c = biomeColor(card.biome);
        return (
            <Tag onClick={onClick} className={base} style={{ width: W, height: H, boxShadow: ring, background: card.biome === UNIVERSAL ? 'linear-gradient(135deg,#ff8a65,#f4d88f,#8ee6a8,#4ea8ff,#d6b3ff)' : `radial-gradient(circle at 50% 40%, ${c}, color-mix(in oklab, ${c} 45%, black))` }}>
                <span className="absolute inset-0 grid place-items-center"><Icon className="text-white drop-shadow" style={{ width: W * 0.5, height: W * 0.5 }} strokeWidth={2.2} /></span>
                <span className={`absolute inset-x-1 bottom-1.5 text-center font-bold text-white leading-tight drop-shadow ${small ? 'text-[9px]' : 'text-xs'}`}>{biomeName(card.biome)}</span>
                <span className={`absolute inset-x-1 top-1.5 text-center uppercase tracking-wider font-black text-white/80 ${small ? 'text-[7px]' : 'text-[10px]'}`}>Énergie</span>
            </Tag>
        );
    }
    const key = card.key?.slice(2);
    const Icon = TRAINER_ICON[key] || Backpack;
    const kc = KIND_COLOR[card.kind] || '#fff';
    return (
        <Tag onClick={onClick} className={base} style={{ width: W, height: H, boxShadow: ring, background: `linear-gradient(170deg, color-mix(in oklab, ${kc} 55%, #1d2b24), #0f1d17 70%)` }}>
            <span className={`absolute inset-x-1 top-1 text-center uppercase tracking-wider font-black ${small ? 'text-[7px]' : 'text-[10px]'}`} style={{ color: kc }}>{KIND_LABEL[card.kind]}</span>
            {card.img ? (
                <img src={card.img} alt="" draggable="false" loading="lazy" className="absolute inset-x-1.5 rounded-lg object-cover object-top" style={{ top: small ? 12 : 18, height: H * 0.52, width: W - 12 }} />
            ) : (
                <span className="absolute inset-x-0 grid place-items-center" style={{ top: small ? 14 : 20, height: H * 0.5 }}><Icon className="text-white/90" style={{ width: W * 0.42, height: W * 0.42 }} /></span>
            )}
            <span className={`absolute inset-x-1 bottom-1.5 text-center font-bold text-white leading-tight ${small ? 'text-[9px] line-clamp-2' : 'text-xs'}`}>{card.name}</span>
            <span className="absolute right-1 font-bold" style={{ top: small ? 12 : 18, color: RARITIES[card.rarity]?.color, fontSize: small ? 8 : 11 }}>{RARITIES[card.rarity]?.symbol}</span>
        </Tag>
    );
}

/** Everything about a card, for the detail sheet. `damageOf(i)` gives the damage of attack i on the foe. */
export function CardText({ card, damageOf }) {
    if (card.kind === 'creature') {
        const t = TYPES[card.type] || TYPES.plant;
        return (
            <div className="space-y-2 text-sm">
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full font-bold text-white" style={{ background: biomeColor(card.biome) }}>{biomeName(card.biome)}</span>
                    <span className="px-2 py-0.5 rounded-full font-bold text-white" style={{ background: `color-mix(in oklab, ${t.color} 70%, black)` }}>{t.label}</span>
                    <span className="font-bold" style={{ color: RARITIES[card.rarity]?.color }}>{RARITIES[card.rarity]?.symbol} {RARITIES[card.rarity]?.label}</span>
                    {card.captures > 1 && <span className="px-2 py-0.5 rounded-full font-bold bg-[#ff5fd2]/20 text-[#ff9be6]">{card.endangered ? 'Menacée' : 'Rare'} : vaut 2 captures</span>}
                </p>
                {card.attacks.map((a, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-white/[0.06]">
                        <p className="flex items-center gap-2 font-bold"><CostRow cost={a.cost} /><span className="flex-1">{a.name}</span>
                            <span className="font-display text-lg">{damageOf ? damageOf(i) : a.damage}</span></p>
                        {a.text && <p className="text-xs text-white/70 mt-0.5">{a.text}</p>}
                    </div>
                ))}
                <p className="text-xs text-white/60">Retraite : {card.retreat ? <CostRow cost={Array(card.retreat).fill('any')} size={13} /> : 'gratuite'} · Défense {card.def}</p>
            </div>
        );
    }
    return (
        <div className="space-y-1 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: KIND_COLOR[card.kind] || biomeColor(card.biome) }}>
                {KIND_LABEL[card.kind]}{card.kind === 'supporter' ? ' · 1 par tour' : card.kind === 'item' ? ' · sans limite' : card.kind === 'stadium' ? ' · 1 en jeu' : card.kind === 'tool' ? ' · 1 par créature' : ' · 1 par tour'}
            </p>
            {card.years && <p className="text-xs text-white/50">Naturaliste · {card.years}</p>}
            <p className="text-white/85">{card.text}</p>
        </div>
    );
}
