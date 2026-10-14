import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView, useMotionValue, useSpring, useTransform } from 'motion/react';
import { ArrowRight, Dices, Eye, PackageOpen, Sparkles, Zap } from 'lucide-react';
import { useGame } from '../api.jsx';
import { Card, CardBack, TypeBadge } from '../components/Card.jsx';
import { Pack } from '../components/Pack.jsx';
import BoosterOpening from '../components/BoosterOpening.jsx';
import { RARITIES, TYPES, formatViews } from '../game.jsx';

const RARITY_TIERS = {
    common: 'Le reste des espèces',
    uncommon: 'Top 50 % de son type',
    rare: 'Top 20 % de son type',
    epic: 'Top 6 % de son type',
    legendary: 'Top 1 % de son type',
};

const WORDS = ['les lions', 'les champignons', 'les bactéries', 'les dinosaures', 'les séquoias', 'les virus', 'les axolotls', 'les orques'];

// Same odds as the server draw (functions/api).
const SLOTS = [
    ...Array(4).fill({ common: 70, uncommon: 30 }),
    { uncommon: 80, rare: 17, epic: 3 },
    { rare: 70, epic: 22, legendary: 8 },
];

const EASE = [0.16, 1, 0.3, 1];

// Deterministic shuffle so the page looks the same on every visit.
const scramble = (list) => [...list].sort((a, b) => ((a.id * 2654435761) % 4294967296) - ((b.id * 2654435761) % 4294967296));

function distinctTypes(list, count) {
    const used = new Set();
    const out = [];
    for (const c of list) {
        if (used.has(c.type)) continue;
        used.add(c.type);
        out.push(c);
        if (out.length === count) break;
    }
    return out;
}

function useShowcase(catalog) {
    return useMemo(() => {
        const cards = (catalog || []).filter((c) => c.thumb_url);
        if (!cards.length) return null;
        const byViews = [...cards].sort((a, b) => b.views - a.views);
        const of = (...rarities) => byViews.filter((c) => rarities.includes(c.rarity));

        const legends = distinctTypes(of('legendary'), 8);
        const sides = distinctTypes(of('epic').filter((c) => !legends.some((l) => l.type === c.type)), 2);
        const usedTypes = new Set();
        const ladder = Object.keys(RARITIES).map((r) => {
            const c = of(r).find((c) => !legends.includes(c) && !usedTypes.has(c.type));
            if (c) usedTypes.add(c.type);
            return c;
        }).filter(Boolean);
        const types = Object.keys(TYPES).map((key) => {
            const all = byViews.filter((c) => c.type === key);
            return { key, star: all[0], count: (catalog || []).filter((c) => c.type === key).length };
        }).sort((a, b) => (b.star?.views || 0) - (a.star?.views || 0));
        const pools = Object.fromEntries(Object.keys(RARITIES).map((r) => [r, cards.filter((c) => c.rarity === r)]));

        return {
            legends,
            sides,
            ladder,
            types,
            pools,
            top: of('legendary').slice(0, 6),
            rowA: scramble(of('legendary', 'epic')).slice(0, 14),
            rowB: scramble(of('rare', 'uncommon')).slice(0, 14),
        };
    }, [catalog]);
}

function drawDemo(pools) {
    const picked = new Set();
    return SLOTS.map((weights) => {
        let roll = Math.random() * 100;
        let rarity = Object.keys(weights).at(-1);
        for (const [r, w] of Object.entries(weights)) {
            if ((roll -= w) < 0) { rarity = r; break; }
        }
        const pool = pools[rarity]?.length ? pools[rarity] : pools.common;
        let card;
        for (let i = 0; i < 8 && (!card || picked.has(card.id)); i++) card = pool[Math.floor(Math.random() * pool.length)];
        picked.add(card.id);
        return card;
    });
}

function CountUp({ to, className }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true });
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (!inView || !to) return;
        const controls = animate(0, to, { duration: 1.8, ease: EASE, onUpdate: (v) => setValue(Math.round(v)) });
        return () => controls.stop();
    }, [inView, to]);
    return <span ref={ref} className={className}>{value.toLocaleString('fr-FR')}</span>;
}

function Pill({ children, className = '' }) {
    return (
        <span className={`inline-flex items-center gap-2 rounded-full nd-glass px-3.5 py-1.5 text-xs font-semibold text-white/85 ${className}`}>
            {children}
        </span>
    );
}

