import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { ART, Card, CardBack } from './Card.jsx';
import { RARITIES } from '../game.jsx';
import { Pack } from './Pack.jsx';
import ShareButton from './ShareButton.jsx';
import { FavoriteStar } from './Favorite.jsx';
import { music, sfx } from '../sfx.js';

// Each rarity step adds an effect: halo → shockwave + sparks → light rays + tinted backdrop →
// flash + screen shake → rainbow everything. `charge` is the suspense before the card flips.
const FX = {
    common:    { level: 0, charge: 250, color: '#cfd6d1' },
    uncommon:  { level: 1, charge: 300, color: '#2fbf7a' },
    rare:      { level: 2, charge: 750, color: '#4ea8ff' },
    epic:      { level: 3, charge: 1200, color: '#b46bff' },
    legendary: { level: 4, charge: 1700, color: '#ffd84d' },
    secret:    { level: 5, charge: 2700, color: '#ff5fd2' },
};
const fxOf = (card) => FX[card?.rarity] || FX.common;
const RAINBOW = '#ff5fd2, #ffd36e, #7dffb0, #6ec8ff, #c18bff, #ff5fd2';
const SPARKS = [0, 0, 10, 18, 30, 56];

// Card back that trembles harder and glows brighter while a big pull is charging.
function Charging({ fx }) {
    if (fx.level < 2) return null;
    const color = fx.level === 5 ? `conic-gradient(from 0deg, ${RAINBOW})` : `radial-gradient(circle, ${fx.color}, transparent 65%)`;
    return (
        <motion.div className="absolute inset-[-12%] -z-10 rounded-[30%] pointer-events-none"
            style={{ background: color, filter: `blur(${fx.level === 5 ? 28 : 22}px)` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0.2, 0.9, 0.4, 1], scale: [0.7, 1 + fx.level * 0.06, 0.9, 1 + fx.level * 0.08], rotate: fx.level === 5 ? 360 : 0 }}
            transition={{ duration: fx.charge / 1000, ease: 'easeIn' }} />
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

function FlipCard({ card, revealed, charging, onClick, demo }) {
    const fx = fxOf(card);
    const amp = fx.level >= 3 ? fx.level - 1.5 : 0;
    return (
        <div className="relative w-[var(--deal-w)] cursor-pointer isolate" style={{ perspective: 1200 }} onClick={onClick}>
            {charging && <Charging fx={fx} />}
            {revealed && <Burst fx={fx} />}
            <motion.div
                animate={charging && amp ? { x: [0, -amp, amp, -amp * 1.6, amp * 1.6, -amp * 2.2, amp * 2.2, 0], rotate: [0, -1, 1, -1.5, 1.5, -2, 2, 0] } : { x: 0, rotate: 0 }}
                transition={charging && amp ? { duration: fx.charge / 1000, ease: 'easeIn' } : { duration: 0.2 }}>
                <motion.div
                    className="relative"
                    style={{ transformStyle: 'preserve-3d' }}
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: revealed ? 0 : 180, scale: revealed && fx.level >= 4 ? [1.18, 1] : 1 }}
                    transition={{ duration: fx.level >= 4 ? 0.8 : 0.6, ease: [0.3, 1.2, 0.5, 1] }}
                >
                    <div style={{ backfaceVisibility: 'hidden' }}>
                        <Card card={card} tilt />
                    </div>
                    <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                        <CardBack />
                    </div>
                </motion.div>
            </motion.div>
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

function RarityBanner({ card, demo }) {
    const fx = fxOf(card);
    const r = RARITIES[card.rarity];
    if (fx.level === 5) return (
        <motion.div initial={{ opacity: 0, scale: 2.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 9, stiffness: 120, delay: 0.25 }}>
            <div className="nd-secret-text font-display text-3xl sm:text-4xl font-black uppercase tracking-[0.08em]">✦ Carte secrète ✦</div>
            <div className="text-white/80 text-sm mt-1 [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]">Environ 1 booster sur 500 en cache une. Touche ou glisse pour continuer</div>
            {!demo && <ShareButton card={card} className="mt-3" />}
        </motion.div>
    );
    return (
        <motion.div initial={{ opacity: 0, y: 6, scale: fx.level >= 4 ? 1.8 : 1 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={fx.level >= 4 ? { type: 'spring', damping: 10, stiffness: 140, delay: 0.2 } : { duration: 0.3 }}>
            <div className={`font-display font-bold ${fx.level >= 4 ? 'text-4xl' : fx.level >= 3 ? 'text-3xl' : 'text-2xl'}`}
                style={{ color: fx.level ? fx.color : '#e7ece8', textShadow: fx.level >= 2 ? `0 0 ${fx.level * 8}px ${fx.color}` : 'none' }}>
                {r.symbol} {r.label}{fx.level >= 4 ? ' !' : ''}
            </div>
            {ART[card.art] && <div className="nd-art-banner">✦ {ART[card.art]} ✦</div>}
            <div className="text-white/60 text-sm">Touche ou glisse la carte pour continuer</div>
            {!demo && <ShareButton card={card} className="mt-3" />}
        </motion.div>
    );
}

export default function BoosterOpening({ cards, onClose, onAgain, canOpenAgain, demo }) {
    const [stage, setStage] = useState('pack'); // pack → reveal → summary
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [dir, setDir] = useState(-1); // which side the current card flies off to
    const dragged = useRef(false);

    const current = cards[index];
    const fx = stage === 'reveal' ? fxOf(current) : FX.common;

    useEffect(() => {
        if (stage !== 'reveal') return;
        setRevealed(false);
        const f = fxOf(cards[index]);
        if (f.level >= 2) sfx.charge(f.level, f.charge);
        const t = setTimeout(() => setRevealed(true), f.charge);
        return () => clearTimeout(t);
    }, [stage, index, cards]);

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
        if (!revealed) return fx.level < 2 && setRevealed(true);
        setDir(side);
        sfx.swish(side * 0.4);
        if (index + 1 < cards.length) setIndex(index + 1);
        else setStage('summary');
    }

    const charging = stage === 'reveal' && !revealed && fx.level >= 2;
    const lit = stage === 'reveal' && revealed && fx.level >= 3;

    return (
        <motion.div className="fixed inset-0 z-[60] bg-[#04100a]/95 backdrop-blur-sm overflow-y-auto overflow-x-hidden"
            // card as big as the screen allows, leaving room for the banner below
            style={{ '--deal-w': 'clamp(220px, min(84vw, 360px, calc((100dvh - 260px) / 1.4)), 360px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* backdrop: dims while charging, then floods with the rarity colour */}
            <motion.div className="fixed inset-0 pointer-events-none"
                animate={{ opacity: charging ? 0.85 : lit ? 1 : 0 }} transition={{ duration: charging ? fx.charge / 1000 : 0.6 }}
                style={{
                    background: charging ? '#000'
                        : fx.level === 5 ? 'radial-gradient(60% 60% at 50% 45%, rgb(255 95 210 / 0.35), transparent), conic-gradient(from 90deg at 50% 45%, rgb(110 200 255 / 0.25), rgb(255 211 110 / 0.22), rgb(125 255 176 / 0.22), rgb(193 139 255 / 0.28), rgb(110 200 255 / 0.25))'
                        : `radial-gradient(55% 55% at 50% 45%, ${fx.color}${fx.level >= 4 ? '55' : '33'}, transparent)`,
                }} />
            <AnimatePresence>
                {stage === 'reveal' && revealed && fx.level >= 4 && (
                    <motion.div key={`flash-${index}`} className="fixed inset-0 z-20 pointer-events-none"
                        style={{ background: fx.level === 5 ? 'radial-gradient(circle, #fff, #ffd6f4 40%, #c9e9ff)' : `radial-gradient(circle, #fff, ${fx.color})` }}
                        initial={{ opacity: 1 }} animate={{ opacity: fx.level === 5 ? [1, 0.2, 0.9, 0] : 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: fx.level === 5 ? 1.1 : 0.7, ease: 'easeOut' }} />
                )}
            </AnimatePresence>
            <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full text-paper/70 hover:text-paper hover:bg-white/10" title="Fermer">
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
                                <Pack />
                            </motion.button>
                            <p className="font-display text-paper text-xl italic">Touche le booster pour le déchirer</p>
                        </motion.div>
                    )}

                    {stage === 'reveal' && current && (
                        <motion.div key="reveal" className="relative flex flex-col items-center gap-4" initial={{ opacity: 0, y: 30 }}
                            animate={revealed && fx.level >= 4
                                ? { opacity: 1, y: 0, x: fx.level === 5 ? [0, -18, 16, -12, 10, -6, 4, 0] : [0, -10, 9, -6, 4, 0] }
                                : { opacity: 1, y: 0, x: 0 }}
                            transition={{ x: { duration: fx.level === 5 ? 0.8 : 0.5 } }}>
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
                                        <FlipCard card={current} revealed={revealed} charging={charging} demo={demo} onClick={() => !dragged.current && next()} />
                                    </SwipeCard>
                                </AnimatePresence>
                            </div>
                            <div className="relative z-10 min-h-16 text-center">
                                {revealed ? <RarityBanner key={index} card={current} demo={demo} /> : charging && (
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
                                {demo ? <>Joli tirage ! <span className="nd-grad-text">Garde-le pour de vrai.</span></> : <>{cards.filter((c) => c.isNew).length} nouvelle{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} espèce{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} !</>}
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
                                {cards.map((card, i) => (
                                    <motion.div key={i} className={`relative ${card.rarity === 'secret' ? 'nd-secret-glow' : card.rarity === 'legendary' ? 'nd-legend-glow' : card.rarity === 'epic' ? 'nd-epic-glow' : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                                        {demo ? <Card card={card} /> : <Link to={`/carte/${card.id}`}><Card card={card} /></Link>}
                                        {card.isNew && <span className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-rust text-paper text-[10px] font-black uppercase">Nouveau</span>}
                                        {!demo && <ShareButton card={card} compact className="absolute -bottom-2 -right-2 z-10" />}
                                        {!demo && <FavoriteStar card={card} className="absolute -bottom-2 -left-2 z-10 !w-9 !h-9" />}
                                    </motion.div>
                                ))}
                            </div>
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
                                <button onClick={onClose} className="px-6 py-3 rounded-full text-paper/70 hover:text-paper">Fermer</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
