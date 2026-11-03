import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { ArrowRight, Award, BookOpen, Brain, CalendarCheck, Camera, ChevronRight, Clock, Compass, Crown, Dices, Eye, Frame, Gavel, GalleryVerticalEnd, Gem, HeartHandshake, Leaf, PackageOpen, Shield, Shirt, Sparkles, Sprout, Swords, Users, Zap } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card, MysteryCard, TypeBadge } from '../components/Card.jsx';
import { ChallengeCard, SAMPLE_CHALLENGES } from '../components/Challenge.jsx';
import { Pack } from '../components/Pack.jsx';
import BoosterOpening from '../components/BoosterOpening.jsx';
import AvatarStage from '../components/AvatarStage.jsx';
import PatronBadge from '../components/PatronBadge.jsx';
import { ShowcaseThumb } from '../components/Showcase.jsx';
import { defaultAvatar } from '../components/PlayerAvatar.jsx';
import { RARITIES, TYPES, formatViews } from '../game.jsx';

const RARITY_TIERS = {
    common: 'Le reste des espèces',
    uncommon: 'Top 50 % de son type',
    rare: 'Top 20 % de son type',
    epic: 'Top 6 % de son type',
    legendary: 'Top 1 % de son type',
    secret: 'Les 50 espèces stars',
};

// Same odds as the server draw (functions/api).
const SLOTS = [
    ...Array(4).fill({ common: 70, uncommon: 30 }),
    { uncommon: 80, rare: 17, epic: 3 },
    { rare: 70, epic: 22, legendary: 8 },
];

const EASE = [0.16, 1, 0.3, 1];
const SIGNUP = '/connexion?mode=register';
// In-page anchors (the router does not scroll to #hash by itself).
const jump = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

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

// Featured carousel order mirrors the mockup: legendary, rare, epic, …
const FEATURED_ORDER = ['legendary', 'rare', 'epic'];

