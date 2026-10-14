import { useRef } from 'react';
import { Eye, HelpCircle } from 'lucide-react';
import { RARITIES, TYPES, attacksFor, formatViews } from '../game.jsx';

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

/** Full card. `card` comes from the catalog (light) or the API (full). */
export function Card({ card, number, total, tilt = false, className = '' }) {
    const ref = useRef(null);
    const t = TYPES[card.type] || TYPES.plant;
    const r = RARITIES[card.rarity] || RARITIES.common;
    const hp = card.hp ?? card.stats?.hp;
    const foil = card.rarity === 'epic' || card.rarity === 'legendary';

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
            style={{ '--type': t.color }}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
        >
            <div className="nd-card-inner">
                <div className="flex items-start justify-between gap-[2cqi]">
                    <div className="nd-name line-clamp-2 min-w-0 break-words">{card.name}</div>
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
                    <span className="shrink-0 font-semibold" style={{ color: `color-mix(in oklab, ${r.color} 72%, black)` }}>{t.label}</span>
                </div>
                <div className="mt-[1.5cqi]">
                    {attacksFor(card).map((a) => (
                        <div key={a.name} className="nd-attack">
                            <span className="nd-type-icon !w-[5cqi] !h-[5cqi]" style={{ '--type': t.color }} />
                            <b>{a.name}</b>
                            <span>{a.dmg}</span>
                        </div>
                    ))}
                </div>
                <div className="nd-foot">
                    <span className="flex items-center gap-[1cqi]" title="Lectures Wikipédia par an (estimation)">
                        {card.views != null && <><Eye className="w-[3.6cqi] h-[3.6cqi]" />{formatViews(Number(card.views))}</>}
                    </span>
                    <span className="font-bold tracking-wide" style={{ color: `color-mix(in oklab, ${r.color} 72%, black)` }} title={r.label}>
                        {r.symbol} {r.label}
                    </span>
                    {number != null && <span>{String(number).padStart(3, '0')}/{total}</span>}
                </div>
            </div>
        </div>
        </div>
    );
}

export function MysteryCard({ card, number }) {
    const t = TYPES[card.type] || TYPES.plant;
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
