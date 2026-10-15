import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Clock, Gift, Droplets, Lock, Package, Plus, Recycle, Sparkles, Sprout, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Amount, Nugget, Plant, Seed } from '../components/Currency.jsx';
import { api, useGame } from '../api.jsx';
import BoosterOpening from '../components/BoosterOpening.jsx';

const SEED_ORDER = ['radis', 'tournesol', 'chene', 'rose'];
const SEED_TAGS = { radis: 'Dorée 1 sur 5', rose: 'Meilleur rendement' };
const LAST_SEED = 'naturdex.lastSeed';

// Colours of each species once grown: stem, leaves, and the flower / crown / root.
const LOOK = {
    radis: { leaf: '#5fcf6b', head: '#e5486b', headHi: '#ff9bb0' },
    tournesol: { leaf: '#4fbf5a', head: '#f7c531', headHi: '#7a4a12' },
    chene: { leaf: '#3f9e4f', head: '#2f8a43', headHi: '#7cc96a' },
    rose: { leaf: '#46b07a', head: '#b98cff', headHi: '#f0e3ff' },
};

// Graines available once every pépite is converted (planting converts only what is missing).
const per = (user) => user.nuggetsPerSeed ?? 2;
const budgetOf = (user) => user.coins + Math.floor(user.nuggets / per(user));
const nuggetsFor = (user, cost) => Math.max(0, cost - user.coins) * per(user);

const duration = (minutes) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} h`);
function left(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, '0')}` : m ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
}

/** Server clock, ticking every second (growth stages and countdowns). */
function useServerNow(serverIso) {
    const offset = useRef(0);
    const [now, setNow] = useState(Date.now());
    useEffect(() => { if (serverIso) offset.current = new Date(serverIso).getTime() - Date.now(); }, [serverIso]);
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    return now + offset.current;
}

/** A plant drawn in 4 stages: 0 seed in the ground, 1 sprout, 2 young plant, 3 grown. */
function PlantArt({ kind, stage, className = '' }) {
    const c = LOOK[kind] || LOOK.tournesol;
    const stem = [0, 22, 36, 46][stage];
    const top = 92 - stem;
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
            <ellipse cx="50" cy="93" rx="22" ry="5" fill="#2a170b" opacity="0.55" />
            {stage === 0 && (
                <>
                    <path d="M34 92q16-12 32 0z" fill="#6b4226" />
                    <ellipse cx="50" cy="86" rx="5" ry="3.5" fill="#d9b26a" />
                    <path d="M50 83q2-5 5-6" stroke={c.leaf} strokeWidth="2.4" strokeLinecap="round" fill="none" />
                </>
            )}
            {stage > 0 && (
                <>
                    <path d={`M50 92C50 ${92 - stem / 2} 48 ${top + 8} 50 ${top}`} stroke="#3f8f3c" strokeWidth={stage === 3 && kind === 'chene' ? 7 : 3.4} strokeLinecap="round" fill="none" />
                    <path d={`M50 ${92 - stem * 0.35}q-14-4-18-14q12-1 18 10z`} fill={c.leaf} />
                    <path d={`M50 ${92 - stem * 0.55}q14-4 18-14q-12-1-18 10z`} fill={c.leaf} />
                    {stage === 1 && <path d={`M50 ${top}q-7-6-4-12q6 4 4 12zM50 ${top}q7-6 4-12q-6 4-4 12z`} fill={c.leaf} />}
                    {stage === 2 && <circle cx="50" cy={top} r="7" fill={c.head} opacity="0.8" />}
                </>
            )}
            {stage === 3 && kind === 'tournesol' && (
                <g transform={`translate(50 ${top})`}>
                    {Array.from({ length: 12 }, (_, i) => <ellipse key={i} rx="5" ry="11" cy="-13" fill={c.head} transform={`rotate(${i * 30})`} />)}
                    <circle r="10" fill={c.headHi} />
                    <circle r="10" fill="url(#nd-seeds)" opacity="0.5" />
                </g>
            )}
            {stage === 3 && kind === 'radis' && (
                <g>
                    <path d={`M50 ${top + 2}q-12-12-8-24q8 8 8 24zM50 ${top + 2}q12-12 8-24q-8 8-8 24zM50 ${top + 2}q0-16 0-26`} fill={c.leaf} stroke={c.leaf} strokeWidth="2" />
                    <path d="M38 80q12-14 24 0q-2 12-12 14q-10-2-12-14z" fill={c.head} />
                    <path d="M44 80q4-5 8-5" stroke={c.headHi} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>
            )}
            {stage === 3 && kind === 'chene' && (
                <g>
                    <circle cx="50" cy={top - 2} r="20" fill={c.head} />
                    <circle cx="36" cy={top + 8} r="13" fill={c.head} />
                    <circle cx="64" cy={top + 8} r="13" fill={c.head} />
                    <circle cx="44" cy={top - 8} r="8" fill={c.headHi} opacity="0.5" />
                    <ellipse cx="60" cy={top + 12} rx="3" ry="4" fill="#b7793a" />
                    <ellipse cx="40" cy={top + 2} rx="3" ry="4" fill="#b7793a" />
                </g>
            )}
            {stage === 3 && kind === 'rose' && (
                <g transform={`translate(50 ${top})`}>
                    {Array.from({ length: 6 }, (_, i) => <ellipse key={i} rx="8" ry="12" cy="-8" fill={c.head} opacity="0.9" transform={`rotate(${i * 60})`} />)}
                    <circle r="8" fill={c.headHi} />
                    <path d="M-3-2a5 5 0 1 0 6-3a4 4 0 1 1-6 3z" fill="#fff8c9" />
                </g>
            )}
            <defs>
                <pattern id="nd-seeds" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#2a1505" /></pattern>
            </defs>
        </svg>
    );
}