function useShowcase(catalog) {
    return useMemo(() => {
        const cards = (catalog?.cards || []).filter((c) => c.thumb_url).map((c) => ({ ...c, views: Number(c.views) }));
        if (!cards.length) return null;
        const byViews = [...cards].sort((a, b) => b.views - a.views);
        const of = (...rarities) => byViews.filter((c) => rarities.includes(c.rarity));

        const usedTypes = new Set();
        const ladder = Object.keys(RARITIES).map((r) => {
            const c = of(r).find((c) => !usedTypes.has(c.type));
            if (c) usedTypes.add(c.type);
            return c;
        }).filter(Boolean);
        const types = Object.keys(TYPES).map((key) => {
            const all = byViews.filter((c) => c.type === key);
            return { key, star: all[0], count: Object.values(catalog.types[key] || {}).reduce((a, n) => a + n, 0) };
        }).sort((a, b) => (b.star?.views || 0) - (a.star?.views || 0));

        const named = (list) => list.filter((c) => c.sci_name && c.name !== c.sci_name);
        const lanes = FEATURED_ORDER.map((r) => distinctTypes(named(r === 'rare' ? scramble(of(r)) : of(r)), 6));
        const featured = [];
        for (let k = 0; k < 6; k++) for (const lane of lanes) if (lane[k]) featured.push(lane[k]);

        const pools = Object.fromEntries(Object.keys(RARITIES).map((r) => [r, cards.filter((c) => c.rarity === r)]));

        return { ladder, types, pools, featured, top: of('legendary').slice(0, 6) };
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
            <i style={{ width: '45vw', height: '45vw', left: '-10%', top: '-15%', background: '#1f8a4f', opacity: 0.4 }} />
            <i style={{ width: '40vw', height: '40vw', right: '-8%', top: '-10%', background: '#e9c46a', opacity: 0.18, animationDelay: '-6s' }} />
            <i style={{ width: '30vw', height: '30vw', right: '20%', bottom: '-10%', background: '#4fd18b', opacity: 0.25, animationDelay: '-3s' }} />
        </div>
    );
}

function SectionTitle({ kicker, children, sub, center }) {
    return (
        <Reveal className={center ? 'text-center flex flex-col items-center' : ''}>
            <Pill><Zap className="w-3.5 h-3.5 text-amber-300" />{kicker}</Pill>
            <h2 className="mt-5 font-display text-4xl sm:text-6xl font-semibold tracking-[-0.01em] text-white leading-[1]">{children}</h2>
            {sub && <p className={`mt-5 text-lg text-ink-soft leading-relaxed max-w-2xl ${center ? 'mx-auto' : ''}`}>{sub}</p>}
        </Reveal>
    );
}

/* ---------- hero (mockup) ---------- */

function Hero() {
    const { user } = useGame();
    const fade = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: EASE } });
    return (
        <section className="relative isolate overflow-hidden">
            <motion.div className="nd-hero-bg" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 2.4, ease: EASE }} />
            <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-36 sm:pt-44 pb-14 sm:pb-24 min-h-[640px] sm:min-h-[760px] md:min-h-[min(88vh,860px)] flex flex-col justify-end">
                <motion.div {...fade(0)}>
                    <Link to={user ? '/exploration' : '#fonctionnalites'} onClick={user ? undefined : jump('fonctionnalites')} className="inline-flex items-center gap-2 rounded-full nd-glass pl-1.5 pr-3.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors">
                        <span className="rounded-full bg-[#4fd18b] text-[#05130d] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">Nouveau</span>
                        Exploration sur la carte · Avatar 3D<ChevronRight className="w-3.5 h-3.5 text-white/60" />
                    </Link>
                </motion.div>
                <motion.h1 {...fade(0.1)} className="mt-5 font-display font-medium leading-[0.98] text-[clamp(3.1rem,11vw,6.6rem)] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                    Collectionne<br /><span className="text-[#a8f0c6] italic">la Nature</span>
                </motion.h1>
                <motion.p {...fade(0.25)} className="mt-5 max-w-lg text-[15px] sm:text-lg leading-relaxed text-white/75">
                    Capture les espèces cachées autour de chez toi, photographie le vivant sur le terrain, ouvre des boosters et habille ton naturaliste en 3D.
                </motion.p>
                <motion.div {...fade(0.4)} className="mt-8 flex items-end justify-between gap-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Link to={user ? '/exploration' : SIGNUP} className="nd-cta-gold group inline-flex items-center gap-2.5 pl-4 pr-3 sm:pl-5 sm:pr-4 py-3 sm:py-3.5 rounded-full font-bold text-sm sm:text-base whitespace-nowrap">
                            <Compass className="w-5 h-5" />{user ? 'Partir en exploration' : 'Jouer gratuitement'}<ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                        <Link to={user ? '/booster' : '#demo'} onClick={user ? undefined : jump('demo')} className="nd-cta-glass group inline-flex items-center gap-2.5 pl-4 pr-3 sm:pl-5 sm:pr-4 py-3 sm:py-3.5 rounded-full font-semibold text-sm sm:text-base text-white whitespace-nowrap">
                            <GalleryVerticalEnd className="w-5 h-5 text-[#a8f0c6]" />{user ? 'Ouvrir un booster' : 'Essayer un booster'}<ChevronRight className="w-4 h-4 text-white/60 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                    <p className="shrink-0 text-right text-[8px] min-[400px]:text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] sm:tracking-[0.28em] leading-[2] text-white/70 pb-1">
                        Plus qu'un jeu<br />une nature<br />à préserver
                        <span className="block ml-auto mt-2 w-12 h-px bg-gradient-to-l from-[#e9c46a] to-transparent" />
                    </p>
                </motion.div>
            </div>
        </section>
    );
}

/* ---------- everything you can do ---------- */

// The two first tiles are wide; `fresh` ones carry a "Nouveau" tag.
const FEATURES = [
    { to: '/exploration', Icon: Compass, color: '#4fd18b', fresh: true, title: 'Exploration', text: 'Des cartes cachées sur une vraie carte autour de toi, avec les espèces qui vivent vraiment dans ta région. De nouvelles toutes les 30 minutes.' },
    { to: '/avatar', Icon: Shirt, color: '#e9c46a', fresh: true, title: 'Ton avatar en 3D', text: 'Plus de 100 tenues, chapeaux et compagnons pour ton naturaliste. Fais-le tourner du doigt.' },
    { to: '/terrain', Icon: Camera, color: '#7cc6ff', title: 'Sur le terrain', text: 'Photographie une vraie espèce : l\'IA la reconnaît et ta photo devient une carte unique.' },
    { to: '/jardin', Icon: Sprout, color: '#8ee6a8', title: 'Jardin', text: 'Plante, récolte, et transforme tes plantes en boosters.' },
    { to: '/combat', Icon: Swords, color: '#ff8a65', title: 'Combat', text: 'Au tour par tour, sans hasard. Saisons, classement et badges.' },
    { to: '/quiz', Icon: Brain, color: '#c79bff', title: 'Quiz Arena', text: '4 modes de jeu et un concours chaque semaine : le podium gagne des pépites.' },
    { to: '/encheres', Icon: Gavel, color: '#f4c25b', title: 'Enchères', text: 'Vends tes doubles, trouve les espèces qui te manquent.' },
    { to: '/vitrines', Icon: Frame, color: '#ffb4d0', title: 'Vitrines', text: 'Compose et partage tes plus belles cartes.' },
    { to: '/amis', Icon: Users, color: '#a8f0c6', title: 'Amis et messages', text: 'Échange, discute et compare vos carnets.' },
    { to: '/trophees', Icon: Award, color: '#e9c46a', title: 'Trophées', text: 'Des dizaines de défis à débloquer au fil du jeu.' },
];

