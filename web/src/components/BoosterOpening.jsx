import { GameCard } from './TcgCard.jsx';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { ART, Card, CardBack, useMyFrame } from './Card.jsx';
import { RARITIES } from '../game.jsx';
import { Pack } from './Pack.jsx';
import ShareButton from './ShareButton.jsx';
import { FavoriteStar } from './Favorite.jsx';
import { music, sfx } from '../sfx.js';

// Each rarity step adds an effect: halo → shockwave + sparks → light rays + tinted backdrop →
// flash + screen shake + golden rain → rainbow everything. `charge` is the suspense before the card flips.
// A secret first pretends to be a legendary, then its seal cracks three times (tap or wait) and shatters.
const FX = {
    common:    { level: 0, charge: 250, color: '#cfd6d1' },
    uncommon:  { level: 1, charge: 300, color: '#2fbf7a' },
    rare:      { level: 2, charge: 750, color: '#4ea8ff' },
    epic:      { level: 3, charge: 1200, color: '#b46bff' },
    legendary: { level: 4, charge: 3000, color: '#ffd84d' },
    secret:    { level: 5, charge: 3000, color: '#ff5fd2' },
};
const fxOf = (card) => FX[card?.rarity] || FX.common;
const RAINBOW = '#ff5fd2, #ffd36e, #7dffb0, #6ec8ff, #c18bff, #ff5fd2';
const RAINBOW_LIST = ['#ff5fd2', '#ffd36e', '#7dffb0', '#6ec8ff', '#c18bff'];
const SPARKS = [0, 0, 10, 18, 44, 72];
const CRACKS = 3;           // taps needed to break a secret's seal
const CRACK_AUTO = 1400;    // ms before the seal cracks on its own

// Card back that trembles harder and glows brighter while a big pull is charging. From legendary on,
// golden rays grow behind it and specks of light are sucked into the card.
function Charging({ fx }) {
    if (fx.level < 2) return null;
    const d = fx.charge / 1000;
    const color = fx.level === 5 ? `conic-gradient(from 0deg, ${RAINBOW})` : `radial-gradient(circle, ${fx.color}, transparent 65%)`;
    return (
        <>
            {fx.level >= 4 && (
                <motion.div className="absolute inset-[-120%] -z-20 pointer-events-none"
                    style={{
                        background: `repeating-conic-gradient(from 0deg, ${fx.color}aa 0deg 4deg, transparent 4deg 14deg)`,
                        maskImage: 'radial-gradient(circle, black 8%, transparent 55%)', WebkitMaskImage: 'radial-gradient(circle, black 8%, transparent 55%)',
                    }}
                    initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                    animate={{ opacity: [0, 0.3, 1], scale: [0.2, 0.6, 1.1], rotate: 120 }}
                    transition={{ duration: d, ease: 'easeIn' }} />
            )}
            <motion.div className="absolute inset-[-12%] -z-10 rounded-[30%] pointer-events-none"
                style={{ background: color, filter: `blur(${fx.level === 5 ? 28 : 22}px)` }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0.2, 0.9, 0.4, 1], scale: [0.7, 1 + fx.level * 0.06, 0.9, 1 + fx.level * 0.08], rotate: fx.level === 5 ? 360 : 0 }}
                transition={{ duration: d, ease: 'easeIn' }} />
            {fx.level >= 4 && <Implode fx={fx} />}
        </>
    );
}

function Implode({ fx }) {
    const n = 40, d = fx.charge / 1000;
    return (
        <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: n }, (_, i) => {
                const angle = i * 2.399; // golden angle: evenly scattered
                const dist = 230 + ((i * 61) % 7) * 30;
                const size = 3 + (i % 4) * 1.5;
                return (
                    <motion.span key={i} className="absolute left-1/2 top-1/2 rounded-full"
                        style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: '#fff6c9', boxShadow: `0 0 ${size * 3}px ${fx.color}` }}
                        initial={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0 }}
                        animate={{ x: 0, y: 0, opacity: [0, 1, 1, 0], scale: [1.4, 1, 0.3] }}
                        transition={{ duration: 0.8, delay: (i / n) * d * 0.85, ease: 'easeIn' }} />
                );
            })}
        </div>
    );
}

