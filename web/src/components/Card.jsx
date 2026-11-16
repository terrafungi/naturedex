import { useEffect, useRef } from 'react';
import { Camera, Eye, HelpCircle, MapPin, Sparkles, Zap } from 'lucide-react';
import { RARITIES, TYPES, formatViews } from '../game.jsx';
import { useGame } from '../api.jsx';
import { ABILITIES, battleStats } from '../battle.js';
import { TRAINERS } from '../tcg.js';
import { KIND_LABEL } from './TcgCard.jsx';

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

// Full art pictures cover the whole card: a 500px thumbnail looks blurry there, ask Wikimedia for a bigger one.
const sharper = (url) => url?.replace(/\/\d+px-([^/]+)$/, '/960px-$1');

// Special finish (cards.art): 'full' / 'illus' = the picture fills the whole card and the text sits
// on top of it; 'holo' = the regular layout with a holographic foil (some commons and uncommons);
// 'gold' = the regular layout, all in gold: frame, background and a gilded photo (some rares and up).
export const ART = { full: 'Full art', illus: 'Illustration', holo: 'Holo', gold: 'Gold' };

/** The signed-in player's card frame (honey shop), for their own cards. */
/** The Duel effect of a Naturaliste card (type 'naturalist'), by its trainer key or its name. */
export const trainerOf = (card) => (card.type === 'naturalist'
    ? TRAINERS[card.stats?.trainer] || Object.values(TRAINERS).find((t) => t.name === card.name) : null);

export const useMyFrame = () => useGame()?.user?.avatar?.frame;

/** Full card. `card` comes from the catalog (light) or the API (full). `frame`: the owner's
 * honey-shop card frame (index.css), the rarity then shows as a thin ring inside it. */
export function Card({ card, number, total, tilt = false, className = '', frame }) {
    const ref = useRef(null);
    const t = TYPES[card.type] || TYPES.plant;
    const r = RARITIES[card.rarity] || RARITIES.common;
    const hp = card.hp ?? card.stats?.hp;
    const st = card.atk != null ? card : card.stats?.atk != null ? card.stats : battleStats(card);
    const ab = ABILITIES[card.type];
    const art = ART[card.art];
    const bleed = art && card.art !== 'holo' && card.art !== 'gold';
    const foil = art || ['epic', 'legendary', 'secret'].includes(card.rarity);
    const ink = card.art === 'gold' ? '#7a5310' : bleed || card.rarity === 'secret' ? r.color : `color-mix(in oklab, ${r.color} 72%, black)`;
    const trainer = trainerOf(card);
    const fact = bleed || trainer ? null : card.fact;
    // where the subject sits in the photo (computed once per card): the 4:3 window crops around it
    const focus = card.focus || card.stats?.focus;
    const zoom = Number(card.zoom || card.stats?.zoom) || 1;
    // scaling around the focus point keeps it in place (matches cover() in showcase.js)
    const framing = focus || zoom > 1 ? {
        objectPosition: focus ? `${focus[0]}% ${focus[1]}%` : undefined,
        transform: zoom > 1 ? `scale(${zoom})` : undefined,
        transformOrigin: focus ? `${focus[0]}% ${focus[1]}%` : undefined,
    } : undefined;

    // Tilt mode (card sheet, booster): the card follows the finger / mouse in 3D on a spring, like a
    // real foil card turned in the light, then wobbles back flat when let go.
    const spring = useRef(null);
    useEffect(() => () => cancelAnimationFrame(spring.current?.raf), []);

    function step() {
        const s = spring.current;
        const el = ref.current;
        if (!el) return;
        let moving = false;
        for (const k of ['x', 'y', 'a']) {
            s.v[k] = (s.v[k] + (s.t[k] - s.p[k]) * 0.09) * 0.8;
            s.p[k] += s.v[k];
            if (Math.abs(s.v[k]) > 0.0005 || Math.abs(s.t[k] - s.p[k]) > 0.0005) moving = true;
        }
        const { x, y, a } = s.p;
        el.style.transform = `perspective(1000px) rotateY(${x * 22}deg) rotateX(${-y * 16}deg) scale(${1 + a * 0.04})`;
        el.style.setProperty('--mx', `${50 + x * 50}%`);
        el.style.setProperty('--my', `${50 + y * 50}%`);
        el.style.setProperty('--act', Math.max(0, a).toFixed(3));
        if (moving) s.raf = requestAnimationFrame(step);
        else {
            s.raf = null;
            s.p = { ...s.t };
            if (!s.t.a) el.style.transform = '';
        }
    }
    function aim(x, y, a) {
        const s = spring.current ||= { p: { x: 0, y: 0, a: 0 }, v: { x: 0, y: 0, a: 0 }, t: {}, raf: null };
        s.t = { x, y, a };
        if (!s.raf) s.raf = requestAnimationFrame(step);
    }

    function onMove(e) {
        if (!foil && !tilt) return;
        const el = ref.current;
        const box = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
        const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
        if (tilt && !matchMedia('(prefers-reduced-motion: reduce)').matches) return aim(x * 2 - 1, y * 2 - 1, 1);
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
        el.style.setProperty('--act', '1'); // the foil only shows while the card is handled
    }
    function onLeave() {
        if (tilt && spring.current) aim(0, 0, 0);
        else ref.current?.style.setProperty('--act', '0');
    }

    return (
        <div className="nd-box">
        <div
            ref={ref}
            className={`nd-card ${tilt ? '' : 'transition-transform duration-200 ease-out'} ${className}`}
            data-tilt={tilt ? '' : undefined}
            data-rarity={card.rarity}
            data-fact={fact ? '' : undefined}
            data-art={bleed ? card.art : undefined}
            data-holo={card.art === 'holo' ? '' : undefined}
            data-gold={card.art === 'gold' ? '' : undefined}
            data-frame={frame && frame !== 'aucun' ? frame : undefined}
            style={{ '--type': t.color }}
            onPointerDown={onMove}
            onPointerMove={onMove}
            onPointerUp={(e) => e.pointerType !== 'mouse' && onLeave()}
            onPointerCancel={onLeave}
            onPointerLeave={onLeave}
        >
            {tilt && <div className="nd-glare" aria-hidden />}
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
                    <img src={bleed ? sharper(card.thumb_url) : card.thumb_url} alt={card.name} loading="lazy" draggable="false" onError={fallbackToOriginal}
                        style={framing} />
                </div>
                <div className="nd-strip">
                    <span className="nd-sci">{card.sci_name || t.label}</span>
                    <span className="shrink-0 font-semibold" style={{ color: ink }}>{t.label}</span>
                </div>
                {trainer ? (
                    <div className="nd-effect">
                        <b>{KIND_LABEL[trainer.kind]}</b>
                        <p>{trainer.text}</p>
                    </div>
                ) : (
                    <div className="nd-stats">
                        <span title="Attaque"><small>ATQ</small>{st.atk}</span>
                        <span title="Défense"><small>DÉF</small>{st.def}</span>
                        <span title="Vitesse : la plus rapide agit en premier"><small>VIT</small>{st.spd}</span>
                    </div>
                )}
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
                        {card.views != null && !trainer && <><Eye className="w-[3.6cqi] h-[3.6cqi]" />{formatViews(Number(card.views))}</>}
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
