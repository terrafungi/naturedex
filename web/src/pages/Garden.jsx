/**
 * Jardin 2.0: a floating 3D island to farm, with villagers' orders, a barn, a workshop, a hive,
 * decorations, daily quests, levels and an arcade of mini-games. Every action goes through the
 * garden actions of the API (functions/api/garden.mjs). A classic 2D view stays available,
 * and is used automatically when the device has no WebGL.
 */
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Box, Bug, Clock, CloudRain, Droplets, FlaskConical, Gamepad2, Gift, Grid3x3, Lock, Moon, Package, Plus, Recycle, ScrollText, ShoppingBag, Sparkles, Sprout, Sun, Warehouse, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Amount, Nugget, Plant, Seed } from '../components/Currency.jsx';
import { api, useGame } from '../api.jsx';
import { sfx } from '../sfx.js';
import BoosterOpening from '../components/BoosterOpening.jsx';
import { Compost, Fertilizer, Honey, PlantArt, SEED_ORDER, SEED_TAGS, budgetOf, daylight, duration, growth, left, nuggetsFor, parisHour, per } from '../garden/art.jsx';
import HoneyShopPanel from '../garden/HoneyShop.jsx';
import { ArcadePanel, BarnPanel, HivePanel, LevelPanel, LevelUp, OrdersPanel, PlotPanel, QuestsPanel, WorkshopPanel } from '../garden/Panels.jsx';

const Island3D = lazy(() => import('../garden/Island3D.jsx'));
const GameOverlay = lazy(() => import('../garden/Games.jsx'));
const LAST_SEED = 'naturdex.lastSeed';
const VIEW = 'naturdex.gardenView';

// If the 3D scene throws while rendering, fall back to the classic view instead of a blank page.
class SceneGuard extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(err) { console.warn('Island3D', err?.message, err?.stack); this.props.onFail(); }
    render() { return this.state.failed ? null : this.props.children; }
}

function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
        return false;
    }
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