// Secret seal breaking: rainbow light leaking through cracks drawn over the card back.
const CRACK_PATHS = [
    ['M50 0 L46 22.4 L54 37.8 L47 54.6'],
    ['M47 54.6 L60 72.8 L40 98', 'M46 22.4 L0 42', 'M54 37.8 L100 35'],
    ['M40 98 L56 106.4 L50 140', 'M47 54.6 L0 77', 'M60 72.8 L100 81.2', 'M40 98 L0 109.2', 'M56 106.4 L100 114.8'],
];
function Cracks({ n }) {
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none"
            style={{ filter: 'drop-shadow(0 0 3px #fff) drop-shadow(0 0 8px #ff5fd2) drop-shadow(0 0 14px #6ec8ff)' }}>
            <defs>
                <linearGradient id="nd-crack" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="140">
                    {RAINBOW_LIST.map((c, i) => <stop key={c} offset={i / 4} stopColor={c} />)}
                </linearGradient>
            </defs>
            {CRACK_PATHS.slice(0, n).flat().map((d) => (
                <g key={d}>
                    <motion.path d={d} fill="none" stroke="url(#nd-crack)" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }} />
                    <motion.path d={d} fill="none" stroke="#fff" strokeWidth="0.4" strokeLinejoin="round" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }} />
                </g>
            ))}
        </svg>
    );
}
function CrackGlow({ n }) {
    return (
        <motion.div className="absolute inset-[-25%] -z-10 rounded-full pointer-events-none"
            style={{ background: `conic-gradient(from 0deg, ${RAINBOW})`, filter: 'blur(36px)' }}
            animate={{ opacity: 0.35 + n * 0.2, scale: 0.8 + n * 0.15, rotate: 360 }}
            transition={{ opacity: { duration: 0.3 }, scale: { type: 'spring', damping: 8 }, rotate: { duration: 4, repeat: Infinity, ease: 'linear' } }} />
    );
}

// The broken seal: the card back splits along the cracks and the pieces fly off.
const SHARDS = [
    [[0, 0], [50, 0], [46, 16], [0, 30]],
    [[50, 0], [100, 0], [100, 25], [54, 27], [46, 16]],
    [[0, 30], [46, 16], [54, 27], [47, 39], [0, 55]],
    [[54, 27], [100, 25], [100, 58], [60, 52], [47, 39]],
    [[0, 55], [47, 39], [60, 52], [40, 70], [0, 78]],
    [[60, 52], [100, 58], [100, 82], [56, 76], [40, 70]],
    [[0, 78], [40, 70], [56, 76], [50, 100], [0, 100]],
    [[56, 76], [100, 82], [100, 100], [50, 100]],
];
function Shards() {
    return SHARDS.map((pts, i) => {
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length - 50;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length - 50;
        return (
            <motion.div key={i} className="absolute inset-0 z-20 pointer-events-none"
                style={{ clipPath: `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(',')})` }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: cx * 9, y: cy * 9 + 120, rotate: (i % 2 ? 1 : -1) * (40 + i * 12), opacity: 0, scale: 0.8 }}
                transition={{ duration: 1.1, ease: [0.2, 0.7, 0.4, 1] }}>
                <CardBack />
            </motion.div>
        );
    });
}

// Screen-wide extras for legendary and secret pulls: slow god rays behind, a rain of gold or confetti in front.
function GodRays({ fx }) {
    const rainbow = fx.level === 5;
    return (
        <motion.div className="fixed left-1/2 top-[45%] w-[220vmax] h-[220vmax] -ml-[110vmax] -mt-[110vmax] pointer-events-none"
            style={{
                background: rainbow
                    ? `repeating-conic-gradient(from 0deg, #ff5fd255 0deg 5deg, transparent 5deg 12deg, #6ec8ff55 12deg 17deg, transparent 17deg 24deg, #ffd36e55 24deg 29deg, transparent 29deg 36deg)`
                    : `repeating-conic-gradient(from 0deg, ${fx.color}44 0deg 5deg, transparent 5deg 15deg)`,
                maskImage: 'radial-gradient(circle, black 2%, transparent 30%)', WebkitMaskImage: 'radial-gradient(circle, black 2%, transparent 30%)',
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1, rotate: rainbow ? -360 : 360 }}
            transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.9, ease: 'backOut' }, rotate: { duration: rainbow ? 30 : 45, repeat: Infinity, ease: 'linear' } }} />
    );
}
const STAR = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
function Rain({ fx }) {
    const rainbow = fx.level === 5;
    const n = rainbow ? 90 : 60;
    return (
        <div className="fixed inset-0 z-20 pointer-events-none overflow-hidden">
            {Array.from({ length: n }, (_, i) => {
                const x = (i * 37.3) % 100;
                const size = rainbow ? 7 + (i % 4) * 2 : 6 + (i % 5) * 2.5;
                const color = rainbow ? RAINBOW_LIST[i % 5] : ['#ffd84d', '#fff3c4', '#f2b630'][i % 3];
                const dur = 2.4 + (i % 7) * 0.35;
                return (
                    <motion.span key={i} className="absolute top-0"
                        style={{
                            left: `${x}%`, width: size, height: rainbow ? size * 0.55 : size, background: color,
                            clipPath: rainbow ? undefined : STAR, borderRadius: rainbow ? 2 : 0,
                            boxShadow: rainbow ? 'none' : `0 0 ${size}px ${color}`,
                        }}
                        initial={{ y: '-5vh', x: 0, rotate: 0, opacity: 0 }}
                        animate={{ y: '105vh', x: [0, (i % 2 ? 1 : -1) * 30, 0], rotate: (i % 2 ? 1 : -1) * (360 + i * 20), opacity: [0, 1, 1, 0.6] }}
                        transition={{ duration: dur, delay: 0.15 + (i % 12) * (rainbow ? 0.22 : 0.15), ease: 'linear', repeat: rainbow ? 1 : 0 }} />
                );
            })}
        </div>
    );
}