function Reveal({ children, delay = 0, className = '' }) {
    return (
        <motion.div className={className} initial={{ opacity: 0, y: 32, filter: 'blur(6px)' }} whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, delay, ease: EASE }}>
            {children}
        </motion.div>
    );
}

function Aurora({ className = '' }) {
    return (
        <div className={`nd-aurora ${className}`} aria-hidden>
            <i style={{ width: '45vw', height: '45vw', left: '-10%', top: '-15%', background: '#10e08a' }} />
            <i style={{ width: '40vw', height: '40vw', right: '-8%', top: '-10%', background: '#7c5cff', animationDelay: '-6s' }} />
            <i style={{ width: '35vw', height: '35vw', left: '30%', bottom: '-25%', background: '#ff4f9a', opacity: 0.35, animationDelay: '-11s' }} />
            <i style={{ width: '30vw', height: '30vw', right: '20%', bottom: '-10%', background: '#14c8d6', opacity: 0.4, animationDelay: '-3s' }} />
        </div>
    );
}

function RotatingWord() {
    const [i, setI] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setI((i) => (i + 1) % WORDS.length), 2200);
        return () => clearInterval(t);
    }, []);
    return (
        <span className="relative block h-[1.12em] overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={WORDS[i]} className="nd-grad-text absolute left-0 top-0 whitespace-nowrap pb-[0.1em]"
                    initial={{ y: '100%', opacity: 0, filter: 'blur(8px)' }} animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: '-100%', opacity: 0, filter: 'blur(8px)' }} transition={{ duration: 0.55, ease: EASE }}>
                    {WORDS[i]}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

/* ---------- hero ---------- */

const BUBBLES = [
    { type: 'bird', x: '6%', y: '12%', size: 54, delay: 0 },
    { type: 'fungus', x: '86%', y: '8%', size: 46, delay: -2 },
    { type: 'virus', x: '88%', y: '62%', size: 58, delay: -4 },
    { type: 'fish', x: '2%', y: '68%', size: 44, delay: -1 },
    { type: 'fossil', x: '72%', y: '84%', size: 40, delay: -3 },
    { type: 'bacteria', x: '20%', y: '86%', size: 38, delay: -5 },
];

