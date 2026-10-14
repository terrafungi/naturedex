import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, motion, useInView, useMotionValue, useSpring, useTransform } from 'motion/react';
import { ArrowRight, BookOpen, ChevronDown, Eye, PackageOpen, Sparkles } from 'lucide-react';
import { useGame } from '../api.jsx';
import { Card, CardBack, TypeBadge } from '../components/Card.jsx';
import { Pack } from '../components/Pack.jsx';
import { RARITIES, TYPES, formatViews } from '../game.jsx';

const RARITY_TIERS = {
    common: 'Le reste des espèces',
    uncommon: 'Top 50 % de son type',
    rare: 'Top 20 % de son type',
    epic: 'Top 6 % de son type',
    legendary: 'Top 1 % de son type',
};

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

        const legends = distinctTypes(of('legendary'), 5);
        // Fan order: most famous in the middle.
        const hero = [legends[3], legends[1], legends[0], legends[2], legends[4]].filter(Boolean);
        const usedTypes = new Set();
        const ladder = Object.keys(RARITIES).map((r) => {
            const c = of(r).find((c) => !hero.includes(c) && !usedTypes.has(c.type));
            if (c) usedTypes.add(c.type);
            return c;
        }).filter(Boolean);
        const types = Object.keys(TYPES).map((key) => {
            const all = byViews.filter((c) => c.type === key);
            return { key, star: all[0], count: (catalog || []).filter((c) => c.type === key).length };
        });

        return {
            hero,
            ladder,
            types,
            top: of('legendary').slice(0, 6),
            rowA: scramble(of('legendary', 'epic')).slice(0, 14),
            rowB: scramble(of('rare', 'uncommon')).slice(0, 14),
            mosaic: scramble(cards).slice(0, 48),
        };
    }, [catalog]);
}

function CountUp({ to, className }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true });
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (!inView || !to) return;
        const controls = animate(0, to, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setValue(Math.round(v)) });
        return () => controls.stop();
    }, [inView, to]);
    return <span ref={ref} className={className}>{value.toLocaleString('fr-FR')}</span>;
}

function Eyebrow({ children, dark }) {
    return (
        <p className={`flex items-center gap-3 uppercase tracking-[0.3em] text-[11px] font-bold ${dark ? 'text-brass' : 'text-brass-deep'}`}>
            <span className="h-px w-8 bg-current opacity-60" />{children}
        </p>
    );
}

function Reveal({ children, delay = 0, className = '' }) {
    return (
        <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}>
            {children}
        </motion.div>
    );
}

/* ---------- hero ---------- */

const FAN = [
    { x: -250, y: 50, rotate: -18 },
    { x: -140, y: 0, rotate: -9 },
    { x: 0, y: -30, rotate: 0 },
    { x: 140, y: 0, rotate: 9 },
    { x: 250, y: 50, rotate: 18 },
];

function HeroStage({ cards }) {
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const rotateY = useSpring(useTransform(px, [-1, 1], [-10, 10]), { stiffness: 80, damping: 18 });
    const rotateX = useSpring(useTransform(py, [-1, 1], [8, -8]), { stiffness: 80, damping: 18 });

    function onMove(e) {
        const box = e.currentTarget.getBoundingClientRect();
        px.set(((e.clientX - box.left) / box.width) * 2 - 1);
        py.set(((e.clientY - box.top) / box.height) * 2 - 1);
    }

    return (
        <div className="relative h-[360px] sm:h-[480px] xl:h-[600px]" onPointerMove={onMove} onPointerLeave={() => { px.set(0); py.set(0); }}>
            <div className="nd-rays absolute left-1/2 top-[42%] w-[900px] h-[900px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute left-1/2 top-[45%] w-[520px] h-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass/30 blur-[90px] pointer-events-none" />

            <div className="absolute left-1/2 top-0 w-[680px] h-[600px] -translate-x-1/2 origin-top scale-[0.6] sm:scale-[0.8] xl:scale-100" style={{ perspective: 1400 }}>
                <motion.div className="relative w-full h-full" style={{ rotateX, rotateY }}>
                    {cards.map((card, i) => {
                        const f = FAN[i] || FAN[2];
                        const center = i === 2;
                        return (
                            <motion.div
                                key={card.id}
                                className={`absolute left-1/2 top-[70px] -ml-[115px] w-[230px] ${center ? 'z-20' : 'z-10'}`}
                                initial={{ opacity: 0, x: 0, y: 260, rotate: 0, scale: 0.6 }}
                                animate={{ opacity: 1, x: f.x, y: f.y, rotate: f.rotate, scale: center ? 1.12 : 1 }}
                                transition={{ delay: 0.5 + Math.abs(i - 2) * 0.12, type: 'spring', stiffness: 70, damping: 13 }}
                            >
                                <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: 'easeInOut', delay: 1.6 + i * 0.3 }}>
                                    <div className={center ? 'nd-legend-glow' : ''}><Card card={card} /></div>
                                </motion.div>
                            </motion.div>
                        );
                    })}

                    {/* the booster the cards burst out of */}
                    <motion.div
                        className="absolute left-1/2 bottom-[-30px] -ml-[105px] w-[210px] z-30"
                        initial={{ opacity: 0, y: 80, rotate: -4 }}
                        animate={{ opacity: 1, y: 0, rotate: -4 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]"><Pack /></div>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
}