function SeedPicker({ user, garden, emptyCount, onPlant, onClose, busy }) {
    return createPortal(
        <motion.div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} />
            <motion.div className="relative w-full sm:max-w-lg max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] sm:rounded-[2rem] bg-[#081a11]/95 ring-1 ring-white/10 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                <h2 className="font-display text-2xl text-white pr-10 flex items-center gap-2"><Sprout className="w-6 h-6 text-[#8ee6a8]" />Que veux-tu planter ?</h2>
                <p className="mt-1 text-sm text-ink-soft">Tu as <Amount seeds={user.coins} /> et <Amount nuggets={user.nuggets} />. S'il manque des graines, tes pépites sont converties.</p>
                <ul className="mt-5 space-y-2.5">
                    {SEED_ORDER.map((kind) => {
                        const s = garden.seeds[kind];
                        const locked = garden.level < s.level;
                        const poor = budgetOf(user) < s.cost;
                        const needNuggets = nuggetsFor(user, s.cost);
                        const many = Math.min(emptyCount, Math.floor(budgetOf(user) / s.cost));
                        return (
                            <li key={kind}>
                                <button type="button" disabled={busy || poor || locked} onClick={() => onPlant(kind, false)}
                                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/10 hover:ring-[#8ee6a8]/50 transition-colors disabled:opacity-45 disabled:hover:bg-white/[0.04]">
                                    <span className="relative shrink-0 w-16 h-16 rounded-xl bg-gradient-to-b from-[#1d3a26] to-[#3b2414] grid place-items-center">
                                        <PlantArt kind={kind} stage={3} className={`w-14 h-14 ${locked ? 'grayscale brightness-50' : ''}`} />
                                        {locked && <Lock className="absolute w-5 h-5 text-white" />}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2 flex-wrap">
                                            <b className="text-white">{s.name}</b>
                                            {locked ? <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">Niveau {s.level}</span>
                                                : SEED_TAGS[kind] && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${kind === 'rose' || kind === 'lotus' ? 'bg-[#e9c46a] text-[#3b2a05]' : 'bg-[#8ee6a8]/20 text-[#a8f0c6]'}`}>{SEED_TAGS[kind]}</span>}
                                        </span>
                                        <span className="mt-1 flex items-center gap-3 text-sm text-white/80">
                                            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-white/50" />{duration(s.minutes)}</span>
                                            <span>→ <Amount plants={s.plants} /></span>
                                            {s.honey ? <span className="inline-flex items-center gap-0.5 text-[#ffcf5a] font-bold"><Honey className="w-3.5 h-3.5" />{s.honey}</span> : null}
                                        </span>
                                        <span className="block mt-0.5 text-[11px] text-white/45">+{s.xp} XP · ≈ {Math.round((s.cost * user.boosterPlants) / s.plants)} graines par booster</span>
                                        {!locked && !poor && needNuggets > 0 && <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#f4c25b]"><Nugget className="w-3 h-3" />{needNuggets} pépite{needNuggets > 1 ? 's' : ''} converties</span>}
                                    </span>
                                    <span className="shrink-0 px-3 py-1.5 rounded-full bg-black/30 ring-1 ring-white/10"><Amount seeds={s.cost} /></span>
                                </button>
                                {!locked && many > 1 && (
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

// The classic 2D grid (no WebGL, or by choice).
function ClassicPlot({ plot, garden, now, onTap }) {
    const g = growth(plot, now);
    return (
        <button type="button" onClick={onTap} className={`relative aspect-square rounded-[1.4rem] overflow-hidden nd-soil ring-1 grid place-items-center ${g?.ready ? 'ring-[#e9c46a]/80 shadow-[0_0_30px_-6px_#e9c46a]' : 'ring-black/40'} ${plot?.watered ? 'brightness-90' : ''}`}>
            {!plot && <span className="flex flex-col items-center gap-1 text-white/55"><span className="grid place-items-center w-11 h-11 rounded-full border-2 border-dashed border-white/30"><Plus className="w-5 h-5" /></span><span className="text-xs font-semibold">Planter</span></span>}
            {plot && (
                <motion.span className="block w-[78%] h-[78%] origin-bottom" animate={g.ready ? { y: [0, -6, 0] } : { rotate: [-1.5, 1.5, -1.5] }} transition={{ duration: g.ready ? 1.2 : 4, repeat: Infinity }}>
                    <PlantArt kind={plot.kind} stage={g.stage} className="w-full h-full" />
                </motion.span>
            )}
            {plot && <span className="pointer-events-none absolute top-2 left-2 right-8 truncate text-left text-[10px] font-bold uppercase tracking-wider text-white/70">{garden.seeds[plot.kind]?.name}</span>}
            {g?.pest && <span className="absolute top-1.5 right-1.5 text-2xl animate-bounce">🐌</span>}
            {plot?.watered && !g.ready && !g.pest && <Droplets className="absolute top-2 right-2 w-4 h-4 text-[#9fd8ff]/70" />}
            {plot && !g.ready && (
                <span className="pointer-events-none absolute inset-x-2 bottom-2">
                    <span className="block h-1.5 rounded-full bg-black/40 overflow-hidden"><span className="block h-full rounded-full bg-gradient-to-r from-[#4fd18b] to-[#c7ef7a]" style={{ width: `${g.progress * 100}%` }} /></span>
                    <span className="block mt-1 text-center text-[11px] font-bold text-white tabular-nums">{left(g.left)}</span>
                </span>
            )}
            {g?.ready && <span className="pointer-events-none absolute bottom-2 px-2.5 py-1 rounded-full bg-[#e9c46a] text-[#3b2a05] text-[11px] font-black uppercase">Récolter !</span>}
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
        <div className="p-4 rounded-[1.6rem] bg-gradient-to-br from-[#f4c25b]/12 to-white/[0.03] ring-1 ring-[#f4c25b]/25">
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
            ) : <p className="mt-2 text-xs text-white/50">Bonus du jour utilisé : il revient demain.</p>}
            {all > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {options.map((n) => (
                        <button key={n} type="button" disabled={busy} onClick={() => onConvert(n)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold tabular-nums disabled:opacity-50 ${n === all ? 'bg-[#e9c46a] text-[#2a1c00] hover:brightness-110' : 'bg-black/25 ring-1 ring-[#f4c25b]/35 text-[#f8d98a] hover:bg-black/40'}`}>
                            {n === all && options.length > 1 ? 'Tout · ' : ''}<Nugget className="w-3.5 h-3.5" />{n.toLocaleString('fr-FR')}<ArrowRight className="w-3 h-3 opacity-60" /><Seed className="w-3.5 h-3.5" />{gives(n).toLocaleString('fr-FR')}
                        </button>
                    ))}
                </div>
            ) : <p className="mt-2 text-sm text-ink-soft">{user.nuggets ? `Il faut au moins ${rate} pépites pour une graine.` : "Plus de pépites pour l'instant."}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold">
                <Link to="/collection" className="inline-flex items-center gap-1 text-[#a8f0c6] hover:underline"><Recycle className="w-3.5 h-3.5" />Gratuit : recycle tes doublons</Link>
                <Link to="/boutique" className="inline-flex items-center gap-1 text-[#f4c25b] hover:underline"><Plus className="w-3.5 h-3.5" />Plus de pépites</Link>
            </div>
        </div>
    );
}

// Small labels floating over the 3D island.
const Pill = ({ children, className = '' }) => <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-bold shadow-lg ${className}`}>{children}</span>;
function PlotLabel({ plot, now, next, price }) {
    if (next) return <Pill className="bg-[#0b2117]/85 text-[#f8d98a] ring-1 ring-[#e9c46a]/50"><Lock className="w-3 h-3" />{price}</Pill>;
    if (!plot) return <Pill className="bg-white/85 text-[#123] animate-pulse"><Plus className="w-3 h-3" />Planter</Pill>;
    const g = growth(plot, now);
    if (g.ready) return <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 1, repeat: Infinity }} className="block"><Pill className="bg-[#e9c46a] text-[#3b2a05] text-xs px-2.5 py-1">Prêt !</Pill></motion.span>;
    return (
        <span className="flex flex-col items-center gap-0.5">
            {g.pest && <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }}><Pill className="bg-[#ff7a6b] text-[#2a0805]"><Bug className="w-3 h-3" />Chasse-le !</Pill></motion.span>}
            <Pill className="bg-black/55 text-white backdrop-blur tabular-nums">
                {plot.watered && <Droplets className="w-3 h-3 text-[#9fd8ff]" />}{left(g.left)}
            </Pill>
        </span>
    );
}

const DOCK = [
    { key: 'orders', label: 'Commandes', Icon: ScrollText, color: '#e9c46a' },
    { key: 'barn', label: 'Grange', Icon: Warehouse, color: '#e07a5f' },
    { key: 'workshop', label: 'Atelier', Icon: FlaskConical, color: '#7dff9a' },
    { key: 'hive', label: 'Ruche', Icon: Honey, color: '#ffb627' },
    { key: 'shop', label: 'Boutique', Icon: ShoppingBag, color: '#ff9ec2' },
    { key: 'arcade', label: 'Jeux', Icon: Gamepad2, color: '#ff7a6b' },
    { key: 'quests', label: 'Quêtes', Icon: Sparkles, color: '#c69bff' },
];
const PROP_LABELS = { orders: 'Commandes', barn: 'Grange', hive: 'Ruche', workshop: 'Atelier', arcade: 'Jeux', quests: 'Quêtes' };

export default function Garden() {
    const { user, setUser, addCards, refreshBadges } = useGame();
    const [garden, setGarden] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [toasts, setToasts] = useState([]);
    const [panel, setPanel] = useState(null);
    const [plotSheet, setPlotSheet] = useState(null);
    const [picker, setPicker] = useState(null); // slot being planted ('all' = every empty plot)
    const [opening, setOpening] = useState(null);
    const [game, setGame] = useState(null);
    const [levelUps, setLevelUps] = useState(null);
    const [bursts, setBursts] = useState([]);
    const [view, setView] = useState(() => (localStorage.getItem(VIEW) === 'classic' || !hasWebGL() ? 'classic' : '3d'));
    const now = useServerNow(garden?.now);
    const hour = parisHour(now);

    function toast(text, kind = 'plant', ms = 2600) {
        const id = Math.random();
        setToasts((t) => [...t.slice(-2), { id, text, kind }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
    }

    useEffect(() => {
        api('garden').then((res) => {
            setGarden(res.garden);
            setUser(res.user);
            if (res.rained) toast(`La pluie a arrosé ${res.rained} plante${res.rained > 1 ? 's' : ''} !`, 'rain');
            if (res.levelUps) setLevelUps(res.levelUps);
        }).catch((err) => setError(err.message));
    }, [setUser]); // eslint-disable-line react-hooks/exhaustive-deps

    async function run(action, params, sound) {
        setBusy(true);
        setError('');
        try {
            const res = await api(action, params);
            sound?.();
            if (res.garden) setGarden(res.garden);
            if (res.user) setUser(res.user);
            if (res.levelUps?.length) setTimeout(() => { sfx.record(); setLevelUps(res.levelUps); }, 700);
            refreshBadges();
            return res;
        } catch (err) {
            setError(err.message);
            toast(err.message, 'error', 3200);
            sfx.wrong();
            return null;
        } finally {
            setBusy(false);
        }
    }

    const counts = useMemo(() => {
        if (!garden) return {};
        const deliverable = garden.orders.filter((o) => o.items && Object.entries(o.items).every(([k, q]) => (garden.barn[k] || 0) >= q)).length;
        const quests = garden.quests.filter((q) => !q.claimed && q.progress >= q.goal).length + (garden.chest.ready && !garden.chest.claimed ? 1 : 0);
        const craft = garden.unlocks.includes('atelier') ? Math.floor(garden.compost / garden.rules.compostPerFertilizer) : 0;
        return { orders: deliverable, quests, workshop: craft };
    }, [garden]);

    if (!garden) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Le jardin se réveille…'}</div>;

    const plots = garden.plots;
    const states = plots.map((p) => growth(p, now));
    const readyCount = states.filter((g) => g?.ready).length;
    const emptyCount = plots.filter((p) => !p).length;
    const thirsty = plots.filter((p, i) => p && !p.watered && !states[i].ready).length;
    const lastSeed = garden.seeds[localStorage.getItem(LAST_SEED)] && garden.level >= garden.seeds[localStorage.getItem(LAST_SEED)].level ? localStorage.getItem(LAST_SEED) : 'tournesol';
    const canOpen = user.plants >= user.boosterPlants;
    const light = daylight(hour);
    const rain = garden.weather.rain;

    async function plant(kind, everywhere, slot = picker) {
        localStorage.setItem(LAST_SEED, kind);
        const res = await run('plant', everywhere || slot === 'all' ? { kind, convert: true } : { kind, slot, convert: true }, sfx.plant);
        if (!res) return;
        setPicker(null);
        if (res.converted) toast(`${res.converted} pépites → ${res.converted / per(user)} graines`, 'seed', 2400);
    }
    async function harvest(slot, replant) {
        const res = await run('harvest', slot == null ? {} : { slot }, sfx.coin);
        if (!res) return;
        setPlotSheet(null);
        setBursts(res.harvest.map((h) => ({ slot: h.slot, golden: h.golden, id: Math.random() })));
        const plantsN = res.harvest.reduce((n, h) => n + h.plants, 0);
        const honey = res.harvest.reduce((n, h) => n + h.honey, 0);
        const treasure = res.harvest.filter((h) => h.treasure).length;
        const golden = res.harvest.filter((h) => h.golden).length;
        if (treasure) toast(`Trésor ! ${treasure > 1 ? `${treasure} boosters bonus` : 'Un booster bonus'} enfoui sous la terre`, 'gold', 3500);
        if (golden) toast(`Récolte dorée ×2${golden > 1 ? ` sur ${golden} parcelles` : ''} !`, 'gold');
        toast(`+${plantsN} plantes${honey ? ` · +${honey} miel` : ''} · grange remplie`, 'plant');
        if (replant && slot != null) {
            const kind = res.harvest[0]?.kind;
            if (kind) await plant(kind, false, slot);
        }
    }
    async function onTap(tap) {
        if (busy) return;
        sfx.tap();
        if (tap.type === 'prop') return setPanel(tap.key);
        if (tap.type === 'decor') return setPanel('hive');
        const slot = tap.slot;
        if (slot >= plots.length) {
            if (slot === plots.length && garden.nextPlotPrice != null) {
                if (user.coins < garden.nextPlotPrice) return toast(`Il faut ${garden.nextPlotPrice} graines pour cette parcelle`, 'error');
                if (window.confirm(`Débloquer une nouvelle parcelle pour ${garden.nextPlotPrice} graines ?`)) run('unlockPlot', {}, sfx.coin);
            }
            return;
        }
        const g = states[slot];
        if (tap.type === 'pest' || g?.pest) return shoo(slot);
        if (!plots[slot]) return setPicker(slot);
        if (g.ready) return harvest(slot);
        setPlotSheet(slot);
    }
    async function shoo(slot) {
        const res = await run('shoo', { slot }, sfx.correct);
        if (res) toast(`Nuisible chassé ! +${res.xp} XP${res.compost ? ' · +1 compost' : ''}`, 'bug');
    }
    async function openBooster() {
        const res = await run('openBooster', { pay: 'plants' });
        if (res) { addCards(res.cards); setOpening(res.cards); }
    }
    async function finishGame(score) {
        try {
            const res = await api('gameReward', { game, score });
            setGarden(res.garden);
            setUser(res.user);
            refreshBadges();
            if (res.levelUps?.length) setLevelUps(res.levelUps);
            return res;
        } catch (err) {
            return { error: err.message };
        }
    }

    const labels = {};
    if (view === '3d') {
        for (let slot = 0; slot < garden.maxPlots; slot++) {
            const next = slot === plots.length && garden.nextPlotPrice != null;
            if (slot < plots.length || next) labels[`plot:${slot}`] = <PlotLabel plot={plots[slot]} now={now} next={next} price={garden.nextPlotPrice} />;
        }
        for (const [key, text] of Object.entries(PROP_LABELS)) {
            const n = counts[key];
            labels[`prop:${key}`] = (
                <Pill className="bg-[#081a11]/75 text-white backdrop-blur ring-1 ring-white/15">
                    {text}{n ? <span className="grid place-items-center min-w-4 h-4 px-1 rounded-full bg-[#ff5a4b] text-[10px] text-white">{n}</span> : null}
                </Pill>
            );
        }
    }

    const xpPct = Math.min(100, (garden.xp / garden.xpNext) * 100);
    const weatherIcon = rain ? <CloudRain className="w-4 h-4 text-[#9fd8ff]" /> : light > 0.5 ? <Sun className="w-4 h-4 text-[#ffd166]" /> : <Moon className="w-4 h-4 text-[#c9d4ff]" />;

    return (
        <div className="pb-6">
            {/* ---------------- the island */}
            <section className="relative h-[calc(100dvh-4.5rem-5.75rem)] sm:h-[calc(100dvh-5rem-5.75rem)] min-h-[520px] max-h-[960px] overflow-hidden">
                {view === '3d' ? (
                    <SceneGuard onFail={() => setView('classic')}><Suspense fallback={<div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#7cc8f2] to-[#d9f1ff] font-display text-xl text-[#0b2117]/70">L'île sort de la brume…</div>}>
                        <Island3D plots={plots} maxPlots={garden.maxPlots} now={now} decor={garden.decor} rain={rain} hour={hour} labels={labels} bursts={bursts}
                            selected={plotSheet} onTap={onTap} onFail={() => setView('classic')} />
                    </Suspense></SceneGuard>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#0f2d1d] to-[#081a11] pt-36 pb-36 px-4">
                        <div className="max-w-md mx-auto grid grid-cols-3 gap-2.5">
                            {plots.map((plot, slot) => <ClassicPlot key={slot} plot={plot} garden={garden} now={now} onTap={() => onTap({ type: 'plot', slot })} />)}
                            {Array.from({ length: garden.maxPlots - plots.length }, (_, i) => (
                                <button key={`l${i}`} type="button" disabled={i > 0} onClick={() => onTap({ type: 'plot', slot: plots.length })}
                                    className={`aspect-square rounded-[1.4rem] grid place-items-center border-2 border-dashed ${i === 0 ? 'bg-white/[0.04] border-white/20' : 'bg-white/[0.02] border-white/10 opacity-50'}`}>
                                    <span className="flex flex-col items-center gap-1 text-white/70"><Lock className="w-6 h-6" />{i === 0 && garden.nextPlotPrice != null && <Amount seeds={garden.nextPlotPrice} className="text-sm" />}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* top HUD */}
                <div className="absolute top-3 inset-x-3 flex items-start gap-2 pointer-events-none">
                    <button type="button" onClick={() => setPanel('level')} className="pointer-events-auto flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full nd-glass shadow-xl min-w-0">
                        <span className="relative grid place-items-center w-11 h-11 shrink-0">
                            <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
                                <circle cx="22" cy="22" r="19" fill="#0b2117" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                                <motion.circle cx="22" cy="22" r="19" fill="none" stroke="url(#nd-xp)" strokeWidth="4" strokeLinecap="round" strokeDasharray={119.4}
                                    initial={false} animate={{ strokeDashoffset: 119.4 * (1 - xpPct / 100) }} transition={{ duration: 0.6 }} />
                                <defs><linearGradient id="nd-xp"><stop offset="0" stopColor="#8ee6a8" /><stop offset="1" stopColor="#e9c46a" /></linearGradient></defs>
                            </svg>
                            <span className="relative font-display text-lg font-black text-white">{garden.level}</span>
                        </span>
                        <span className="min-w-0 text-left">
                            <span className="block text-[13px] font-bold text-white truncate leading-tight">{garden.title}</span>
                            <span className="block text-[11px] text-white/60 tabular-nums">{garden.xp}/{garden.xpNext} XP</span>
                        </span>
                    </button>
                    <div className="ml-auto flex flex-col items-end gap-1.5">
                        <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-full nd-glass shadow-xl text-[13px] font-bold text-white tabular-nums">
                            <button type="button" onClick={() => setPanel('hive')} className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10"><Honey className="w-4 h-4" />{garden.honey}</button>
                            <button type="button" onClick={() => setPanel('workshop')} className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10"><Compost className="w-4 h-4" />{garden.compost}</button>
                            <button type="button" onClick={() => setPanel('workshop')} className="hidden min-[400px]:flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10"><Fertilizer className="w-4 h-4" />{garden.fertilizer}</button>
                        </div>
                        <div className="pointer-events-auto flex items-center gap-1.5">
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full nd-glass text-[11px] font-semibold text-white/85" title={rain ? 'La pluie arrose tes plantes' : ''}>
                                {weatherIcon}{rain ? 'Pluie' : `${String(Math.floor(hour)).padStart(2, '0')}h${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`}
                            </span>
                            <button type="button" onClick={() => { const v = view === '3d' ? 'classic' : '3d'; if (v === '3d' && !hasWebGL()) return; localStorage.setItem(VIEW, v); setView(v); }}
                                className="grid place-items-center w-7 h-7 rounded-full nd-glass text-white/80" title={view === '3d' ? 'Vue classique' : 'Vue 3D'} aria-label={view === '3d' ? 'Vue classique' : 'Vue 3D'}>
                                {view === '3d' ? <Grid3x3 className="w-3.5 h-3.5" /> : <Box className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* booster progress */}
                <div className="absolute top-[4.6rem] left-3 pointer-events-none">
                    <button type="button" disabled={busy || !canOpen} onClick={openBooster}
                        className={`pointer-events-auto flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full shadow-xl text-[13px] font-bold ${canOpen ? 'nd-btn' : 'nd-glass text-white'}`}>
                        <Plant className="w-4 h-4" />
                        <span className="tabular-nums">{user.plants}</span>
                        {canOpen ? <><Package className="w-4 h-4" />Ouvrir</> : (
                            <span className="w-14 h-1.5 rounded-full bg-white/15 overflow-hidden"><span className="block h-full bg-[#c7ef7a]" style={{ width: `${((user.plants % user.boosterPlants) / user.boosterPlants) * 100}%` }} /></span>
                        )}
                    </button>
                </div>

                {/* quick actions */}
                <div className="absolute bottom-[5.6rem] inset-x-3 flex justify-center gap-2 pointer-events-none flex-wrap">
                    <AnimatePresence>
                        {readyCount > 0 && (
                            <motion.button key="h" type="button" disabled={busy} onClick={() => harvest()} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 1.05, 1], opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                                transition={{ scale: { duration: 1.4, repeat: Infinity } }}
                                className="pointer-events-auto flex items-center gap-2 px-5 py-3 rounded-full nd-btn font-bold shadow-2xl">
                                <Sparkles className="w-5 h-5" />Tout récolter ({readyCount})
                            </motion.button>
                        )}
                        {emptyCount > 0 && (
                            <motion.button key="p" type="button" disabled={busy} onClick={() => setPicker('all')} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-full nd-glass text-white font-semibold shadow-xl">
                                <Seed className="w-5 h-5" />Planter ({emptyCount})
                            </motion.button>
                        )}
                        {emptyCount > 0 && budgetOf(user) >= garden.seeds[lastSeed].cost && (
                            <motion.button key="r" type="button" disabled={busy} onClick={() => plant(lastSeed, true)} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                className="pointer-events-auto flex items-center gap-1.5 pl-1.5 pr-3.5 py-1.5 rounded-full nd-glass text-white text-sm font-semibold shadow-xl" title="Replanter la dernière graine partout">
                                <PlantArt kind={lastSeed} stage={3} className="w-8 h-8" />Replanter
                            </motion.button>
                        )}
                        {thirsty > 0 && garden.unlocks.includes('arrosoir') && !rain && (
                            <motion.button key="w" type="button" disabled={busy} onClick={async () => { const r = await run('water', { all: true }, sfx.water); if (r) toast(`${r.watered} plante${r.watered > 1 ? 's' : ''} arrosée${r.watered > 1 ? 's' : ''}`, 'rain'); }}
                                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-full bg-[#2b8fd6] text-white font-semibold shadow-xl ring-2 ring-[#9fd8ff]/50">
                                <Droplets className="w-5 h-5" />Tout arroser ({thirsty})
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* dock */}
                <nav className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none" aria-label="Lieux du jardin">
                    <div className="pointer-events-auto flex gap-0.5 sm:gap-1 p-1.5 rounded-[1.4rem] nd-glass shadow-2xl max-w-full overflow-x-auto">
                        {DOCK.map(({ key, label, Icon, color }) => (
                            <button key={key} type="button" onClick={() => { sfx.tap(); setPanel(key); }} className="relative flex flex-col items-center gap-0.5 w-[3.3rem] min-[440px]:w-[3.6rem] sm:w-16 py-1.5 rounded-2xl hover:bg-white/10 transition-colors">
                                <span className="grid place-items-center w-8 h-8 rounded-xl" style={{ background: `${color}22`, color }}><Icon className="w-[18px] h-[18px]" /></span>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-white/85">{label}</span>
                                {counts[key] > 0 && <span className="absolute top-0.5 right-1.5 grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff5a4b] text-[10px] font-black text-white ring-2 ring-[#0b2117]">{counts[key]}</span>}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* toasts */}
                <div className="absolute top-32 inset-x-0 flex flex-col items-center gap-2 pointer-events-none z-10">
                    <AnimatePresence>
                        {toasts.map((t) => (
                            <motion.div key={t.id} layout initial={{ opacity: 0, y: -14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                className={`flex items-center gap-2 max-w-[92vw] px-4 py-2.5 rounded-full font-bold shadow-2xl text-sm ${t.kind === 'gold' ? 'bg-[#e9c46a] text-[#3b2a05]' : t.kind === 'error' ? 'bg-[#3a0f0b] text-[#ffb4a2] ring-1 ring-[#ffb4a2]/40' : t.kind === 'rain' ? 'bg-[#0b2a3d] text-[#bfe6ff] ring-1 ring-[#9fd8ff]/40' : 'bg-[#0b2117] text-[#c7ef7a] ring-1 ring-[#c7ef7a]/40'}`}>
                                {t.kind === 'gold' ? <Sparkles className="w-4 h-4 shrink-0" /> : t.kind === 'rain' ? <Droplets className="w-4 h-4 shrink-0" /> : t.kind === 'bug' ? <Bug className="w-4 h-4 shrink-0" /> : t.kind === 'seed' ? <Seed className="w-4 h-4 shrink-0" /> : t.kind === 'error' ? null : <Plant className="w-4 h-4 shrink-0" />}
                                <span className="truncate">{t.text}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </section>

            {/* ---------------- below the island */}
            <div className="max-w-3xl mx-auto px-4 mt-6 space-y-6">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Île de {user.username}</p>
                    <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-1">Cultive, livre, joue, ouvre.</h1>
                    <p className="mt-2 text-ink-soft">Fais tourner l'île du doigt, pince pour zoomer, touche une parcelle ou un bâtiment. <b className="text-white">{user.boosterPlants} plantes = 1 booster.</b></p>
                </div>
                <Converter user={user} busy={busy} onConvert={async (nuggets) => {
                    const res = await run('convert', { nuggets }, sfx.coin);
                    if (res) toast(res.bonus ? `+${res.seeds} graines, dont +${res.bonus} de bonus du jour !` : `+${res.seeds} graines`, res.bonus ? 'gold' : 'seed');
                }} />
                <ol className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    {[
                        [Seed, 'Plante', '9 graines, débloquées avec les niveaux. Plus elle pousse longtemps, plus elle rapporte.'],
                        [Droplets, 'Arrose', `${Math.round(garden.waterCut * 100)} % de temps en moins. Quand il pleut sur l'île, tout s'arrose tout seul.`],
                        [Bug, 'Protège', `Les nuisibles mangent ${Math.round(garden.rules.pestCut * 100)} % de la récolte : touche-les pour les chasser (+compost).`],
                        [ScrollText, 'Livre', 'Ta récolte remplit la grange. Les habitants l\'échangent contre graines, miel et XP.'],
                        [Honey, 'Embellis', "Le miel achète potions et décorations, qui augmentent les chances de récolte dorée."],
                        [Gamepad2, 'Joue', 'Quatre mini-jeux, des records, des quêtes du jour et un coffre à ouvrir.'],
                    ].map(([Icon, title, text]) => (
                        <li key={title} className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                            <p className="flex items-center gap-2 font-display text-lg font-bold text-white"><Icon className="w-5 h-5 text-[#8ee6a8] shrink-0" />{title}</p>
                            <p className="mt-1 text-ink-soft">{text}</p>
                        </li>
                    ))}
                </ol>
            </div>

            {/* ---------------- sheets and overlays */}
            <AnimatePresence>
                {picker != null && <SeedPicker key="picker" user={user} garden={garden} emptyCount={emptyCount} busy={busy} onPlant={plant} onClose={() => setPicker(null)} />}
                {plotSheet != null && plots[plotSheet] && (
                    <PlotPanel key="plot" garden={garden} slot={plotSheet} now={now} busy={busy} onClose={() => setPlotSheet(null)}
                        onWater={() => run('water', { slot: plotSheet }, sfx.water)}
                        onFertilize={async () => { if (await run('fertilize', { slot: plotSheet }, sfx.plant)) toast('Engrais versé : +25 % à la récolte', 'plant'); }}
                        onPotion={async () => { if (await run('potion', { slot: plotSheet }, sfx.correct)) toast('Potion bue : temps restant divisé par deux !', 'gold'); }}
                        onShoo={() => shoo(plotSheet)} onHarvest={() => harvest(plotSheet)} onPlant={() => harvest(plotSheet, true)} />
                )}
                {panel === 'orders' && (
                    <OrdersPanel key="orders" garden={garden} now={now} busy={busy} onClose={() => setPanel(null)}
                        onDeliver={async (index, id) => {
                            const res = await run('deliver', { index, id }, sfx.win);
                            if (res) toast(`Livré ! +${res.delivered.coins} graines · +${res.delivered.honey} miel · +${res.delivered.xp} XP${res.delivered.capped ? ' (limite de graines du jour)' : ''}`, 'gold', 3200);
                        }}
                        onSkip={(index) => run('skipOrder', { index }, sfx.swish)} />
                )}
                {panel === 'barn' && <BarnPanel key="barn" garden={garden} onClose={() => setPanel(null)} onOrders={() => setPanel('orders')} />}
                {panel === 'workshop' && (
                    <WorkshopPanel key="workshop" garden={garden} busy={busy} onClose={() => setPanel(null)}
                        onCraft={async (all) => { const r = await run('craft', all ? { all: true } : {}, sfx.plant); if (r) toast(`+${r.crafted} engrais`, 'plant'); }} />
                )}
                {panel === 'hive' && (
                    <HivePanel key="hive" garden={garden} busy={busy} onClose={() => setPanel(null)} onShop={() => setPanel('shop')}
                        onBuy={async (key) => { if (await run('buyDecor', { key }, sfx.win)) toast(`${garden.decorShop[key].name} installé sur l'île !`, 'gold'); }} />
                )}
                {panel === 'shop' && (
                    <HoneyShopPanel key="shop" garden={garden} busy={busy} onClose={() => setPanel(null)}
                        onBuy={async (slot, it) => { if (await run('honeyBuy', { slot, id: it.id }, sfx.win)) toast(`${it.name} : acheté et équipé !`, 'gold'); }}
                        onEquip={async (slot, id) => { if (await run('avatarEquip', { slot, id }, sfx.tap)) toast(id === 'aucun' ? 'Retiré' : 'Équipé !'); }} />
                )}
                {panel === 'arcade' && <ArcadePanel key="arcade" garden={garden} onClose={() => setPanel(null)} onPlay={(g) => { setPanel(null); setGame(g); }} />}
                {panel === 'quests' && (
                    <QuestsPanel key="quests" garden={garden} busy={busy} onClose={() => setPanel(null)}
                        onClaim={async (key) => { if (await run('claimQuest', { key }, sfx.correct)) toast(`Quête réussie ! +${garden.rules.questReward.honey} miel · +${garden.rules.questReward.xp} XP`, 'gold'); }}
                        onChest={async () => { if (await run('claimChest', {}, sfx.record)) toast('Coffre ouvert : graines, miel et engrais !', 'gold', 3200); }} />
                )}
                {panel === 'level' && <LevelPanel key="level" garden={garden} onClose={() => setPanel(null)} />}
                {levelUps && <LevelUp key="lvl" ups={levelUps} onClose={() => setLevelUps(null)} />}
                {opening && (
                    <BoosterOpening key={opening.map((c) => c.id).join('-')} cards={opening} onClose={() => setOpening(null)}
                        canOpenAgain={user.plants >= user.boosterPlants} onAgain={openBooster} />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {game && (
                    <Suspense key="game" fallback={null}>
                        <GameOverlay game={game} best={garden.best[game]} max={garden.games[game].max} onFinish={finishGame} onClose={() => setGame(null)} />
                    </Suspense>
                )}
            </AnimatePresence>
        </div>
    );
}