function HeroStage({ show }) {
    const [i, setI] = useState(0);
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const sx = useSpring(px, { stiffness: 60, damping: 15 });
    const sy = useSpring(py, { stiffness: 60, damping: 15 });
    const rotateY = useTransform(sx, [-1, 1], [-14, 14]);
    const rotateX = useTransform(sy, [-1, 1], [10, -10]);
    const farX = useTransform(sx, [-1, 1], [-30, 30]);
    const farY = useTransform(sy, [-1, 1], [-20, 20]);
    const nearX = useTransform(sx, [-1, 1], [24, -24]);
    const nearY = useTransform(sy, [-1, 1], [16, -16]);

    const legends = show.legends;
    useEffect(() => {
        if (legends.length < 2) return;
        const t = setInterval(() => setI((i) => (i + 1) % legends.length), 3200);
        return () => clearInterval(t);
    }, [legends.length]);

    function onMove(e) {
        const box = e.currentTarget.getBoundingClientRect();
        px.set(((e.clientX - box.left) / box.width) * 2 - 1);
        py.set(((e.clientY - box.top) / box.height) * 2 - 1);
    }

    const featured = legends[i];
    if (!featured) return null;

    return (
        <div className="relative h-[440px] sm:h-[540px] lg:h-[620px]" onPointerMove={onMove} onPointerLeave={() => { px.set(0); py.set(0); }}>
            <div className="nd-halo absolute left-1/2 top-1/2 w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] -translate-x-1/2 -translate-y-1/2" />
            <div className="nd-rays absolute left-1/2 top-1/2 w-[900px] h-[900px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

            {/* floating type bubbles (far layer) */}
            <motion.div className="absolute inset-0" style={{ x: farX, y: farY }}>
                {BUBBLES.map((b) => {
                    const bt = TYPES[b.type];
                    return (
                        <div key={b.type} className="nd-float absolute grid place-items-center rounded-2xl nd-glass"
                            style={{ left: b.x, top: b.y, width: b.size, height: b.size, animationDelay: `${b.delay}s`, boxShadow: `0 10px 40px -8px ${bt.color}` }}>
                            <bt.Icon className="w-1/2 h-1/2" style={{ color: bt.color, filter: 'brightness(1.4)' }} />
                        </div>
                    );
                })}
            </motion.div>

            <div className="absolute inset-0 grid place-items-center" style={{ perspective: 1300 }}>
                <motion.div className="relative w-[190px] sm:w-[250px] lg:w-[270px]" style={{ rotateX, rotateY }}>
                    {/* side cards */}
                    {show.sides.map((c, k) => (
                        <motion.div key={c.id} className="absolute inset-x-0 top-6"
                            initial={{ opacity: 0, x: 0, rotate: 0, scale: 0.82 }}
                            animate={{ opacity: 0.9, x: k ? '58%' : '-58%', rotate: k ? 14 : -14, scale: 0.82 }}
                            transition={{ delay: 0.6, type: 'spring', stiffness: 60, damping: 14 }}>
                            <div className="nd-epic-glow"><Card card={c} /></div>
                        </motion.div>
                    ))}
                    {/* featured legendary, flips to the next one */}
                    <motion.div className="relative z-10" style={{ x: nearX, y: nearY }}>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={featured.id} className="nd-legend-glow"
                                initial={{ rotateY: -90, scale: 0.92 }} animate={{ rotateY: 0, scale: 1 }} exit={{ rotateY: 90, scale: 0.92 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}>
                                <Card card={featured} />
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            </div>

            {/* live caption */}
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 z-20">
                <AnimatePresence mode="wait">
                    <motion.div key={featured.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-2.5 whitespace-nowrap rounded-full nd-glass pl-1.5 pr-4 py-1.5 text-sm">
                        <TypeBadge type={featured.type} className="!w-7 !h-7 [&_svg]:!w-4 [&_svg]:!h-4" />
                        <span className="font-semibold text-white">{featured.name}</span>
                        <span className="text-amber-300 font-bold">★★★</span>
                        <span className="text-white/50 hidden sm:inline">· {formatViews(Number(featured.views))} lectures/an</span>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

function Hero({ show, total }) {
    return (
        <section className="relative isolate overflow-hidden">
            <Aurora />
            <div className="nd-dots" />
            <div className="relative max-w-7xl mx-auto px-5 pt-12 sm:pt-16 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-4 items-center min-h-[calc(100svh-4rem)]">
                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }} className="relative z-10">
                    <Pill>
                        <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" /><span className="relative w-2 h-2 rounded-full bg-emerald-400" /></span>
                        Saison 1 · {total ? total.toLocaleString('fr-FR') : '…'} espèces réelles
                    </Pill>
                    <h1 className="mt-6 font-display font-extrabold leading-[1.02] tracking-[-0.035em] text-white text-[clamp(2.5rem,4.8vw,4.75rem)]">
                        Collectionne
                        <RotatingWord />
                        <span className="text-white/90">du monde réel.</span>
                    </h1>
                    <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
                        Un jeu de cartes façon Pokémon avec de vraies espèces : animaux, arbres, algues, champignons, bactéries, virus et fossiles.
                        <span className="text-white font-semibold"> Plus une espèce est célèbre sur Wikipédia, plus sa carte est rare.</span>
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link to="/connexion?mode=register" className="nd-btn group inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl font-bold text-lg">
                            <PackageOpen className="w-5 h-5" />Ouvrir mes 3 boosters gratuits
                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </Link>
                        <a href="#demo" className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl nd-glass text-white font-semibold hover:bg-white/10 transition-colors">
                            <Dices className="w-5 h-5 text-fuchsia-300" />Essayer un booster
                        </a>
                    </div>
                    <div className="mt-10 flex flex-wrap gap-3">
                        {[
                            [<CountUp key="n" to={total} />, 'espèces', 'from-emerald-400 to-cyan-400'],
                            ['14', 'types', 'from-cyan-400 to-violet-400'],
                            ['5', 'raretés', 'from-fuchsia-400 to-amber-300'],
                        ].map(([value, label, grad]) => (
                            <div key={label} className="rounded-2xl nd-glass px-5 py-3">
                                <div className={`font-display text-3xl font-extrabold bg-gradient-to-r ${grad} bg-clip-text text-transparent`}>{value}</div>
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{label}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {show ? <HeroStage show={show} /> : <div className="h-[440px] sm:h-[540px] lg:h-[620px]" />}
            </div>
        </section>
    );
}

/* ---------- sections ---------- */

function TypeTicker() {
    const items = Object.values(TYPES);
    return (
        <div className="relative border-y border-white/[0.07] bg-white/[0.02] py-5 -rotate-1 scale-[1.02]">
            <div className="nd-marquee">
                <div className="nd-marquee-track items-center !gap-8" style={{ animationDuration: '45s' }}>
                    {[...items, ...items].map((t, i) => (
                        <span key={i} className="flex items-center gap-8 font-display text-3xl sm:text-5xl font-extrabold tracking-tight whitespace-nowrap">
                            <span className={i % 2 ? 'nd-outline-text' : ''} style={i % 2 ? {} : { color: t.color, filter: 'brightness(1.35) saturate(1.2)' }}>{t.label}</span>
                            <Sparkles className="w-6 h-6 text-white/30" />
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Marquee({ cards, reverse, duration }) {
    return (
        <div className="nd-marquee py-6">
            <div className={`nd-marquee-track ${reverse ? 'nd-reverse' : ''}`} style={{ animationDuration: `${duration}s` }}>
                {[...cards, ...cards].map((c, i) => (
                    <div key={i} className={`w-[160px] sm:w-[200px] shrink-0 transition-transform duration-300 hover:-translate-y-3 hover:scale-105 ${c.rarity === 'legendary' ? 'nd-legend-glow' : c.rarity === 'epic' ? 'nd-epic-glow' : ''}`}
                        style={{ rotate: `${(i % 3) - 1}deg` }}>
                        <Card card={c} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function SectionTitle({ kicker, children, sub, center }) {
    return (
        <Reveal className={center ? 'text-center flex flex-col items-center' : ''}>
            <Pill><Zap className="w-3.5 h-3.5 text-amber-300" />{kicker}</Pill>
            <h2 className="mt-5 font-display text-4xl sm:text-6xl font-extrabold tracking-[-0.035em] text-white leading-[1]">{children}</h2>
            {sub && <p className={`mt-5 text-lg text-ink-soft leading-relaxed max-w-2xl ${center ? 'mx-auto' : ''}`}>{sub}</p>}
        </Reveal>
    );
}

function Showcase({ show }) {
    return (
        <section id="vitrine" className="pt-24 pb-8 overflow-hidden">
            <div className="max-w-7xl mx-auto px-5">
                <SectionTitle kicker="La vitrine" sub="Photos, résumés et chiffres viennent de Wikipédia et Wikidata. Survole une carte holographique : le reflet suit ta souris.">
                    De l'axolotl à <span className="nd-grad-text">E. coli</span>.
                </SectionTitle>
            </div>
            <div className="mt-8">
                <Marquee cards={show.rowA} duration={60} />
                <Marquee cards={show.rowB} duration={70} reverse />
            </div>
        </section>
    );
}

function Demo({ show }) {
    const [cards, setCards] = useState(null);
    const [last, setLast] = useState(null);
    const open = () => setCards(drawDemo(show.pools));
    function close() {
        setLast([...cards].sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order)[0]);
        setCards(null);
    }

    return (
        <section id="demo" className="px-5 py-24 scroll-mt-16">
            <Reveal>
                <div className="relative isolate overflow-hidden max-w-7xl mx-auto rounded-[2.5rem] nd-glass nd-ring px-6 sm:px-14 py-14 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
                    <Aurora className="-z-10 opacity-60" />
                    <div>
                        <Pill><Dices className="w-3.5 h-3.5 text-fuchsia-300" />Sans compte</Pill>
                        <h2 className="mt-5 font-display text-4xl sm:text-6xl font-extrabold tracking-[-0.035em] text-white leading-[1]">
                            Essaie un booster<br /><span className="nd-grad-text">tout de suite.</span>
                        </h2>
                        <p className="mt-5 text-lg text-ink-soft max-w-md">Les mêmes chances que dans le vrai jeu. Touche le paquet, retourne les cartes… et croise les doigts pour une Légendaire.</p>
                        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                            {[['uncommon', '4 Communes ou Peu communes'], ['rare', '1 Rare garantie'], ['legendary', '8 % de Légendaire']].map(([r, label]) => (
                                <span key={r} className="rounded-full px-3 py-1.5 border" style={{ color: RARITIES[r].color, background: `${RARITIES[r].color}18`, borderColor: `${RARITIES[r].color}55` }}>
                                    {RARITIES[r].symbol} {label}
                                </span>
                            ))}
                        </div>
                        <button onClick={open} className="nd-btn mt-8 inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl font-bold text-lg">
                            <PackageOpen className="w-5 h-5" />Ouvrir un booster d'essai
                        </button>
                        {last && (
                            <p className="mt-4 text-sm text-ink-soft">Ton dernier tirage : <b style={{ color: RARITIES[last.rarity].color }}>{last.name}</b> ({RARITIES[last.rarity].label}). Crée un compte pour garder tes cartes !</p>
                        )}
                    </div>
                    <div className="relative flex justify-center py-6">
                        <div className="nd-halo absolute left-1/2 top-1/2 w-[280px] h-[280px] -translate-x-1/2 -translate-y-1/2" />
                        <motion.button onClick={open} aria-label="Ouvrir un booster d'essai"
                            className="relative w-[200px] sm:w-[230px] cursor-pointer"
                            animate={{ y: [0, -16, 0], rotate: [-4, 3, -4] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                            <div className="drop-shadow-[0_40px_50px_rgba(40,0,90,0.6)]"><Pack /></div>
                        </motion.button>
                    </div>
                </div>
            </Reveal>
            <AnimatePresence>
                {cards && (
                    <BoosterOpening key={cards.map((c) => c.id).join()} demo cards={cards} canOpenAgain onAgain={open} onClose={close} />
                )}
            </AnimatePresence>
        </section>
    );
}

function Steps({ show }) {
    const sample = show.ladder.at(-2);
    const thumbs = show.rowB.slice(0, 6);
    const steps = [
        {
            n: '01', title: 'Déchire un booster', grad: 'from-emerald-400 to-cyan-400',
            text: '6 cartes par paquet, dont au moins une Rare. 3 boosters offerts à l\'inscription, puis des pièces chaque jour.',
            visual: (
                <div className="w-[112px] h-[179px] rotate-[-8deg] transition-transform duration-500 group-hover:rotate-[4deg] group-hover:-translate-y-3 group-hover:scale-105 drop-shadow-[0_20px_25px_rgba(0,0,0,0.5)]">
                    <div className="w-[200px] origin-top-left scale-[0.56]"><Pack /></div>
                </div>
            ),
        },
        {
            n: '02', title: 'Retourne les cartes', grad: 'from-violet-400 to-fuchsia-400',
            text: 'Une à une, avec une explosion de lumière pour les Rares et un reflet holographique pour les Épiques et Légendaires.',
            visual: (
                <div className="relative w-[190px] h-[170px]">
                    <div className="absolute left-0 top-3 w-[108px] rotate-[-10deg] transition-transform duration-500 group-hover:rotate-[-18deg] group-hover:-translate-x-2"><CardBack /></div>
                    {sample && <div className="absolute right-0 top-0 w-[112px] rotate-[8deg] transition-transform duration-500 group-hover:rotate-[2deg] group-hover:-translate-y-3 nd-epic-glow"><Card card={sample} /></div>}
                </div>
            ),
        },
        {
            n: '03', title: 'Complète ton NaturDex', grad: 'from-amber-300 to-pink-400',
            text: 'Chaque espèce trouvée sort de l\'ombre. Recycle tes doublons en pièces pour viser les cartes qui te manquent.',
            visual: (
                <div className="grid grid-cols-3 gap-1.5 w-[150px]">
                    {thumbs.map((c, i) => (i % 3 === 1
                        ? <div key={c.id} className="aspect-[5/7] rounded-md border-2 border-dashed border-white/20 bg-white/5 grid place-items-center text-white/40 font-display font-bold">?</div>
                        : <img key={c.id} src={c.thumb_url} alt="" className="aspect-[5/7] w-full object-cover rounded-md ring-2 ring-white/30 transition-transform duration-300 group-hover:scale-105" />
                    ))}
                </div>
            ),
        },
    ];

    return (
        <section className="max-w-7xl mx-auto px-5 py-16">
            <SectionTitle kicker="Comment on joue" center>Trois gestes, des milliers d'espèces</SectionTitle>
            <div className="mt-14 grid md:grid-cols-3 gap-5">
                {steps.map((s, i) => (
                    <Reveal key={s.n} delay={i * 0.12}>
                        <div className="group relative h-full rounded-[2rem] nd-glass p-8 pt-6 overflow-hidden transition-transform duration-300 hover:-translate-y-1.5">
                            <div className={`absolute -top-24 -right-24 w-56 h-56 rounded-full bg-gradient-to-br ${s.grad} opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-40`} />
                            <div className="relative h-[190px] grid place-items-center">{s.visual}</div>
                            <p className={`relative mt-4 font-display text-5xl font-extrabold bg-gradient-to-r ${s.grad} bg-clip-text text-transparent`}>{s.n}</p>
                            <h3 className="relative mt-1 font-display text-2xl font-bold text-white">{s.title}</h3>
                            <p className="relative mt-2 text-ink-soft leading-relaxed">{s.text}</p>
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

function Rarity({ show }) {
    const max = show.top[0]?.views || 1;
    return (
        <section className="relative isolate overflow-hidden py-24">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_80%_30%,rgb(255_197_61/0.16),transparent),radial-gradient(45%_50%_at_10%_80%,rgb(168_85_247/0.18),transparent)]" />
            <div className="max-w-7xl mx-auto px-5">
                <SectionTitle kicker="Les raretés" sub="On compte les lectures de chaque article Wikipédia, puis on classe chaque espèce parmi celles de son type. Le lion, le koala ou l'amanite tue-mouches sont Légendaires, et même les bactéries ont leurs stars.">
                    La célébrité fait <span className="nd-gold-text">la rareté</span>.
                </SectionTitle>

                <div className="mt-6 -mx-5 px-5 overflow-x-auto lg:overflow-visible py-12">
                    <div className="flex items-end justify-between gap-5 min-w-[760px]">
                        {show.ladder.map((card, i) => {
                            const r = RARITIES[card.rarity];
                            const glow = card.rarity === 'legendary' ? 'nd-legend-glow' : card.rarity === 'epic' ? 'nd-epic-glow' : '';
                            return (
                                <Reveal key={card.id} delay={i * 0.1} className="flex-1 flex flex-col items-center">
                                    <motion.div className={glow} style={{ width: `${62 + i * 9.5}%` }} whileHover={{ y: -12, rotate: i % 2 ? 2 : -2 }}>
                                        <Card card={card} />
                                    </motion.div>
                                    <div className="mt-5 text-center">
                                        <div className="font-display text-lg font-bold" style={{ color: r.color, textShadow: i >= 2 ? `0 0 24px ${r.color}` : 'none' }}>{r.symbol} {r.label}</div>
                                        <div className="text-xs uppercase tracking-[0.15em] text-white/45 mt-1">{RARITY_TIERS[card.rarity]}</div>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-16 grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
                    <Reveal>
                        <h3 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Le panthéon du NaturDex</h3>
                        <p className="mt-4 text-ink-soft leading-relaxed">
                            Les espèces les plus lues de toute la collection, en lectures estimées par an. Une Légendaire apparaît dans environ
                            <b className="text-amber-300"> 1 booster sur 12</b>.
                        </p>
                        <a href="#demo" className="mt-8 inline-flex items-center gap-2 font-semibold text-amber-300 hover:text-white transition-colors">
                            Tenter ma chance <ArrowRight className="w-4 h-4" />
                        </a>
                    </Reveal>
                    <ol className="space-y-3">
                        {show.top.map((c, i) => (
                            <Reveal key={c.id} delay={i * 0.06}>
                                <li className="group flex items-center gap-4 rounded-2xl nd-glass p-3 pr-5 transition-colors hover:bg-white/[0.08]">
                                    <span className={`w-7 text-center font-display text-2xl font-extrabold ${i === 0 ? 'nd-gold-text' : 'text-white/40'}`}>{i + 1}</span>
                                    <img src={c.thumb_url} alt="" className="w-12 h-12 rounded-xl object-cover ring-2 ring-amber-300/60 transition-transform group-hover:scale-110 group-hover:rotate-3" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-display text-lg font-bold text-white truncate">{c.name}</span>
                                            <span className="text-[11px] text-white/45 truncate hidden sm:inline">{TYPES[c.type].label}</span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                            <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-violet-500"
                                                initial={{ width: 0 }} whileInView={{ width: `${(c.views / max) * 100}%` }} viewport={{ once: true }}
                                                transition={{ duration: 1.2, delay: 0.2 + i * 0.08, ease: EASE }} />
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-1.5 text-sm tabular-nums text-white/60"><Eye className="w-4 h-4" />{formatViews(Number(c.views))}</span>
                                </li>
                            </Reveal>
                        ))}
                    </ol>
                </div>
            </div>
        </section>
    );
}

function Types({ show }) {
    return (
        <section className="max-w-7xl mx-auto px-5 py-20">
            <SectionTitle kicker="Les familles" sub="Du mammifère au virus, chaque type a sa couleur, ses attaques et ses propres Légendaires.">
                14 types à <span className="nd-grad-text">compléter</span>
            </SectionTitle>
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 auto-rows-[150px] sm:auto-rows-[170px] gap-3 sm:gap-4">
                {show.types.map(({ key, star, count }, i) => {
                    const t = TYPES[key];
                    const span = i === 0 ? 'col-span-2 row-span-2' : i === 1 ? 'col-span-2' : '';
                    return (
                        <Reveal key={key} delay={(i % 6) * 0.05} className={span}>
                            <div className="group relative h-full rounded-3xl overflow-hidden ring-1 ring-white/10"
                                style={{ boxShadow: `0 20px 50px -25px ${t.color}` }}>
                                {star && <img src={star.thumb_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />}
                                <div className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-80" style={{ background: `linear-gradient(180deg, transparent 25%, ${t.color}cc 75%, ${t.color})` }} />
                                <div className="absolute inset-0 rounded-3xl ring-2 ring-inset ring-transparent transition-all duration-300 group-hover:ring-white/40" />
                                <div className="absolute top-3 left-3"><TypeBadge type={key} className="!w-9 !h-9 [&_svg]:!w-5 [&_svg]:!h-5" /></div>
                                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                                    <div className={`font-display font-extrabold leading-tight tracking-tight ${i === 0 ? 'text-3xl sm:text-4xl' : 'text-lg'}`}>{t.label}</div>
                                    <div className="text-xs text-white/85 mt-0.5 font-semibold">{count} cartes{star && i < 2 ? ` · star : ${star.name}` : ''}</div>
                                </div>
                            </div>
                        </Reveal>
                    );
                })}
            </div>
        </section>
    );
}

function FinalCta() {
    return (
        <section className="px-5 pb-24">
            <Reveal>
                <div className="relative isolate overflow-hidden max-w-7xl mx-auto rounded-[2.5rem] px-8 sm:px-16 py-16 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center bg-[linear-gradient(135deg,#0f2a4a,#2a1460_50%,#4a0f3a)]">
                    <Aurora className="-z-10" />
                    <div className="nd-rays absolute -right-40 top-1/2 w-[700px] h-[700px] -translate-y-1/2 -z-10" />
                    <div>
                        <Sparkles className="w-8 h-8 text-amber-300" />
                        <h2 className="mt-4 font-display text-4xl sm:text-6xl font-extrabold tracking-[-0.035em] text-white leading-[1]">Ton premier booster<br /><span className="nd-grad-text">t'attend.</span></h2>
                        <p className="mt-5 text-white/70 text-lg max-w-md">Crée ton compte en 10 secondes, avec un pseudo et un mot de passe. 3 boosters sont offerts.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link to="/connexion?mode=register" className="nd-btn inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl font-bold text-lg">
                                <PackageOpen className="w-5 h-5" />Commencer la collection
                            </Link>
                            <Link to="/connexion" className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl nd-glass text-white font-semibold hover:bg-white/10 transition-colors">
                                Se connecter
                            </Link>
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <motion.div className="w-[200px] sm:w-[230px]" animate={{ y: [0, -14, 0], rotate: [6, 2, 6] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
                            <div className="drop-shadow-[0_40px_50px_rgba(0,0,0,0.5)]"><Pack /></div>
                        </motion.div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

export default function Landing() {
    const { catalog } = useGame();
    const show = useShowcase(catalog);

    return (
        <div className="overflow-x-clip">
            <Hero show={show} total={catalog?.length} />
            <TypeTicker />
            {show && (
                <>
                    <Showcase show={show} />
                    <Demo show={show} />
                    <Steps show={show} />
                    <Rarity show={show} />
                    <Types show={show} />
                </>
            )}
            <FinalCta />
        </div>
    );
}