function Sparks({ fx }) {
    const n = SPARKS[fx.level];
    return Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
        const dist = 170 + ((i * 53) % 9) * 22 + fx.level * 18;
        const size = 4 + ((i * 7) % 5) + (fx.level >= 4 ? 3 : 0);
        const color = fx.level === 5 ? ['#ff5fd2', '#ffd36e', '#7dffb0', '#6ec8ff', '#c18bff'][i % 5] : fx.color;
        return (
            <motion.span key={i} className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: color, boxShadow: `0 0 ${size * 2}px ${color}` }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.3 }}
                transition={{ duration: 0.9 + (i % 4) * 0.25, ease: [0.1, 0.8, 0.3, 1], delay: (i % 6) * 0.03 }} />
        );
    });
}

function Burst({ fx }) {
    const { level, color } = fx;
    if (level === 0) return null;
    const rainbow = level === 5;
    return (
        <div className="absolute inset-0 pointer-events-none -z-10">
            {level >= 3 && (
                <motion.div className="absolute inset-[-70%]"
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: 1, scale: 1, rotate: 360 }}
                    transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.6, ease: 'backOut' }, rotate: { duration: rainbow ? 9 : 16, repeat: Infinity, ease: 'linear' } }}
                    style={{
                        background: rainbow
                            ? `repeating-conic-gradient(from 0deg, #ff5fd2aa 0deg 6deg, transparent 6deg 15deg, #6ec8ffaa 15deg 21deg, transparent 21deg 30deg, #ffd36eaa 30deg 36deg, transparent 36deg 45deg)`
                            : `repeating-conic-gradient(from 0deg, ${color}${level === 4 ? '77' : '44'} 0deg 7deg, transparent 7deg 20deg)`,
                        maskImage: 'radial-gradient(circle, black 15%, transparent 62%)',
                        WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 62%)',
                    }} />
            )}
            <motion.div className="absolute rounded-full"
                style={{ inset: `${-18 - Math.min(level, 4) * 8}%`, background: rainbow ? `conic-gradient(${RAINBOW})` : `radial-gradient(circle, ${color}, transparent 62%)`, filter: `blur(${rainbow ? 40 : 18}px)` }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.95, 0.3 + level * 0.07], scale: [0.4, 1.15, 1] }}
                transition={{ duration: 0.8 }} />
            {level >= 2 && Array.from({ length: level >= 5 ? 3 : level >= 4 ? 2 : 1 }, (_, i) => (
                <motion.span key={i} className="absolute left-1/2 top-1/2 w-[300px] h-[300px] -ml-[150px] -mt-[150px] rounded-full"
                    style={{ border: `${level >= 4 ? 6 : 3}px solid ${rainbow ? ['#ff5fd2', '#6ec8ff', '#ffd36e'][i] : color}`, boxShadow: `0 0 30px ${color}` }}
                    initial={{ scale: 0.3, opacity: 1 }}
                    animate={{ scale: 2.6 + level * 0.2, opacity: 0 }}
                    transition={{ duration: 1.1, delay: i * 0.22, ease: 'easeOut' }} />
            ))}
            <Sparks fx={fx} />
        </div>
    );
}