function Features() {
    const { user } = useGame();
    return (
        <section id="fonctionnalites" className="scroll-mt-20 max-w-6xl mx-auto px-5 sm:px-6 pt-8 pb-14">
            <h2 className="font-display text-[1.7rem] sm:text-4xl font-medium text-white">Bien plus que des boosters</h2>
            <p className="mt-1 text-ink-soft">Tout ce que tu peux faire dans NatureDex.</p>
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {FEATURES.map((f, i) => (
                    <Reveal key={f.to} delay={(i % 4) * 0.06} className={i < 2 ? 'col-span-2' : ''}>
                        <Link to={user ? f.to : SIGNUP} className="group relative flex flex-col h-full rounded-2xl nd-glass p-4 sm:p-5 overflow-hidden ring-1 ring-white/5 hover:ring-white/25 hover:-translate-y-0.5 transition">
                            <span className="absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-45" style={{ background: f.color }} aria-hidden />
                            <span className="flex items-center gap-2">
                                <span className="grid place-items-center w-10 h-10 rounded-xl" style={{ background: `${f.color}22`, color: f.color }}><f.Icon className="w-5 h-5" /></span>
                                {f.fresh && <span className="rounded-full bg-[#4fd18b] text-[#05130d] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">Nouveau</span>}
                            </span>
                            <h3 className={`mt-3 font-display font-semibold text-white ${i < 2 ? 'text-2xl' : 'text-lg'}`}>{f.title}</h3>
                            <p className={`mt-1 text-white/65 leading-snug ${i < 2 ? 'text-sm sm:text-[15px]' : 'text-[13px]'}`}>{f.text}</p>
                            <ChevronRight className="mt-auto pt-2 w-6 h-6 self-end text-white/30 transition group-hover:text-white group-hover:translate-x-0.5" />
                        </Link>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

/* ---------- Pass Naturaliste ---------- */

// Same values as PASS in functions/api/shop.mjs (and the free amounts it adds to).
const PASS_PERKS = [
    [CalendarCheck, 'Bonus du jour doublé', '200 graines + 40 pépites chaque jour'],
    [Compass, '15 captures par jour', 'en Exploration, au lieu de 10'],
    [Brain, 'Plus de parties de quiz', '5 en Classique (au lieu de 3), 3 en Survie (au lieu de 2), 5 en Blitz (au lieu de 3)'],
    [Clock, 'Booster gratuit toutes les 15 min', 'au lieu de toutes les 30 min'],
    [Shirt, '5 objets d\'avatar exclusifs', 'Mécène, Lauriers d\'or, Faon, garde forestier, Baskets ailées'],
    [Leaf, 'Badge Mécène', 'à côté de ton pseudo'],
    [HeartHandshake, '0,80 € par mois pour la nature', 'reversés à la LPO, au WWF France ou à Humanité & Biodiversité'],
];
const PASS_LOOK = { shirt: 'mecene', hat: 'lauriers', pet: 'faon', pants: 'garde', shoes: 'ailees', face: 'aucun', neck: 'aucun' };

function PassSection() {
    const { user } = useGame();
    const stage = useRef(null);
    // three.js is only downloaded once the section comes into view.
    const seen = useInView(stage, { once: true, margin: '200px' });
    const avatar = { ...(user?.avatar || defaultAvatar(user?.username || 'naturedex')), ...PASS_LOOK };
    const mine = user?.pass;
    return (
        <section id="pass" className="px-5 sm:px-6 py-10 scroll-mt-20">
            <Reveal>
                <div className="relative isolate overflow-hidden max-w-6xl mx-auto rounded-[2rem] ring-1 ring-[#e9c46a]/50 shadow-[0_0_80px_-30px_#e9c46a] bg-[linear-gradient(135deg,#0d3321,#0a2418_50%,#3a2c0c)] grid grid-cols-1 md:grid-cols-[1fr_1.15fr] items-center">
                    <Aurora className="-z-10 opacity-70" />
                    <div ref={stage} className="p-4 sm:p-6 md:pr-0">
                        {seen ? (
                            <AvatarStage avatar={avatar} height={400} className="shadow-2xl shadow-black/40">
                                <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/45 backdrop-blur px-3 py-1 text-[11px] font-bold text-[#f4d88f]">{user ? 'Tenue du Pass, sur ton avatar' : 'La tenue exclusive du Pass'}</span>
                            </AvatarStage>
                        ) : <div className="h-[400px] rounded-3xl bg-white/5" />}
                    </div>
                    <div className="px-6 pb-8 pt-2 sm:px-10 md:py-10">
                        <span className="inline-flex rounded-full bg-[#e9c46a] text-[#2a1c00] text-[11px] font-extrabold uppercase tracking-wider px-3 py-1">Abonnement solidaire</span>
                        <h2 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-white leading-[1.02]">Le Pass <span className="nd-gold-text">Naturaliste</span></h2>
                        <p className="mt-3 text-white/75">Plus de jeu chaque jour, une tenue que personne d'autre ne peut acheter, et un vrai coup de pouce régulier à la nature.</p>
                        <ul className="mt-6 grid sm:grid-cols-2 gap-x-5 gap-y-3.5">
                            {PASS_PERKS.map(([Icon, title, sub]) => (
                                <li key={title} className="flex items-start gap-3">
                                    <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-[#e9c46a]/15 text-[#e9c46a]"><Icon className="w-4 h-4" /></span>
                                    <span className="leading-snug"><b className="block text-sm text-white">{title}</b><span className="text-xs text-white/60">{sub}</span></span>
                                </li>
                            ))}
                        </ul>
                        {mine ? (
                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <PatronBadge />
                                <span className="text-white/80">Merci, ton Pass est actif.</span>
                                <Link to="/boutique" className="inline-flex items-center gap-1 text-sm font-semibold text-[#f4d88f] hover:text-white">Gérer mon Pass<ChevronRight className="w-4 h-4" /></Link>
                            </div>
                        ) : (
                            <div className="mt-7 flex flex-wrap items-center gap-4">
                                <Link to={user ? '/boutique' : SIGNUP} className="nd-cta-gold group inline-flex items-center gap-2 px-5 sm:px-6 py-3.5 rounded-full font-bold whitespace-nowrap">
                                    <Leaf className="w-5 h-5" />Prendre le Pass · 3,99 €/mois<ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                </Link>
                                <span className="text-xs text-white/55">{user ? <>Sans engagement,<br />résiliable en un clic.</> : <>Crée ton compte gratuit,<br />puis active le Pass en boutique.</>}</span>
                            </div>
                        )}
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

/* ---------- featured cards ---------- */

const KINGDOM = { plant: 'Flore', tree: 'Flore', alga: 'Flore', fungus: 'Fonge', mold: 'Fonge', bacteria: 'Microbe', virus: 'Microbe', fossil: 'Fossile', mineral: 'Minéral' };

function FeatCard({ card }) {
    const t = TYPES[card.type];
    const r = RARITIES[card.rarity];
    const shield = card.def ?? card.stats?.def ?? '—';
    return (
        <article className="nd-feat" style={{ '--r': r.color }}>
            <img src={card.thumb_url} alt={card.name} loading="lazy" draggable="false" />
            <div className="absolute top-3 left-3"><span className="nd-chip"><Gem className="w-3 h-3" />{r.label}</span></div>
            <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                <h3 className="font-display text-[1.25rem] sm:text-[1.4rem] font-semibold text-white leading-[1.05] line-clamp-2">{card.name}</h3>
                <p className="mt-1 text-[11px] sm:text-xs text-white/60">{KINGDOM[card.type] || 'Créature'} · {t.label}</p>
                <p className="mt-2 text-[11px] sm:text-xs italic text-white/80 leading-snug line-clamp-2">
                    {card.sci_name && card.sci_name !== card.name && <>{card.sci_name}<br /></>}
                    {RARITY_TIERS[card.rarity].replace(' de son type', '')} · {formatViews(card.views)} vues/an
                </p>
                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-3 text-xs font-bold text-white/85">
                    <span className="flex items-center gap-1" title="Points de vie"><Leaf className="w-3.5 h-3.5 text-[#4fd18b]" />{card.hp ?? '—'}</span>
                    <span className="flex items-center gap-1" title="Défense"><Shield className="w-3.5 h-3.5 text-[#a3b5a9]" />{shield}</span>
                    <span className="ml-auto grid place-items-center w-6 h-6 rounded-full" style={{ background: `${t.color}33`, color: t.color }} title={t.label}><t.Icon className="w-3.5 h-3.5" /></span>
                </div>
            </div>
        </article>
    );
}

function SectionHead({ title, to, link }) {
    return (
        <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-[1.7rem] sm:text-4xl font-medium text-white">{title}</h2>
            <Link to={to} className="flex items-center gap-0.5 text-sm font-semibold text-[#4fd18b] hover:text-[#a8f0c6] transition-colors whitespace-nowrap pb-1">
                {link}<ChevronRight className="w-4 h-4" />
            </Link>
        </div>
    );
}

function Featured({ cards }) {
    const { user } = useGame();
    const track = useRef(null);
    const [page, setPage] = useState(0);
    const [pages, setPages] = useState(1);

    function measure() {
        const el = track.current;
        if (!el) return;
        const count = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05));
        setPages(count);
        setPage(Math.round((el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)) * (count - 1)));
    }
    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [cards.length]);
    const goTo = (i) => {
        const el = track.current;
        el.scrollTo({ left: (i / Math.max(1, pages - 1)) * (el.scrollWidth - el.clientWidth), behavior: 'smooth' });
    };

    return (
        <section id="vedette" className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-4 pb-10 scroll-mt-24">
            <SectionHead title="Cartes en vedette" to={user ? '/collection' : '/connexion?mode=register'} link="Voir tout" />
            <div ref={track} onScroll={measure} className="nd-carousel mt-5 -mx-5 px-5 sm:-mx-6 sm:px-6 flex gap-3.5 sm:gap-5 overflow-x-auto pt-2 pb-6">
                {cards.map((c, i) => (
                    <motion.div key={c.id} className="shrink-0 w-[44vw] max-w-[230px] sm:w-[220px]"
                        initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: Math.min(i, 5) * 0.08, ease: EASE }}>
                        <FeatCard card={c} />
                    </motion.div>
                ))}
            </div>
            {pages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: pages }, (_, i) => (
                        <button key={i} onClick={() => goTo(i)} aria-label={`Page ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all ${i === page ? 'w-6 bg-[#4fd18b]' : 'w-1.5 bg-white/25 hover:bg-white/45'}`} />
                    ))}
                </div>
            )}
        </section>
    );
}