function Mosaic({ cards }) {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none nd-mosaic-mask" aria-hidden>
            <div className="nd-mosaic absolute -inset-x-[10%] -top-[30%] grid grid-cols-6 sm:grid-cols-8 gap-3 rotate-[-8deg]">
                {[...cards, ...cards].map((c, i) => (
                    <img key={i} src={c.thumb_url} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover rounded-xl" />
                ))}
            </div>
        </div>
    );
}

function Spores() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            {Array.from({ length: 22 }, (_, i) => (
                <span key={i} className="nd-spore" style={{
                    left: `${(i * 37) % 100}%`,
                    width: 3 + (i % 4) * 2,
                    height: 3 + (i % 4) * 2,
                    animationDuration: `${12 + (i % 7) * 3}s`,
                    animationDelay: `${-(i * 1.7)}s`,
                }} />
            ))}
        </div>
    );
}

function Hero({ show, total }) {
    return (
        <section className="relative isolate overflow-hidden bg-forest-deep text-paper">
            {show && <Mosaic cards={show.mosaic} />}
            <div className="absolute inset-0 -z-0 bg-[radial-gradient(120%_80%_at_70%_40%,transparent,rgb(15_32_22/0.85)_70%)]" />
            <Spores />

            <div className="relative max-w-7xl mx-auto px-5 pt-14 sm:pt-20 pb-28 grid lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-4 items-center min-h-[calc(100svh-4rem)]">
                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="relative z-10">
                    <span className="inline-flex items-center gap-2 rounded-full border border-brass/40 bg-brass/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-brass backdrop-blur-sm">
                        <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-brass animate-ping opacity-70" /><span className="relative w-2 h-2 rounded-full bg-brass" /></span>
                        Saison 1 · {total ? total.toLocaleString('fr-FR') : '…'} espèces réelles
                    </span>
                    <h1 className="mt-6 font-display font-black leading-[0.9] tracking-tight text-[clamp(3rem,7vw,6rem)]">
                        Collectionne<br />
                        <span className="nd-gold-text italic font-semibold pr-2">tout</span> le vivant.
                    </h1>
                    <p className="mt-7 max-w-lg text-lg sm:text-xl leading-relaxed text-paper/75">
                        Déchire des boosters et découvre des animaux, des arbres, des algues, des champignons, des bactéries, des virus et des fossiles.
                        Chaque carte est une vraie espèce, et <b className="text-paper">les plus célèbres sur Wikipédia sont les plus rares.</b>
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                        <Link to="/connexion?mode=register" className="nd-cta group inline-flex items-center gap-2.5 px-7 py-4 rounded-full bg-brass text-forest-deep font-bold text-lg">
                            <PackageOpen className="w-5 h-5" />Ouvrir mes 3 boosters offerts
                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </Link>
                        <Link to="/connexion" className="px-6 py-4 rounded-full border border-paper/25 text-paper font-semibold hover:bg-paper/10 transition-colors">
                            J'ai déjà un compte
                        </Link>
                    </div>
                    <p className="mt-4 text-sm text-paper/50">Gratuit · sans e-mail · ta collection est sauvegardée en ligne</p>

                    <dl className="mt-12 grid grid-cols-3 max-w-md divide-x divide-paper/15 border-y border-paper/15">
                        {[
                            [<CountUp key="n" to={total} />, 'espèces'],
                            ['14', 'types'],
                            ['5', 'raretés'],
                        ].map(([value, label], i) => (
                            <div key={i} className="py-4 px-4 first:pl-0">
                                <dt className="font-display text-3xl sm:text-4xl font-black text-brass">{value}</dt>
                                <dd className="text-xs uppercase tracking-[0.2em] text-paper/60 mt-1">{label}</dd>
                            </div>
                        ))}
                    </dl>
                </motion.div>

                {show ? <HeroStage cards={show.hero} /> : <div className="h-[360px] sm:h-[480px] xl:h-[600px]" />}
            </div>

            <a href="#vitrine" className="absolute bottom-16 left-1/2 -translate-x-1/2 text-paper/50 hover:text-paper animate-bounce hidden sm:block" aria-label="Découvrir">
                <ChevronDown className="w-7 h-7" />
            </a>
            {/* torn-paper edge */}
            <svg className="absolute bottom-[-1px] left-0 w-full h-12 text-paper" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
                <path fill="currentColor" d="M0 30 L60 22 L110 34 L180 18 L240 30 L310 14 L380 28 L440 20 L520 34 L590 16 L660 28 L720 20 L800 34 L870 18 L930 30 L1010 14 L1080 30 L1150 20 L1220 34 L1290 18 L1360 28 L1440 20 L1440 48 L0 48 Z" />
            </svg>
        </section>
    );
}