function FlipCard({ card, revealed, charging, cracks, onClick, demo }) {
    const frame = useMyFrame();
    const fx = fxOf(card);
    // a secret charges up disguised as a legendary
    const chargeFx = fx.level === 5 ? { ...FX.legendary, charge: fx.charge } : fx;
    const amp = chargeFx.level >= 3 ? chargeFx.level - 1.5 : 0;
    const shatter = fx.level === 5;
    const cracking = cracks > 0 && !revealed;
    const lifted = (charging || cracking) && chargeFx.level >= 4;
    return (
        <div className="relative w-[var(--deal-w)] cursor-pointer isolate" style={{ perspective: 1200 }} onClick={onClick}>
            {charging && <Charging fx={chargeFx} />}
            {cracking && <CrackGlow n={cracks} />}
            {revealed && <Burst fx={fx} />}
            <motion.div
                animate={{ y: lifted ? -16 : 0, scale: lifted ? 1.07 : 1 }}
                transition={lifted ? { duration: chargeFx.charge / 1000, ease: 'easeIn' } : { type: 'spring', damping: 12 }}>
            <motion.div
                animate={charging && amp ? { x: [0, -amp, amp, -amp * 1.6, amp * 1.6, -amp * 2.2, amp * 2.2, 0], rotate: [0, -1, 1, -1.5, 1.5, -2, 2, 0] } : { x: 0, rotate: 0 }}
                transition={charging && amp ? { duration: chargeFx.charge / 1000, ease: 'easeIn' } : { duration: 0.2 }}>
                <motion.div key={cracking ? cracks : 0}
                    animate={cracking ? { x: [0, -12, 11, -8, 6, -3, 0], rotate: [0, -3, 3, -2, 1, 0] } : { x: 0 }}
                    transition={{ duration: 0.4 }}>
                <motion.div
                    className="relative"
                    style={{ transformStyle: 'preserve-3d' }}
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: revealed ? 0 : 180, scale: revealed && fx.level >= 4 ? [shatter ? 1.35 : 1.3, 1] : 1 }}
                    // the secret's face is already there under the shattering back: no flip
                    transition={revealed && shatter
                        ? { rotateY: { duration: 0 }, scale: { type: 'spring', damping: 9, stiffness: 120 } }
                        : { duration: fx.level >= 4 ? 0.9 : 0.6, ease: [0.3, 1.2, 0.5, 1] }}
                >
                    <div style={{ backfaceVisibility: 'hidden' }}>
                        <Card card={card} tilt frame={demo ? undefined : frame} />
                    </div>
                    <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                        <CardBack />
                        {cracking && <Cracks n={cracks} />}
                    </div>
                </motion.div>
                </motion.div>
            </motion.div>
            </motion.div>
            {revealed && shatter && <Shards />}
            {revealed && card.isNew && (
                <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -8 }} transition={{ delay: 0.35, type: 'spring' }}
                    className="absolute -top-3 -left-3 z-10 px-3 py-1 rounded-full bg-[#e76f51] text-white text-xs font-black uppercase tracking-wider shadow-lg">
                    Nouveau !
                </motion.span>
            )}
            {revealed && !demo && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45, type: 'spring' }} className="absolute -bottom-3 -left-3 z-10">
                    <FavoriteStar card={card} />
                </motion.div>
            )}
        </div>
    );
}

// Drag the card sideways to move on, like a tap. Each card gets its own motion value so the
// leaving card and the arriving one never share a position. Like a real hand of cards: the top
// one is tossed aside on an arc and the next is already waiting underneath, face down.
const STACK = [{ y: 0, scale: 1, rotate: 0 }, { y: 10, scale: 0.95, rotate: -2.5 }, { y: 20, scale: 0.9, rotate: 2 }];
const SWIPE_EXIT = {
    exit: (dir) => ({
        x: dir * 560, y: 70, rotate: dir * 32, opacity: [1, 1, 0], zIndex: 30,
        transition: { duration: 0.5, ease: [0.25, 0.7, 0.45, 1], opacity: { duration: 0.5, times: [0, 0.7, 1] } },
    }),
};
function SwipeCard({ children, onSwipe, draggedRef }) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-220, 220], [-14, 14]);
    return (
        <motion.div style={{ x, rotate }} className="absolute inset-0 z-10 touch-pan-y"
            drag="x" dragSnapToOrigin dragElastic={0.7} dragConstraints={{ left: 0, right: 0 }}
            onDragStart={() => { draggedRef.current = true; }}
            onDragEnd={(_, info) => {
                const dx = info.offset.x;
                if (Math.abs(dx) > 80 || Math.abs(info.velocity.x) > 500) onSwipe(Math.sign(dx || info.velocity.x));
                setTimeout(() => { draggedRef.current = false; }, 0);
            }}
            initial={STACK[1]}
            animate={{ ...STACK[0], transition: { type: 'spring', stiffness: 260, damping: 24 } }}
            variants={SWIPE_EXIT} exit="exit">
            {children}
        </motion.div>
    );
}