/* ---------- showcase of the week ---------- */

// Last week's contest winner, open to everyone (the gallery itself needs an account).
function WeekShowcase() {
    const { user } = useGame();
    const [w, setW] = useState(undefined);
    useEffect(() => {
        api('showcaseOfWeek').then((r) => setW(r.winner)).catch(() => setW(null));
    }, []);
    if (!w) return null;
    const s = w.showcase;
    const from = new Date(`${w.week}T12:00:00`);
    const to = new Date(from.getTime() + 6 * 86400_000);
    const day = (d, month) => `${d.getDate() === 1 ? '1er' : d.getDate()}${month ? ` ${d.toLocaleDateString('fr-FR', { month: 'long' })}` : ''}`;
    const period = from.getMonth() === to.getMonth() ? `du ${day(from)} au ${day(to, true)}` : `du ${day(from, true)} au ${day(to, true)}`;
    const profile = user ? `/joueur/${encodeURIComponent(w.username)}` : SIGNUP;

    return (
        <section id="vitrine-semaine" className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-6 pb-12 scroll-mt-24">
            <div className="relative overflow-hidden rounded-[2rem] ring-1 ring-[#e9c46a]/30 bg-gradient-to-br from-[#e9c46a]/15 via-[#e9c46a]/[0.04] to-transparent p-5 sm:p-10">
                <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
                    <Reveal>
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#e9c46a]"><Crown className="w-3.5 h-3.5" />Vitrine de la semaine</p>
                        <h2 className="mt-2 font-display text-[1.9rem] sm:text-5xl font-medium text-white leading-[1.05]">{s.title || `La vitrine de ${w.username}`}</h2>
                        <p className="mt-4 text-white/80 text-lg">
                            Par <Link to={profile} className="font-semibold text-[#f4d88f] hover:underline">{w.username}</Link>, {w.rank === 1 ? '1re' : `${w.rank}e`} place du concours {period}, avec <span className="font-semibold text-white">{w.votes} ♥</span>.
                        </p>
                        <p className="mt-3 text-sm text-ink-soft max-w-md">
                            Chaque semaine, les joueurs exposent leurs plus belles cartes et votent pour leurs vitrines préférées. Les ♥ repartent à zéro tous les lundis et le podium gagne des pépites.
                        </p>
                        <Link to={user ? '/vitrines' : SIGNUP}
                            className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold bg-[#e9c46a] text-[#2a1c00] hover:brightness-110">
                            <Frame className="w-4 h-4" />{user ? 'Voter pour les vitrines' : 'Créer ma vitrine'}<ArrowRight className="w-4 h-4" />
                        </Link>
                    </Reveal>
                    <Reveal delay={0.1} className={`mx-auto w-full ${s.format === 'carre' ? 'max-w-[360px] md:w-[360px]' : 'max-w-[280px] md:w-[280px]'}`}>
                        <Link to={profile} className="block rounded-2xl overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)] ring-[3px] ring-[#e9c46a] transition hover:-translate-y-1">
                            <ShowcaseThumb showcase={s} username={w.username} width={720} />
                        </Link>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}

/* ---------- blog ---------- */

const BLOG_URL = 'https://naturedex.fr/api/blog';

// The 3 latest articles of the daily nature blog (server-rendered pages, outside the app).
function BlogPosts() {
    const [posts, setPosts] = useState(null);
    useEffect(() => {
        api('blogLatest').then((r) => setPosts(r.posts)).catch(() => setPosts([]));
    }, []);
    if (posts && !posts.length) return null;

    return (
        <section id="blog" className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-6 pb-12">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#e9c46a]"><BookOpen className="w-3.5 h-3.5" />Le blog nature</p>
                    <h2 className="mt-1 font-display text-[1.7rem] sm:text-4xl font-medium text-white">Un article chaque jour</h2>
                </div>
                <a href={BLOG_URL} className="flex items-center gap-0.5 text-sm font-semibold text-[#4fd18b] hover:text-[#a8f0c6] transition-colors whitespace-nowrap pb-1">
                    Tous les articles<ChevronRight className="w-4 h-4" />
                </a>
            </div>
            <div className="mt-5 grid gap-4 sm:gap-5 md:grid-cols-3">
                {(posts || Array(3).fill(null)).map((p, i) => (p ? (
                    <motion.a key={p.slug} href={p.url}
                        className="group flex flex-col rounded-2xl overflow-hidden nd-glass hover:ring-1 hover:ring-[#4fd18b]/50 transition-shadow"
                        initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}>
                        <div className="aspect-[16/10] overflow-hidden bg-paper-deep">
                            <img src={p.image} alt={p.imageAlt} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        </div>
                        <div className="flex flex-col gap-2 p-4 sm:p-5 flex-1">
                            <span className="self-start px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/30">{p.category}</span>
                            <h3 className="font-display text-xl leading-snug text-white group-hover:text-[#f4d88f] transition-colors">{p.title}</h3>
                            <p className="text-sm text-white/65 line-clamp-3">{p.excerpt}</p>
                            <span className="mt-auto pt-1 flex items-center gap-1.5 text-xs text-ink-soft">
                                {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}<span aria-hidden>·</span><Clock className="w-3 h-3" />{p.minutes} min
                            </span>
                        </div>
                    </motion.a>
                ) : <div key={i} className="h-80 rounded-2xl nd-glass animate-pulse" />))}
            </div>
        </section>
    );
}

/* ---------- daily challenges ---------- */

function DailyChallenges() {
    const { user } = useGame();
    const [list, setList] = useState(null);
    useEffect(() => {
        if (!user) { setList(SAMPLE_CHALLENGES); return; }
        api('challenges').then((r) => setList(r.challenges)).catch(() => setList(SAMPLE_CHALLENGES));
    }, [user]);
    if (!list) return null;
    return (
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-6 pb-16">
            <SectionHead title="Défis du jour" to={user ? '/defis' : '/connexion?mode=register'} link="Voir tous" />
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {list.map((c, i) => (
                    <Reveal key={c.key} delay={i * 0.08} className={i >= 2 ? 'hidden lg:block' : ''}>
                        <Link to={user ? '/defis' : '/connexion?mode=register'} className="block h-full transition-transform hover:-translate-y-1">
                            <ChallengeCard challenge={c} />
                        </Link>
                    </Reveal>
                ))}
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
                        <Pill><Dices className="w-3.5 h-3.5 text-[#a8f0c6]" />Sans compte</Pill>
                        <h2 className="mt-5 font-display text-4xl sm:text-6xl font-semibold tracking-[-0.01em] text-white leading-[1]">
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

function Rarity({ show }) {
    const { user } = useGame();
    const max = show.top[0]?.views || 1;
    return (
        <section className="relative isolate overflow-hidden py-24">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_80%_30%,rgb(233_196_106/0.14),transparent),radial-gradient(45%_50%_at_10%_80%,rgb(79_209_139/0.14),transparent)]" />
            <div className="max-w-7xl mx-auto px-5">
                <SectionTitle kicker="Les raretés" sub="On compte les lectures de chaque article Wikipédia, puis on classe chaque espèce parmi celles de son type. Chaque type a ses Légendaires, même les bactéries. Et les 50 espèces les plus célèbres sont des cartes Secrètes, presque introuvables.">
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
                        <Reveal delay={show.ladder.length * 0.1} className="flex-1 flex flex-col items-center">
                            <motion.div className="nd-secret-glow" style={{ width: '100%' }} whileHover={{ y: -12, rotate: 2 }}>
                                <MysteryCard card={{ rarity: 'secret' }} />
                            </motion.div>
                            <div className="mt-5 text-center">
                                <div className="font-display text-lg font-bold nd-secret-text">{RARITIES.secret.symbol} {RARITIES.secret.label}</div>
                                <div className="text-xs uppercase tracking-[0.15em] text-white/45 mt-1">{RARITY_TIERS.secret}</div>
                            </div>
                        </Reveal>
                    </div>
                </div>

                <div className="mt-16 grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
                    <Reveal>
                        <h3 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Le panthéon du NatureDex</h3>
                        <p className="mt-4 text-ink-soft leading-relaxed">
                            Les Légendaires les plus lues de la collection (les Secrètes restent cachées), en lectures estimées par an. Une Légendaire apparaît dans environ
                            <b className="text-amber-300"> 1 booster sur 12</b>.
                        </p>
                        <Link to={user ? '/booster' : '/connexion?mode=register'} className="mt-8 inline-flex items-center gap-2 font-semibold text-[#f4d88f] hover:text-white transition-colors">
                            Tenter ma chance <ArrowRight className="w-4 h-4" />
                        </Link>
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
                                            <motion.div className="h-full rounded-full bg-gradient-to-r from-[#4fd18b] via-[#a8f0c6] to-[#e9c46a]"
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
                <div className="relative isolate overflow-hidden max-w-7xl mx-auto rounded-[2.5rem] px-8 sm:px-16 py-16 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center bg-[linear-gradient(135deg,#0d3321,#0a2418_50%,#3a2c0c)]">
                    <Aurora className="-z-10" />
                    <div className="nd-rays absolute -right-40 top-1/2 w-[700px] h-[700px] -translate-y-1/2 -z-10" />
                    <div>
                        <Sparkles className="w-8 h-8 text-amber-300" />
                        <h2 className="mt-4 font-display text-4xl sm:text-6xl font-semibold tracking-[-0.01em] text-white leading-[1]">Ton premier booster<br /><span className="nd-grad-text">t'attend.</span></h2>
                        <p className="mt-5 text-white/70 text-lg max-w-md">Crée ton compte en 10 secondes, avec un pseudo et un mot de passe. 10 ouvertures gratuites t'attendent, rechargées toutes les 30 minutes.</p>
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
    const { user, catalog } = useGame();
    const show = useShowcase(catalog);

    return (
        <div className="overflow-x-clip">
            <Hero />
            {show ? <Featured cards={show.featured} /> : <div className="h-[420px]" />}
            <WeekShowcase />
            <Features />
            {!user && show && <Demo show={show} />}
            <PassSection />
            <BlogPosts />
            <DailyChallenges />
            {show && (
                <>
                    <Rarity show={show} />
                    <Types show={show} />
                </>
            )}
            {!user && <FinalCta />}
        </div>
    );
}