function SeedPicker({ user, garden, emptyCount, onPlant, onClose, busy }) {
    return createPortal(
        <motion.div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] bg-[#081a11] ring-1 ring-white/10 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                <h2 className="font-display text-2xl text-white pr-10 flex items-center gap-2"><Sprout className="w-6 h-6 text-[#8ee6a8]" />Que veux-tu planter ?</h2>
                <p className="mt-1 text-sm text-ink-soft">Tu as <Amount seeds={user.coins} /> et <Amount nuggets={user.nuggets} />. S'il manque des graines, tes pépites sont converties.</p>
                <ul className="mt-5 space-y-2.5">
                    {SEED_ORDER.map((kind) => {
                        const s = garden.seeds[kind];
                        const poor = budgetOf(user) < s.cost;
                        const needNuggets = nuggetsFor(user, s.cost);
                        const many = Math.min(emptyCount, Math.floor(budgetOf(user) / s.cost));
                        const perBooster = Math.round((s.cost * user.boosterPlants) / s.plants);
                        return (
                            <li key={kind}>
                                <button type="button" disabled={busy || poor} onClick={() => onPlant(kind, false)}
                                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/10 hover:ring-[#8ee6a8]/50 transition-colors disabled:opacity-45 disabled:hover:bg-white/[0.04]">
                                    <span className="shrink-0 w-16 h-16 rounded-xl bg-gradient-to-b from-[#1d3a26] to-[#3b2414] grid place-items-center">
                                        <PlantArt kind={kind} stage={3} className="w-14 h-14" />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2 flex-wrap">
                                            <b className="text-white">{s.name}</b>
                                            {SEED_TAGS[kind] && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${kind === 'rose' ? 'bg-[#e9c46a] text-[#3b2a05]' : 'bg-[#8ee6a8]/20 text-[#a8f0c6]'}`}>{SEED_TAGS[kind]}</span>}
                                        </span>
                                        <span className="mt-1 flex items-center gap-3 text-sm text-white/80">
                                            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-white/50" />{duration(s.minutes)}</span>
                                            <span>→ <Amount plants={s.plants} /></span>
                                        </span>
                                        <span className="block mt-0.5 text-[11px] text-white/45">≈ {perBooster} graines par booster</span>
                                        {!poor && needNuggets > 0 && <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#f4c25b]"><Nugget className="w-3 h-3" />{needNuggets} pépite{needNuggets > 1 ? 's' : ''} converties</span>}
                                    </span>
                                    <span className="shrink-0 px-3 py-1.5 rounded-full bg-black/30 ring-1 ring-white/10"><Amount seeds={s.cost} /></span>
                                </button>
                                {many > 1 && (
                                    <button type="button" disabled={busy} onClick={() => onPlant(kind, true)}
                                        className="mt-1 ml-[4.75rem] text-xs font-semibold text-[#a8f0c6] hover:underline disabled:opacity-50">
                                        Planter dans {many} parcelles vides ({many * s.cost} graines{nuggetsFor(user, many * s.cost) ? `, dont ${nuggetsFor(user, many * s.cost)} pépites` : ''})
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </motion.div>
        </motion.div>,
        document.body
    );
}

function Plot({ plot, seeds, now, onEmpty, onHarvest, onWater, gain, busy }) {
    const ready = plot && new Date(plot.readyAt).getTime() <= now;
    let stage = 0, progress = 0;
    if (plot) {
        const from = new Date(plot.plantedAt).getTime(), to = new Date(plot.readyAt).getTime();
        progress = Math.min(1, Math.max(0, (now - from) / Math.max(1, to - from)));
        stage = ready ? 3 : progress < 0.3 ? 0 : progress < 0.7 ? 1 : 2;
    }
    const click = () => (!plot ? onEmpty() : ready ? onHarvest() : null);
    return (
        <motion.div layout className={`relative aspect-square rounded-[1.4rem] overflow-hidden nd-soil ring-1 ${ready ? 'ring-[#e9c46a]/80 shadow-[0_0_30px_-6px_#e9c46a]' : 'ring-black/40'}`}>
            <button type="button" onClick={click} disabled={busy || (plot && !ready)} className="absolute inset-0 w-full h-full grid place-items-center disabled:cursor-default" aria-label={!plot ? 'Planter' : ready ? 'Récolter' : 'En train de pousser'}>
                {!plot && (
                    <span className="flex flex-col items-center gap-1 text-white/55">
                        <span className="grid place-items-center w-11 h-11 rounded-full border-2 border-dashed border-white/30"><Plus className="w-5 h-5" /></span>
                        <span className="text-xs font-semibold">Planter</span>
                    </span>
                )}
                {plot && (
                    <motion.span className="block w-[78%] h-[78%] origin-bottom"
                        animate={ready ? { y: [0, -6, 0], rotate: [0, -3, 3, 0] } : { rotate: [-1.5, 1.5, -1.5] }}
                        transition={ready ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                        <PlantArt kind={plot.kind} stage={stage} className="w-full h-full" />
                    </motion.span>
                )}
            </button>
            {plot && !ready && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2">
                    <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#4fd18b] to-[#c7ef7a] transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <p className="mt-1 text-center text-[11px] font-bold text-white tabular-nums drop-shadow">{left(new Date(plot.readyAt).getTime() - now)}</p>
                </div>
            )}
            {plot && !ready && !plot.watered && (
                <motion.button type="button" disabled={busy} onClick={onWater} aria-label="Arroser : −30 % de temps" title="Arroser : −30 % de temps"
                    className="absolute top-1.5 right-1.5 grid place-items-center w-9 h-9 rounded-full bg-[#2b8fd6] text-white shadow-lg ring-2 ring-[#9fd8ff]/60"
                    animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
                    <Droplets className="w-5 h-5" />
                </motion.button>
            )}
            {plot && plot.watered && !ready && <Droplets className="absolute top-2 right-2 w-4 h-4 text-[#9fd8ff]/70" aria-label="Arrosée" />}
            {plot && (
                <span className="pointer-events-none absolute top-2 left-2 right-11 truncate text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-white/70 drop-shadow">{seeds[plot.kind]?.name}</span>
            )}
            {ready && (
                <span className="pointer-events-none absolute bottom-2 inset-x-0 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-[#e9c46a] text-[#3b2a05] text-[11px] font-black uppercase tracking-wide shadow">Récolter !</span>
                </span>
            )}
            <AnimatePresence>
                {gain && (
                    <motion.div key={gain.id} className="pointer-events-none absolute inset-0 grid place-items-center"
                        initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: 1, y: -24, scale: 1 }} exit={{ opacity: 0, y: -60 }} transition={{ duration: 0.6 }}>
                        <span className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-display font-black text-xl shadow-xl ${gain.golden ? 'bg-[#e9c46a] text-[#3b2a05]' : 'bg-[#0b2117] text-[#c7ef7a] ring-1 ring-[#c7ef7a]/50'}`}>
                            +{gain.plants}<Plant className="w-5 h-5" />
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function LockedPlot({ price, next, canPay, onUnlock, busy }) {
    return (
        <button type="button" disabled={!next || !canPay || busy} onClick={onUnlock}
            className={`relative aspect-square rounded-[1.4rem] grid place-items-center border-2 border-dashed transition-colors ${next ? 'bg-white/[0.04] border-white/20 hover:bg-white/[0.08] disabled:hover:bg-white/[0.04]' : 'bg-white/[0.02] border-white/10 opacity-50'}`}>
            <span className="flex flex-col items-center gap-1.5 text-white/70">
                <Lock className="w-6 h-6" />
                {next ? (
                    <>
                        <span className="text-xs font-semibold">Nouvelle parcelle</span>
                        <Amount seeds={price} className={`text-sm ${canPay ? '' : 'opacity-60'}`} />
                    </>
                ) : null}
            </span>
        </button>
    );
}

// The grainerie: pépites → graines in one tap, with the free and paid ways to get more pépites.
function Converter({ user, busy, onConvert }) {
    const rate = per(user);
    const bonus = user.convertBonus?.ready ? user.convertBonus : null;
    const base = (n) => Math.floor(n / rate);
    const gives = (n) => base(n) + (bonus ? Math.min(bonus.max, Math.floor(base(n) * bonus.rate)) : 0);
    const all = user.nuggets - (user.nuggets % rate);
    const options = [...new Set([20, 100, 200].filter((n) => n < all).concat(all > 0 ? [all] : []))];
    return (
        <div className="mt-6 p-4 rounded-[1.6rem] bg-gradient-to-br from-[#f4c25b]/12 to-white/[0.03] ring-1 ring-[#f4c25b]/25">
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-display text-lg font-bold text-white">
                    <Nugget className="w-5 h-5" /><ArrowRight className="w-4 h-4 text-white/40" /><Seed className="w-5 h-5" />Grainerie
                </span>
                <span className="ml-auto text-xs font-semibold text-white/60">{rate} pépites = 1 graine</span>
            </div>
            {bonus ? (
                <motion.p initial={{ scale: 0.96 }} animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 1.8, repeat: Infinity }}
                    className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#e9c46a] text-[#2a1c00] text-sm font-bold">
                    <Gift className="w-4 h-4 shrink-0" />Bonus du jour : +{Math.round(bonus.rate * 100)} % sur ta première conversion (jusqu'à +{bonus.max} graines)
                </motion.p>
            ) : (
                <p className="mt-2 text-xs text-white/50">Bonus du jour utilisé : il revient demain.</p>
            )}
            {all > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {options.map((n) => (
                        <button key={n} type="button" disabled={busy} onClick={() => onConvert(n)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold tabular-nums disabled:opacity-50 ${n === all ? 'bg-[#e9c46a] text-[#2a1c00] hover:brightness-110' : 'bg-black/25 ring-1 ring-[#f4c25b]/35 text-[#f8d98a] hover:bg-black/40'}`}>
                            {n === all && options.length > 1 ? 'Tout · ' : ''}<Nugget className="w-3.5 h-3.5" />{n.toLocaleString('fr-FR')}<ArrowRight className="w-3 h-3 opacity-60" /><Seed className="w-3.5 h-3.5" />{gives(n).toLocaleString('fr-FR')}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="mt-2 text-sm text-ink-soft">{user.nuggets ? `Il faut au moins ${rate} pépites pour une graine.` : "Plus de pépites pour l'instant."}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold">
                <Link to="/collection" className="inline-flex items-center gap-1 text-[#a8f0c6] hover:underline"><Recycle className="w-3.5 h-3.5" />Gratuit : recycle tes doublons</Link>
                <Link to="/boutique" className="inline-flex items-center gap-1 text-[#f4c25b] hover:underline"><Plus className="w-3.5 h-3.5" />Plus de pépites</Link>
            </div>
        </div>
    );
}

export default function Garden() {
    const { user, setUser, addCards, refreshBadges } = useGame();
    const [garden, setGarden] = useState(null);
    const [picker, setPicker] = useState(null); // slot being planted
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [gains, setGains] = useState({}); // slot → floating "+N"
    const [toast, setToast] = useState(null);
    const [opening, setOpening] = useState(null);
    const now = useServerNow(garden?.now);

    useEffect(() => { api('garden').then((res) => { setGarden(res.garden); setUser(res.user); }).catch((err) => setError(err.message)); }, [setUser]);

    async function run(action, params) {
        setBusy(true);
        setError('');
        try {
            const res = await api(action, params);
            if (res.garden) setGarden(res.garden);
            setUser(res.user);
            return res;
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    if (!garden) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Le jardin se réveille…'}</div>;

    const plots = garden.plots;
    const readyCount = plots.filter((p) => p && new Date(p.readyAt).getTime() <= now).length;
    const emptyCount = plots.filter((p) => !p).length;
    const lastSeed = garden.seeds[localStorage.getItem(LAST_SEED)] ? localStorage.getItem(LAST_SEED) : 'tournesol';
    const toBooster = user.boosterPlants - (user.plants % user.boosterPlants);
    const canOpen = user.plants >= user.boosterPlants;

    async function plant(kind, everywhere, slot = picker) {
        localStorage.setItem(LAST_SEED, kind);
        const res = await run('plant', everywhere ? { kind, convert: true } : { kind, slot, convert: true });
        if (!res) return;
        setPicker(null);
        refreshBadges();
        if (res.converted) {
            const id = Date.now();
            setToast({ id, text: `${res.converted} pépite${res.converted > 1 ? 's' : ''} → ${res.converted / per(user)} graine${res.converted / per(user) > 1 ? 's' : ''}`, nugget: true });
            setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2400);
        }
    }
    async function harvest(slot) {
        const res = await run('harvest', slot == null ? {} : { slot });
        if (!res) return;
        refreshBadges();
        const id = Date.now();
        setGains(Object.fromEntries(res.harvest.map((h) => [h.slot, { ...h, id }])));
        setTimeout(() => setGains({}), 1400);
        const golden = res.harvest.filter((h) => h.golden).length;
        const treasure = res.harvest.filter((h) => h.treasure).length;
        if (treasure) setToast({ id, gold: true, text: `Trésor ! ${treasure > 1 ? `${treasure} boosters bonus` : 'Un booster bonus'} enfoui sous la terre` });
        else if (golden) setToast({ id, gold: true, text: `Récolte dorée ×2${golden > 1 ? ` sur ${golden} parcelles` : ''} !` });
        else setToast({ id, text: `+${res.harvest.reduce((n, h) => n + h.plants, 0)} plantes récoltées` });
        setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600);
    }
    async function convert(nuggets) {
        const res = await run('convert', { nuggets });
        if (!res) return;
        const id = Date.now();
        setToast(res.bonus
            ? { id, gold: true, text: `+${res.seeds} graines, dont +${res.bonus} de bonus du jour !` }
            : { id, text: `+${res.seeds} graines`, nugget: true });
        setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2000);
    }
    async function openBooster() {
        const res = await run('openBooster', { pay: 'plants' });
        if (res) { addCards(res.cards); setOpening(res.cards); }
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Jardin de {user.username}</p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white mt-1">Plante, récolte, ouvre.</h1>
            <p className="mt-2 text-ink-soft">Tes pépites deviennent des graines, tes graines des plantes. <b className="text-white">{user.boosterPlants} plantes = 1 booster.</b></p>

            {/* harvest → booster */}
            <div className="mt-6 relative p-5 rounded-[1.8rem] nd-glass nd-ring overflow-hidden">
                <div className="absolute inset-0 opacity-25" style={{ background: 'radial-gradient(circle at 15% 20%, #c7ef7a, transparent 45%), radial-gradient(circle at 90% 100%, #e9c46a, transparent 50%)' }} />
                <div className="relative flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 mr-auto">
                        <motion.span key={user.plants} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="grid place-items-center w-14 h-14 rounded-2xl bg-[#c7ef7a]/15 ring-1 ring-[#c7ef7a]/40">
                            <Plant className="w-8 h-8" />
                        </motion.span>
                        <div>
                            <p className="font-display text-3xl font-bold text-white tabular-nums leading-none">{user.plants.toLocaleString('fr-FR')}</p>
                            <p className="text-sm text-ink-soft mt-1">{canOpen ? `${Math.floor(user.plants / user.boosterPlants)} booster${user.plants >= 2 * user.boosterPlants ? 's' : ''} à ouvrir` : `encore ${toBooster} pour un booster`}</p>
                        </div>
                    </div>
                    <button type="button" disabled={busy || !canOpen} onClick={openBooster}
                        className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold disabled:opacity-40 disabled:grayscale ${canOpen ? 'nd-btn' : 'bg-white/10 text-white'}`}>
                        <Package className="w-5 h-5" />Ouvrir un booster · <Plant className="w-4 h-4" />{user.boosterPlants}
                    </button>
                </div>
                <div className="relative mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${user.boosterPlants}, 1fr)` }}>
                    {Array.from({ length: user.boosterPlants }, (_, i) => {
                        const on = canOpen || i < user.plants % user.boosterPlants;
                        return <motion.span key={i} className="h-2.5 rounded-full" initial={false}
                            animate={{ background: on ? '#c7ef7a' : 'rgba(255,255,255,0.12)', boxShadow: on ? '0 0 10px -2px #c7ef7a' : '0 0 0 0 transparent' }} />;
                    })}
                </div>
            </div>

            {/* quick actions */}
            <div className="mt-6 flex flex-wrap gap-2">
                {readyCount > 0 && (
                    <motion.button type="button" disabled={busy} onClick={() => harvest()} initial={{ scale: 0.9 }} animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-full nd-btn font-bold">
                        <Sparkles className="w-5 h-5" />Tout récolter ({readyCount})
                    </motion.button>
                )}
                {emptyCount > 0 && (
                    <button type="button" disabled={busy || budgetOf(user) < garden.seeds[lastSeed].cost} onClick={() => plant(lastSeed, true)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white/10 ring-1 ring-white/15 text-white font-semibold hover:bg-white/15 disabled:opacity-40">
                        <Seed className="w-5 h-5" />{plots.some(Boolean) ? 'Replanter' : 'Tout planter'} · {garden.seeds[lastSeed].name}
                    </button>
                )}
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}

            {/* the plots */}
            <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-4">
                {plots.map((plot, slot) => (
                    <Plot key={slot} plot={plot} seeds={garden.seeds} now={now} busy={busy} gain={gains[slot]}
                        onEmpty={() => setPicker(slot)} onHarvest={() => harvest(slot)} onWater={() => run('water', { slot })} />
                ))}
                {Array.from({ length: garden.maxPlots - plots.length }, (_, i) => (
                    <LockedPlot key={`l${i}`} next={i === 0} price={garden.nextPlotPrice} canPay={user.coins >= garden.nextPlotPrice} busy={busy}
                        onUnlock={() => window.confirm(`Débloquer une nouvelle parcelle pour ${garden.nextPlotPrice} graines ?`) && run('unlockPlot')} />
                ))}
            </div>

            <Converter user={user} busy={busy} onConvert={convert} />

            {/* how it works */}
            <ol className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                {[
                    [Nugget, 'Convertis', `${per(user)} pépites = 1 graine, +50 % sur la première conversion du jour.`],
                    [Seed, 'Plante', 'Choisis une graine. Plus elle pousse longtemps, plus elle rapporte.'],
                    [Droplets, 'Arrose', `Une fois par plante : ${Math.round(garden.waterCut * 100)} % de temps en moins.`],
                    [Sparkles, 'Récolte', `1 chance sur 10 d'une récolte dorée ×2 (1 sur 5 pour le radis)… et parfois un booster caché !`],
                ].map(([Icon, title, text], i) => (
                    <li key={title} className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                        <p className="flex items-center gap-2 font-display text-lg font-bold text-white"><span className="text-white/40 text-sm">{i + 1}</span><Icon className="w-5 h-5 text-[#8ee6a8] shrink-0" />{title}</p>
                        <p className="mt-1 text-ink-soft">{text}</p>
                    </li>
                ))}
            </ol>

            <AnimatePresence>
                {toast && (
                    <motion.div key={toast.id} className="fixed z-[60] left-1/2 top-24 -translate-x-1/2 pointer-events-none"
                        initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }}>
                        <div className={`flex items-center gap-2 px-5 py-3 rounded-full font-bold shadow-2xl whitespace-nowrap ${toast.gold ? 'bg-[#e9c46a] text-[#3b2a05]' : 'bg-[#0b2117] text-[#c7ef7a] ring-1 ring-[#c7ef7a]/40'}`}>
                            {toast.gold ? <Sparkles className="w-5 h-5" /> : toast.nugget ? <Seed className="w-5 h-5" /> : <Plant className="w-5 h-5" />}{toast.text}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {picker != null && <SeedPicker user={user} garden={garden} emptyCount={emptyCount} busy={busy} onPlant={plant} onClose={() => setPicker(null)} />}
            </AnimatePresence>
            <AnimatePresence>
                {opening && (
                    <BoosterOpening key={opening.map((c) => c.id).join('-')} cards={opening} onClose={() => setOpening(null)}
                        canOpenAgain={user.plants >= user.boosterPlants} onAgain={openBooster} />
                )}
            </AnimatePresence>
        </div>
    );
}