/* ---------- sections ---------- */

function Marquee({ cards, reverse, duration }) {
    return (
        <div className="nd-marquee py-5">
            <div className="nd-marquee-track" style={{ animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
                {[...cards, ...cards].map((c, i) => (
                    <div key={i} className="w-[160px] sm:w-[200px] shrink-0 transition-transform duration-300 hover:-translate-y-2" style={{ rotate: `${(i % 3) - 1}deg` }}>
                        <Card card={c} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function Showcase({ show }) {
    return (
        <section id="vitrine" className="pt-20 pb-10 overflow-hidden">
            <Reveal className="max-w-7xl mx-auto px-5 flex flex-wrap items-end justify-between gap-6">
                <div>
                    <Eyebrow>La vitrine</Eyebrow>
                    <h2 className="mt-4 font-display text-4xl sm:text-6xl font-black text-forest leading-[0.95]">
                        De l'axolotl à <i className="font-medium text-brass-deep">E. coli</i>.
                    </h2>
                </div>
                <p className="max-w-sm text-ink-soft leading-relaxed">
                    Photos, résumés et chiffres viennent de Wikipédia et Wikidata. Survole une carte holographique : le reflet suit ta souris.
                </p>
            </Reveal>
            {show && (
                <div className="mt-10 space-y-2">
                    <Marquee cards={show.rowA} duration={70} />
                    <Marquee cards={show.rowB} duration={80} reverse />
                </div>
            )}
        </section>
    );
}

function Steps({ show }) {
    const sample = show?.ladder.at(-2);
    const thumbs = show?.mosaic.slice(0, 6) || [];
    const steps = [
        {
            n: 'I', title: 'Déchire un booster',
            text: '6 cartes par paquet, dont au moins une Rare. Tu en reçois 3 à l\'inscription, puis des pièces chaque jour pour en acheter.',
            visual: (
                <div className="w-[112px] h-[179px] rotate-[-8deg] transition-transform duration-500 group-hover:rotate-[-2deg] group-hover:-translate-y-3 drop-shadow-[0_20px_25px_rgba(0,0,0,0.35)]">
                    <div className="w-[200px] origin-top-left scale-[0.56]"><Pack /></div>
                </div>
            ),
        },
        {
            n: 'II', title: 'Retourne les cartes',
            text: 'Une à une, avec un éclat doré pour les Rares et un reflet holographique pour les Épiques et les Légendaires.',
            visual: (
                <div className="relative w-[190px] h-[170px]">
                    <div className="absolute left-0 top-3 w-[108px] rotate-[-10deg]"><CardBack /></div>
                    {sample && <div className="absolute right-0 top-0 w-[112px] rotate-[8deg] transition-transform duration-500 group-hover:rotate-[2deg] group-hover:-translate-y-2"><Card card={sample} /></div>}
                </div>
            ),
        },
        {
            n: 'III', title: 'Complète ton NaturDex',
            text: 'Chaque espèce trouvée sort de l\'ombre. Recycle tes doublons en pièces pour viser les cartes qui te manquent.',
            visual: (
                <div className="grid grid-cols-3 gap-1.5 w-[150px]">
                    {thumbs.map((c, i) => (i % 3 === 1
                        ? <div key={c.id} className="aspect-[5/7] rounded-md border-2 border-dashed border-forest/25 bg-forest/5 grid place-items-center text-forest/40 font-display font-bold">?</div>
                        : <img key={c.id} src={c.thumb_url} alt="" className="aspect-[5/7] w-full object-cover rounded-md ring-2 ring-brass/70" />
                    ))}
                </div>
            ),
        },
    ];

    return (
        <section className="max-w-7xl mx-auto px-5 py-20">
            <Reveal className="text-center">
                <div className="flex justify-center"><Eyebrow>Comment on joue</Eyebrow></div>
                <h2 className="mt-4 font-display text-4xl sm:text-6xl font-black text-forest">Trois gestes de naturaliste</h2>
            </Reveal>
            <div className="mt-14 grid md:grid-cols-3 gap-6">
                {steps.map((s, i) => (
                    <Reveal key={s.n} delay={i * 0.12}>
                        <div className="group relative h-full rounded-[2rem] border border-forest/15 bg-gradient-to-b from-paper-deep/80 to-paper/40 p-8 pt-6 overflow-hidden">
                            <div className="h-[190px] grid place-items-center">{s.visual}</div>
                            <p className="mt-4 font-display italic text-brass-deep text-lg">Étape {s.n}</p>
                            <h3 className="font-display text-2xl font-bold text-forest">{s.title}</h3>
                            <p className="mt-2 text-ink-soft leading-relaxed">{s.text}</p>
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

function Rarity({ show }) {
    const max = show?.top[0]?.views || 1;
    return (
        <section className="relative isolate overflow-hidden bg-forest-deep text-paper py-24">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_30%,rgb(201_162_74/0.25),transparent),radial-gradient(50%_60%_at_10%_90%,rgb(46_90_62/0.6),transparent)]" />
            <div className="max-w-7xl mx-auto px-5">
                <Reveal className="max-w-3xl">
                    <Eyebrow dark>Les raretés</Eyebrow>
                    <h2 className="mt-4 font-display text-4xl sm:text-6xl font-black leading-[0.95]">
                        La célébrité fait <span className="nd-gold-text italic">la rareté</span>.
                    </h2>
                    <p className="mt-6 text-lg text-paper/70 leading-relaxed">
                        On compte les lectures de chaque article Wikipédia, puis on classe chaque espèce parmi celles de son type.
                        Les plus lues deviennent Légendaires. Le lion, le koala ou l'amanite tue-mouches le sont, et même les bactéries ont leurs stars.
                    </p>
                </Reveal>

                {show && (
                    <div className="mt-6 -mx-5 px-5 overflow-x-auto lg:overflow-visible py-10">
                        <div className="flex items-end justify-between gap-5 min-w-[760px]">
                            {show.ladder.map((card, i) => {
                                const r = RARITIES[card.rarity];
                                return (
                                    <Reveal key={card.id} delay={i * 0.1} className="flex-1 flex flex-col items-center">
                                        <div className={card.rarity === 'legendary' ? 'nd-legend-glow' : ''} style={{ width: `${62 + i * 9.5}%` }}>
                                            <Card card={card} />
                                        </div>
                                        <div className="mt-5 text-center">
                                            <div className="font-display text-lg font-bold" style={{ color: i >= 2 ? '#e8c76a' : '#f3ecdc' }}>{r.symbol} {r.label}</div>
                                            <div className="text-xs uppercase tracking-[0.15em] text-paper/55 mt-1">{RARITY_TIERS[card.rarity]}</div>
                                        </div>
                                    </Reveal>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="mt-20 grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
                    <Reveal>
                        <h3 className="font-display text-3xl sm:text-4xl font-bold">Le panthéon du NaturDex</h3>
                        <p className="mt-4 text-paper/70 leading-relaxed">
                            Les espèces les plus lues de toute la collection, en lectures estimées par an. Une Légendaire apparaît dans environ
                            <b className="text-brass"> 1 booster sur 12</b>.
                        </p>
                        <Link to="/connexion?mode=register" className="mt-8 inline-flex items-center gap-2 font-semibold text-brass hover:text-paper transition-colors">
                            Tenter ma chance <ArrowRight className="w-4 h-4" />
                        </Link>
                    </Reveal>
                    <ol className="space-y-3">
                        {show?.top.map((c, i) => (
                            <Reveal key={c.id} delay={i * 0.06}>
                                <li className="flex items-center gap-4 rounded-2xl bg-paper/[0.04] border border-paper/10 p-3 pr-5">
                                    <span className="w-6 text-center font-display text-xl font-black text-brass">{i + 1}</span>
                                    <img src={c.thumb_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-brass/60" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-display text-lg font-bold truncate">{c.name}</span>
                                            <span className="text-[11px] text-paper/50 truncate hidden sm:inline">{TYPES[c.type].label}</span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 rounded-full bg-paper/10 overflow-hidden">
                                            <motion.div className="h-full rounded-full bg-gradient-to-r from-brass-deep to-[#f6e3a1]"
                                                initial={{ width: 0 }} whileInView={{ width: `${(c.views / max) * 100}%` }} viewport={{ once: true }}
                                                transition={{ duration: 1.2, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-1.5 text-sm tabular-nums text-paper/70"><Eye className="w-4 h-4" />{formatViews(Number(c.views))}</span>
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
        <section className="max-w-7xl mx-auto px-5 py-24">
            <Reveal className="flex flex-wrap items-end justify-between gap-6">
                <div>
                    <Eyebrow>Les familles</Eyebrow>
                    <h2 className="mt-4 font-display text-4xl sm:text-6xl font-black text-forest leading-[0.95]">14 types à compléter</h2>
                </div>
                <p className="max-w-sm text-ink-soft leading-relaxed">Du mammifère au virus, chaque type a sa couleur, ses attaques et ses propres Légendaires.</p>
            </Reveal>
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
                {show?.types.map(({ key, star, count }, i) => {
                    const t = TYPES[key];
                    return (
                        <Reveal key={key} delay={(i % 7) * 0.05}>
                            <div className="group relative aspect-[3/4] rounded-3xl overflow-hidden shadow-[0_18px_40px_-20px_rgb(20_30_20/0.6)]" style={{ '--type': t.color }}>
                                {star && <img src={star.thumb_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />}
                                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${t.color}10 20%, ${t.color}dd 72%, ${t.color})` }} />
                                <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-3xl" />
                                <div className="absolute top-3 left-3 w-9"><TypeBadge type={key} className="!w-9 !h-9 [&_svg]:!w-5 [&_svg]:!h-5" /></div>
                                <div className="absolute inset-x-0 bottom-0 p-3.5 text-paper">
                                    <div className="font-display text-lg font-bold leading-tight">{t.label}</div>
                                    <div className="text-[11px] text-paper/80 mt-0.5">{count} cartes</div>
                                    {star && <div className="text-[11px] text-paper/80 mt-1.5 truncate opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all">★ {star.name}</div>}
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
                <div className="relative isolate overflow-hidden max-w-7xl mx-auto rounded-[2.5rem] bg-forest text-paper px-8 sm:px-16 py-16 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
                    <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_80%_50%,rgb(201_162_74/0.45),transparent)]" />
                    <div className="nd-rays absolute -right-40 top-1/2 w-[700px] h-[700px] -translate-y-1/2 -z-10 opacity-60" />
                    <div>
                        <Sparkles className="w-8 h-8 text-brass" />
                        <h2 className="mt-4 font-display text-4xl sm:text-6xl font-black leading-[0.95]">Ton premier booster<br /><i className="font-medium text-brass">t'attend.</i></h2>
                        <p className="mt-5 text-paper/70 text-lg max-w-md">Crée ton carnet en 10 secondes, avec un pseudo et un mot de passe. 3 boosters sont offerts.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link to="/connexion?mode=register" className="nd-cta inline-flex items-center gap-2.5 px-7 py-4 rounded-full bg-brass text-forest-deep font-bold text-lg">
                                <PackageOpen className="w-5 h-5" />Commencer la collection
                            </Link>
                            <Link to="/connexion" className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-paper/25 font-semibold hover:bg-paper/10 transition-colors">
                                <BookOpen className="w-5 h-5" />Se connecter
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
            <Showcase show={show} />
            <Steps show={show} />
            <Rarity show={show} />
            <Types show={show} />
            <FinalCta />
        </div>
    );
}
