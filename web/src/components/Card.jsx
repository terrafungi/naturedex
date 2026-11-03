import { useRef } from 'react';
import { Camera, Eye, HelpCircle, MapPin, Sparkles, Zap } from 'lucide-react';
import { RARITIES, TYPES, formatViews } from '../game.jsx';
import { ABILITIES, battleStats } from '../battle.js';

export function TypeBadge({ type, className = '' }) {
    const t = TYPES[type];
    if (!t) return null;
    return (
        <span className={`nd-type-icon ${className}`} style={{ '--type': t.color }} title={t.label}>
            <t.Icon />
        </span>
    );
}

// Commons serves no 500px thumbnail for images narrower than that: show the original file.
function fallbackToOriginal(e) {
    const original = e.currentTarget.src.replace('/thumb/', '/').replace(/\/\d+px-[^/]+$/, '');
    if (original !== e.currentTarget.src) e.currentTarget.src = original;
}

// Special finish (cards.art): 'full' / 'illus' = the picture fills the whole card and the text sits
// on top of it; 'holo' = the regular layout with a holographic foil (some commons and uncommons).
export const ART = { full: 'Full art', illus: 'Illustration', holo: 'Holo' };

/** Full card. `card` comes from the catalog (light) or the API (full). */
export function Card({ card, number, total, tilt = false, className = '' }) {
    const ref = useRef(null);
    const t = TYPES[card.type] || TYPES.plant;
    const r = RARITIES[card.rarity] || RARITIES.common;
    const hp = card.hp ?? card.stats?.hp;
    const st = card.atk != null ? card : card.stats?.atk != null ? card.stats : battleStats(card);
    const ab = ABILITIES[card.type];
    const art = ART[card.art];
    const bleed = art && card.art !== 'holo';
    const foil = art || ['epic', 'legendary', 'secret'].includes(card.rarity);
    const ink = bleed || card.rarity === 'secret' ? r.color : `color-mix(in oklab, ${r.color} 72%, black)`;
    const fact = bleed ? null : card.fact;

    function onMove(e) {
        if (!foil && !tilt) return;
        const el = ref.current;
        const box = el.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width;
        const y = (e.clientY - box.top) / box.height;
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
        if (tilt) el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 16}deg)`;
    }
    function onLeave() {
        if (tilt && ref.current) ref.current.style.transform = '';
    }

    return (
        <div className="nd-box">
        <div
            ref={ref}
            className={`nd-card transition-transform duration-200 ease-out ${className}`}
            data-rarity={card.rarity}
            data-fact={fact ? '' : undefined}
            data-art={bleed ? card.art : undefined}
            data-holo={card.art === 'holo' ? '' : undefined}
            style={{ '--type': t.color }}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
        >
            <div className="nd-card-inner">
                <div className="flex items-start justify-between gap-[2cqi]">
                    <div className="min-w-0">
                        <div className="nd-name line-clamp-2 break-words">{card.name}</div>
                        {art && <span className="nd-art-tag"><Sparkles />{art}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-[1.5cqi]">
                        {hp != null && <div className="nd-hp"><small>PV </small>{hp}</div>}
                        <TypeBadge type={card.type} />
                    </div>
                </div>
                <div className="nd-window">
                    <img src={card.thumb_url} alt={card.name} loading="lazy" draggable="false" onError={fallbackToOriginal} />
                </div>
                <div className="nd-strip">
                    <span className="nd-sci">{card.sci_name || t.label}</span>
                    <span className="shrink-0 font-semibold" style={{ color: ink }}>{t.label}</span>
                </div>
                <div className="nd-stats">
                    <span title="Attaque"><small>ATQ</small>{st.atk}</span>
                    <span title="Défense"><small>DÉF</small>{st.def}</span>
                    <span title="Vitesse : la plus rapide agit en premier"><small>VIT</small>{st.spd}</span>
                </div>
                {ab && (
                    <div className="nd-attack" title={ab.text}>
                        <span className="nd-type-icon !w-[5cqi] !h-[5cqi]" style={{ '--type': t.color }} />
                        <b>{ab.name}</b>
                        <span className="flex items-center">{ab.cost}<Zap className="w-[4.2cqi] h-[4.2cqi] fill-current" /></span>
                    </div>
                )}
                {fact && <p className="nd-fact">{fact}</p>}
                <div className="nd-foot">
                    <span className="flex items-center gap-[1cqi]" title="Lectures Wikipédia par an (estimation)">
                        {card.views != null && <><Eye className="w-[3.6cqi] h-[3.6cqi]" />{formatViews(Number(card.views))}</>}
                    </span>
                    <span className="font-bold tracking-wide" style={{ color: ink }} title={r.label}>
                        {r.symbol} {r.label}
                    </span>
                    {number != null && <span>{String(number).padStart(3, '0')}/{total}</span>}
                </div>
            </div>
        </div>
        </div>
    );
}

/**
 * Field card (« Sur le terrain »): the player's own photo of the species, holographic frame,
 * observation number, region, date and photographer. `obs` comes from the field* API actions.
 */
export function FieldCard({ obs, className = '' }) {
    const ref = useRef(null);
    const card = obs.card;
    const t = TYPES[card.type] || TYPES.plant;
    const r = RARITIES[card.rarity] || RARITIES.common;
    const date = obs.at ? new Date(obs.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    function onMove(e) {
        const el = ref.current;
        const box = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((e.clientX - box.left) / box.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - box.top) / box.height) * 100}%`);
    }

    return (
        <div className="nd-box">
        <div ref={ref} className={`nd-field ${className}`} style={{ '--type': t.color, '--rar': r.color }} onPointerMove={onMove}>
            <img className="nd-field-photo" src={obs.thumb} alt={`${card.name}, photo de ${obs.username}`} loading="lazy" draggable="false"
                onError={(e) => { if (e.currentTarget.src !== obs.photo) e.currentTarget.src = obs.photo; }} />
            <div className="nd-field-top">
                <span className="nd-field-tag"><Camera />Terrain</span>
                <TypeBadge type={card.type} />
            </div>
            {obs.captive && <span className="nd-field-captive">En captivité</span>}
            <div className="nd-field-bottom">
                <div className="nd-field-name line-clamp-2 break-words">{card.name}</div>
                {card.sci_name && <div className="nd-field-sci">{card.sci_name}</div>}
                <div className="nd-field-meta">
                    <span className="font-bold" style={{ color: r.color }} title={r.label}>{r.symbol} Obs. n°{obs.number}</span>
                    <span className="truncate">@{obs.username}</span>
                </div>
                <div className="nd-field-meta opacity-80">
                    <span className="flex items-center gap-[1cqi] min-w-0 truncate">{obs.region && <><MapPin className="w-[3.4cqi] h-[3.4cqi] shrink-0" />{obs.region}</>}</span>
                    <span className="shrink-0">{date}</span>
                </div>
            </div>
        </div>
        </div>
    );
}