// Title that slams in letter by letter.
function Letters({ text, className, delay = 0 }) {
    return (
        <div className={`font-display font-black uppercase tracking-[0.06em] leading-tight whitespace-nowrap mb-1 ${className}`} aria-label={text}>
            {[...text].map((ch, i) => (
                <motion.span key={i} className="inline-block" aria-hidden
                    initial={{ opacity: 0, y: -40, scale: 2.2, rotate: (i % 2 ? 1 : -1) * 25 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 8, stiffness: 220, delay: delay + i * 0.045 }}>
                    {ch === ' ' ? ' ' : ch}
                </motion.span>
            ))}
        </div>
    );
}

function RarityBanner({ card, demo }) {
    const fx = fxOf(card);
    const r = RARITIES[card.rarity];
    if (fx.level === 5) return (
        <motion.div initial={{ opacity: 0, scale: 2.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 120, delay: 0.25 }}>
            <Letters text="✦ Carte secrète ✦" className="nd-secret-text text-2xl sm:text-4xl" delay={0.35} />
            <div className="text-white/80 text-sm mt-1 [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]">Environ 1 booster sur 500 en cache une. Touche ou glisse pour continuer</div>
            {!demo && <ShareButton card={card} className="mt-3" />}
        </motion.div>
    );
    return (
        <motion.div initial={{ opacity: 0, y: 6, scale: fx.level >= 4 ? 1.8 : 1 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={fx.level >= 4 ? { type: 'spring', damping: 10, stiffness: 140, delay: 0.2 } : { duration: 0.3 }}>
            {fx.level >= 4 ? <Letters text={`${r.symbol} ${r.label} !`} className="nd-legend-text text-3xl sm:text-5xl" delay={0.3} /> : (
                <div className={`font-display font-bold ${fx.level >= 3 ? 'text-3xl' : 'text-2xl'}`}
                    style={{ color: fx.level ? fx.color : '#e7ece8', textShadow: fx.level >= 2 ? `0 0 ${fx.level * 8}px ${fx.color}` : 'none' }}>
                    {r.symbol} {r.label}
                </div>
            )}
            {ART[card.art] && <div className="nd-art-banner" data-gold={card.art === 'gold' ? '' : undefined}>✦ {ART[card.art]} ✦</div>}
            <div className="text-white/60 text-sm">Touche ou glisse la carte pour continuer</div>
            {!demo && <ShareButton card={card} className="mt-3" />}
        </motion.div>
    );
}

// A booster still being revealed survives a reload or a discarded tab: the cards are already in the
// collection, so the player gets back to the card they stopped at instead of losing the reveal.
const PENDING_KEY = 'naturdex.pendingBooster';
const PENDING_MS = 7 * 24 * 3600 * 1000;
export function pendingBooster(owner) {
    try {
        const p = JSON.parse(localStorage.getItem(PENDING_KEY));
        if (p && p.owner === owner && Date.now() - p.at < PENDING_MS && p.cards?.length) return p;
    } catch { /* corrupted entry: ignore */ }
    return null;
}
const sameCards = (a, b) => a.length === b.length && a.every((c, i) => c.id === b[i].id);

export default function BoosterOpening({ cards, bonus, godPack, onClose, onAgain, canOpenAgain, demo, owner }) {
    const frame = useMyFrame();
    const [resumeAt] = useState(() => {
        const p = !demo && owner != null && pendingBooster(owner);
        return p && sameCards(p.cards, cards) ? Math.min(p.index, cards.length - 1) : null;
    });
    const [stage, setStage] = useState(resumeAt == null ? 'pack' : 'reveal'); // pack → reveal → summary
    const [index, setIndex] = useState(resumeAt ?? 0);
    const [revealed, setRevealed] = useState(false);
    const [cracks, setCracks] = useState(0); // secret only: 1..CRACKS while its seal breaks
    const [dir, setDir] = useState(-1); // which side the current card flies off to
    const dragged = useRef(false);
    const lastCrack = useRef(0);

    const current = cards[index];

    useEffect(() => {
        if (demo || owner == null) return;
        if (stage === 'summary') localStorage.removeItem(PENDING_KEY);
        else localStorage.setItem(PENDING_KEY, JSON.stringify({ owner, cards, index, at: Date.now() }));
    }, [demo, owner, cards, stage, index]);
    function close() {
        if (!demo) localStorage.removeItem(PENDING_KEY);
        onClose();
    }
    const fx = stage === 'reveal' ? fxOf(current) : FX.common;

    useEffect(() => {
        if (stage !== 'reveal') return;
        setRevealed(false);
        setCracks(0);
        const f = fxOf(cards[index]);
        // a secret sounds like a legendary until its seal cracks
        if (f.level >= 2) sfx.charge(Math.min(f.level, 4), f.charge);
        const t = setTimeout(() => (f.level === 5 ? setCracks(1) : setRevealed(true)), f.charge);
        return () => clearTimeout(t);
    }, [stage, index, cards]);

    // each crack: sound + shake; after the last one (tapped or waited for) the seal shatters
    useEffect(() => {
        if (!cracks || revealed) return;
        if (cracks > CRACKS) return setRevealed(true);
        lastCrack.current = Date.now();
        sfx.crack(cracks);
        const t = setTimeout(() => setCracks((c) => c + 1), CRACK_AUTO);
        return () => clearTimeout(t);
    }, [cracks, revealed]);

    useEffect(() => {
        if (stage !== 'reveal' || !revealed) return;
        sfx.flip();
        sfx.reveal(cards[index].rarity);
        if (!cards[index].isNew) return;
        const t = setTimeout(sfx.newCard, 380);
        return () => clearTimeout(t);
    }, [stage, revealed, index, cards]);
    useEffect(() => { const release = music.duck(); return () => { release(); sfx.stop(); }; }, []);

    function next(side = -1) {
        // big pulls keep their suspense: no skipping the charge
        if (!revealed) {
            if (cracks) return Date.now() - lastCrack.current > 280 && setCracks((c) => c + 1);
            return fx.level < 2 && setRevealed(true);
        }
        setDir(side);
        sfx.swish(side * 0.4);
        if (index + 1 < cards.length) setIndex(index + 1);
        else setStage('summary');
    }

    const charging = stage === 'reveal' && !revealed && !cracks && fx.level >= 2;
    const cracking = stage === 'reveal' && !revealed && cracks > 0;
    const lit = stage === 'reveal' && revealed && fx.level >= 3;
    const grand = stage === 'reveal' && revealed && fx.level >= 4;

    return (
        <motion.div className="fixed inset-0 z-[60] bg-[#04100a]/95 backdrop-blur-sm overflow-y-auto overflow-x-hidden"
            // card as big as the screen allows, leaving room for the banner below
            style={{ '--deal-w': 'clamp(220px, min(84vw, 360px, calc((100dvh - 260px) / 1.4)), 360px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* backdrop: dims while charging, then floods with the rarity colour */}
            <motion.div className="fixed inset-0 pointer-events-none"
                animate={{ opacity: charging ? 0.85 : cracking ? 1 : lit ? 1 : 0 }} transition={{ duration: charging ? fx.charge / 1000 : 0.6 }}
                style={{
                    background: charging ? '#000'
                        : cracking ? `radial-gradient(${20 + cracks * 12}% ${20 + cracks * 12}% at 50% 45%, rgb(255 95 210 / ${0.1 + cracks * 0.08}), rgb(110 200 255 / 0.08) 60%, transparent), #000`
                        : fx.level === 5 ? 'radial-gradient(60% 60% at 50% 45%, rgb(255 95 210 / 0.35), transparent), conic-gradient(from 90deg at 50% 45%, rgb(110 200 255 / 0.25), rgb(255 211 110 / 0.22), rgb(125 255 176 / 0.22), rgb(193 139 255 / 0.28), rgb(110 200 255 / 0.25))'
                        : `radial-gradient(55% 55% at 50% 45%, ${fx.color}${fx.level >= 4 ? '55' : '33'}, transparent)`,
                }} />
            {grand && <GodRays key={`rays-${index}`} fx={fx} />}
            {grand && <Rain key={`rain-${index}`} fx={fx} />}
            <AnimatePresence>
                {cracking && (
                    <motion.div key={`crack-${cracks}`} className="fixed inset-0 z-20 pointer-events-none"
                        style={{ background: 'radial-gradient(circle at 50% 45%, #fff, rgb(255 95 210 / 0.5) 30%, transparent 70%)' }}
                        initial={{ opacity: 0.25 + cracks * 0.15 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} />
                )}
                {stage === 'reveal' && revealed && fx.level >= 4 && (
                    <motion.div key={`flash-${index}`} className="fixed inset-0 z-20 pointer-events-none"
                        style={{ background: fx.level === 5 ? 'radial-gradient(circle, #fff, #ffd6f4 40%, #c9e9ff)' : `radial-gradient(circle, #fff, ${fx.color})` }}
                        initial={{ opacity: 1 }} animate={{ opacity: fx.level === 5 ? [1, 0.2, 1, 0.3, 0.8, 0] : [1, 0.3, 0.8, 0] }} exit={{ opacity: 0 }}
                        transition={{ duration: fx.level === 5 ? 1.6 : 1, ease: 'easeOut' }} />
                )}
            </AnimatePresence>
            <button onClick={close} className="absolute top-4 right-4 z-10 p-2 rounded-full text-paper/70 hover:text-paper hover:bg-white/10" title="Fermer">
                <X className="w-6 h-6" />
            </button>

            <div className="min-h-full flex flex-col items-center justify-center px-4 pt-14 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <AnimatePresence mode="wait">
                    {stage === 'pack' && (
                        <motion.div key="pack" className="flex flex-col items-center gap-8"
                            exit={{ scale: 1.4, opacity: 0, filter: 'brightness(3)' }} transition={{ duration: 0.35 }}>
                            <motion.button
                                onClick={() => { sfx.tear(); setStage('reveal'); }}
                                className="w-[220px] sm:w-[250px]"
                                animate={{ rotate: [0, -2, 2, -2, 0], y: [0, -4, 0] }}
                                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6 }}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <div style={godPack ? { filter: 'drop-shadow(0 0 28px rgb(255 197 61 / 0.9)) drop-shadow(0 0 60px rgb(255 95 210 / 0.5))' } : undefined}><Pack /></div>
                            </motion.button>
                            {godPack && (
                                <motion.div className="text-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: [0.6, 1.15, 1] }} transition={{ duration: 0.8 }}>
                                    <p className="font-display text-4xl font-bold nd-grad-text">God pack !</p>
                                    <p className="text-paper/80 text-sm mt-1">1 booster sur 3 500 : que des légendaires, une Full art, une Illustration et une secrète.</p>
                                </motion.div>
                            )}
                            <p className="font-display text-paper text-xl italic">Touche le booster pour le déchirer</p>
                        </motion.div>
                    )}

                    {stage === 'reveal' && current && (
                        <motion.div key="reveal" className="relative flex flex-col items-center gap-4" initial={{ opacity: 0, y: 30 }}
                            animate={revealed && fx.level >= 4
                                ? { opacity: 1, y: fx.level === 5 ? [0, 14, -10, 8, -5, 2, 0] : [0, 8, -6, 4, 0], x: fx.level === 5 ? [0, -22, 20, -16, 12, -8, 5, -2, 0] : [0, -16, 14, -10, 7, -3, 0] }
                                : { opacity: 1, y: 0, x: 0 }}
                            transition={{ x: { duration: fx.level === 5 ? 1 : 0.7 }, y: { duration: fx.level === 5 ? 1 : 0.7 } }}>
                            <div className="flex gap-1.5">
                                {cards.map((c, i) => (
                                    <span key={i} className={`h-1.5 w-6 rounded-full transition-colors ${i < index ? 'bg-[#e9c46a]' : i === index ? 'bg-white' : 'bg-white/20'}`} />
                                ))}
                            </div>
                            <div className="relative w-[var(--deal-w)] aspect-[5/7]">
                                {/* face-down cards still to come, peeking out under the current one */}
                                <AnimatePresence>
                                    {cards.slice(index + 1, index + 3).map((_, i) => (
                                        <motion.div key={index + 1 + i} className="absolute inset-0 pointer-events-none"
                                            initial={{ ...STACK[i + 2] || STACK[2], opacity: 0 }}
                                            animate={{ ...STACK[i + 1], opacity: 1 }}
                                            exit={{ opacity: 0, transition: { duration: 0 } }}
                                            transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                                            <CardBack />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                <AnimatePresence custom={dir}>
                                    <SwipeCard key={index} onSwipe={next} draggedRef={dragged}>
                                        <FlipCard card={current} revealed={revealed} charging={charging} cracks={cracks} demo={demo} onClick={() => !dragged.current && next()} />
                                    </SwipeCard>
                                </AnimatePresence>
                            </div>
                            <div className="relative z-10 min-h-16 text-center">
                                {revealed ? <RarityBanner key={index} card={current} demo={demo} /> : cracking ? (
                                    <motion.div key={cracks} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 10 }}>
                                        <p className="nd-secret-text font-display font-black text-2xl">
                                            {['Attends… ce n\'est pas une légendaire !', 'Le sceau se fissure…', 'Encore un coup !'][cracks - 1]}
                                        </p>
                                        <p className="text-white/70 text-sm mt-1">Touche la carte pour briser le sceau</p>
                                    </motion.div>
                                ) : charging && (
                                    <motion.p className="font-display italic text-lg" style={{ color: fx.color }}
                                        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }}>
                                        {fx.level >= 4 ? 'Quelque chose d\'incroyable arrive…' : 'Oh… cette carte brille !'}
                                    </motion.p>
                                )}
                            </div>
                            <button onClick={() => { sfx.stop(); sfx.swish(0); setStage('summary'); }} className="text-paper/60 text-sm underline hover:text-paper">Tout révéler</button>
                        </motion.div>
                    )}

                    {stage === 'summary' && (
                        <motion.div key="summary" className="w-full max-w-5xl flex flex-col items-center gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h2 className="font-display text-paper text-3xl font-bold text-center">
                                {godPack ? <span className="nd-grad-text">God pack : 6 cartes de légende !</span> : demo ? <>Joli tirage ! <span className="nd-grad-text">Garde-le pour de vrai.</span></> : <>{cards.filter((c) => c.isNew).length} nouvelle{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} espèce{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} !</>}
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
                                {cards.map((card, i) => (
                                    <motion.div key={i} className={`relative ${card.rarity === 'secret' ? 'nd-secret-glow' : card.rarity === 'legendary' ? 'nd-legend-glow' : card.rarity === 'epic' ? 'nd-epic-glow' : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                                        {demo ? <Card card={card} /> : <Link to={`/carte/${card.id}`}><Card card={card} frame={frame} /></Link>}
                                        {card.isNew && <span className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-rust text-paper text-[10px] font-black uppercase">Nouveau</span>}
                                        {!demo && <ShareButton card={card} compact className="absolute -bottom-2 -right-2 z-10" />}
                                        {!demo && <FavoriteStar card={card} className="absolute -bottom-2 -left-2 z-10 !w-9 !h-9" />}
                                    </motion.div>
                                ))}
                            </div>
                            {bonus && (
                                <motion.div className="flex items-center gap-4 p-3 pr-5 rounded-2xl bg-white/[0.06] border border-[#f4d88f]/30" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: cards.length * 0.07 + 0.2 }}>
                                    <GameCard card={bonus} size="hand" />
                                    <div className="text-paper">
                                        <p className="text-[11px] uppercase tracking-wider font-black text-[#f4d88f]">Énergie bonus · Duel de cartes</p>
                                        <p className="font-display text-lg font-semibold">{bonus.name}</p>
                                        <Link to="/duel/deck" className="text-sm text-paper/70 underline hover:text-paper">Ajouter à mon deck</Link>
                                    </div>
                                </motion.div>
                            )}
                            <div className="flex flex-wrap justify-center gap-3">
                                {canOpenAgain && (
                                    <button onClick={onAgain} className={`px-6 py-3 rounded-full font-bold ${demo ? 'border border-paper/30 text-paper hover:bg-white/10' : 'nd-btn'}`}>
                                        {demo ? 'Rouvrir un booster' : 'Ouvrir un autre booster'}
                                    </button>
                                )}
                                {demo ? (
                                    <Link to="/connexion?mode=register" className="px-6 py-3 rounded-full nd-btn font-bold">
                                        Garder mes cartes — créer un compte
                                    </Link>
                                ) : (
                                    <Link to="/collection" className="px-6 py-3 rounded-full border border-paper/30 text-paper font-semibold hover:bg-white/10">
                                        Voir ma collection
                                    </Link>
                                )}
                                <button onClick={close} className="px-6 py-3 rounded-full text-paper/70 hover:text-paper">Fermer</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