export function MysteryCard({ card, number }) {
    const t = TYPES[card.type] || TYPES.plant;
    if (card.rarity === 'secret') return (
        <div className="nd-box">
        <div className="nd-mystery" data-secret title="Carte secrète">
            <div>
                <div className="flex flex-col items-center gap-[3cqi] text-center">
                    <Sparkles style={{ width: '16cqi', height: '16cqi' }} className="text-[#ff9fe6] drop-shadow-[0_0_10px_#ff5fd2]" />
                    <span style={{ fontSize: '6cqi' }} className="font-display font-semibold">Carte secrète</span>
                    {card.type && <span style={{ fontSize: '4cqi' }} className="opacity-60">{t.label}</span>}
                </div>
            </div>
        </div>
        </div>
    );
    return (
        <div className="nd-box">
        <div className="nd-mystery" style={{ '--type': t.color }}>
            <div className="flex flex-col items-center gap-[3cqi] text-center">
                <span className="nd-type-icon !w-[16cqi] !h-[16cqi] opacity-50" style={{ '--type': t.color }}>
                    <t.Icon style={{ width: '9cqi', height: '9cqi' }} />
                </span>
                <HelpCircle style={{ width: '9cqi', height: '9cqi' }} className="opacity-50" />
                {number != null && <span style={{ fontSize: '5cqi' }} className="font-display font-semibold">#{String(number).padStart(3, '0')}</span>}
            </div>
        </div>
        </div>
    );
}

/** Card back, used during booster reveals. */
export function CardBack() {
    return (
        <div className="nd-box">
        <div className="nd-card" style={{ '--type': '#1f6b44' }}>
            <div className="h-full rounded-[2.6cqi] grid place-items-center"
                style={{
                    background: 'radial-gradient(circle at 50% 45%, rgb(255 255 255 / 0.25), transparent 45%), repeating-linear-gradient(45deg, rgb(255 255 255 / 0.06) 0 4cqi, transparent 4cqi 8cqi), linear-gradient(160deg, #2f7d52, #0c2e1d 55%, #6b5320)',
                    boxShadow: '0 0 0 0.8cqi #e9c46a inset',
                }}>
                <div className="font-display font-semibold text-[#f4d88f] text-center" style={{ fontSize: '11cqi', lineHeight: 0.95, textShadow: '0 1cqi 4cqi rgb(0 20 10 / 0.6)' }}>
                    Nature<br />Dex
                </div>
            </div>
        </div>
        </div>
    );
}
