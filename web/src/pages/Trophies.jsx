import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
    Award, BookOpen, Check, Copy, Crown, Gavel, Gem, Globe2, Layers, Lock, Package, Recycle, ShoppingCart, Sparkles, Star, Trophy, Users, ArrowLeftRight,
} from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Amount } from '../components/Currency.jsx';
import { TYPES } from '../game.jsx';

const ICONS = {
    book: BookOpen, layers: Layers, globe: Globe2, copy: Copy, package: Package, star: Star, gem: Gem, crown: Crown,
    sparkles: Sparkles, trophy: Trophy, gavel: Gavel, cart: ShoppingCart, recycle: Recycle, users: Users, swap: ArrowLeftRight,
};
// Medal colour by tier: bronze, argent, or, platine… up to the rainbow of the last tier.
const TIERS = ['#cd8a4a', '#c3ccd8', '#e9c46a', '#8fe3dc', '#4fd18b', '#4ea8ff', '#b28bff', '#ff6b8b', '#ff5fd2'];

function iconOf(t) {
    if (t.icon.startsWith('type:')) return TYPES[t.icon.slice(5)]?.Icon || Award;
    return ICONS[t.icon] || Award;
}

function TrophyCard({ t, onClaim, busy }) {
    const Icon = iconOf(t);
    const color = TIERS[t.tier] || TIERS.at(-1);
    const done = t.progress >= t.goal;
    const locked = !done && t.progress === 0;
    return (
        <motion.div layout className={`relative rounded-3xl nd-glass p-4 flex flex-col overflow-hidden ${t.claimed ? 'ring-1 ring-[#e9c46a]/40' : ''}`}>
            <div className="absolute -top-12 -right-10 w-36 h-36 rounded-full blur-3xl" style={{ background: color, opacity: t.claimed ? 0.3 : done ? 0.35 : 0.1 }} />
            <div className="relative flex items-start gap-3">
                <span className={`relative grid place-items-center w-14 h-14 shrink-0 rounded-full ${locked ? 'opacity-45 grayscale' : ''}`}
                    style={{ background: `radial-gradient(circle at 35% 30%, ${color}, color-mix(in oklab, ${color} 45%, black))`, boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 35%, transparent), 0 6px 22px -6px ${color}` }}>
                    <Icon className="w-6 h-6 text-[#10261a]" strokeWidth={2.2} />
                    {t.claimed && <span className="absolute -bottom-1 -right-1 grid place-items-center w-5 h-5 rounded-full bg-[#4fd18b] ring-2 ring-[#0b2116]"><Check className="w-3 h-3 text-[#05130d]" strokeWidth={3} /></span>}
                    {locked && <span className="absolute -bottom-1 -right-1 grid place-items-center w-5 h-5 rounded-full bg-[#0b2116] ring-1 ring-white/20"><Lock className="w-3 h-3 text-white/60" /></span>}
                </span>
                <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold text-white leading-tight">{t.title}</h3>
                    <p className="mt-1 text-[13px] text-ink-soft leading-snug">{t.text}</p>
                </div>
            </div>
            <div className="relative mt-auto pt-4">
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(t.progress / t.goal) * 100}%`, background: color }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-white/70">{t.progress.toLocaleString('fr-FR')}/{t.goal.toLocaleString('fr-FR')}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-3 text-sm"><Amount seeds={t.coins} sign /><Amount nuggets={t.nuggets} sign /></span>
                    {t.claimed ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-[#a8f0c6]"><Check className="w-4 h-4" />Obtenu</span>
                    ) : done ? (
                        <button onClick={() => onClaim(t.key)} disabled={busy} className="nd-cta-gold px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">Récupérer</button>
                    ) : null}
                </div>
            </div>
        </motion.div>
    );
}

const FILTERS = [
    ['all', 'Tous'],
    ['ready', 'À récupérer'],
    ['progress', 'En cours'],
    ['done', 'Obtenus'],
];

export default function Trophies() {
    const { setUser } = useGame();
    const [trophies, setTrophies] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => { api('trophies').then((res) => setTrophies(res.trophies)).catch((e) => setMessage(e.message)); }, []);

    async function run(action, params, done) {
        setBusy(true);
        setMessage('');
        try {
            const res = await api(action, params);
            setUser(res.user);
            setTrophies(res.trophies);
            done?.(res);
        } catch (err) {
            setMessage(err.message);
        } finally {
            setBusy(false);
        }
    }
    const claim = (key) => run('claimTrophy', { key });
    const claimAll = () => run('claimAllTrophies', {}, (res) => setMessage(`${res.claimed} trophée${res.claimed > 1 ? 's' : ''} récupéré${res.claimed > 1 ? 's' : ''} : +${res.coins} graines et +${res.nuggets} pépites`));

    const ready = trophies?.filter((t) => !t.claimed && t.progress >= t.goal) || [];
    const claimed = trophies?.filter((t) => t.claimed).length || 0;
    const groups = useMemo(() => {
        const keep = {
            all: () => true,
            ready: (t) => !t.claimed && t.progress >= t.goal,
            progress: (t) => t.progress < t.goal,
            done: (t) => t.claimed,
        }[filter];
        const out = new Map();
        for (const t of trophies || []) {
            if (!out.has(t.group)) out.set(t.group, { all: [], shown: [] });
            out.get(t.group).all.push(t);
            if (keep(t)) out.get(t.group).shown.push(t);
        }
        return [...out].filter(([, g]) => g.shown.length);
    }, [trophies, filter]);

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Salle des trophées</p>
                    <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">
                        {claimed} <span className="text-ink-soft text-2xl sm:text-3xl">/ {trophies?.length || '…'} trophées</span>
                    </h1>
                    <p className="mt-3 text-ink-soft max-w-xl">Des objectifs permanents, comme les défis du jour mais pour toujours. Chaque trophée rapporte des graines (boosters) et des pépites (enchères).</p>
                </div>
                {ready.length > 0 && (
                    <button onClick={claimAll} disabled={busy} className="nd-btn px-5 py-3 rounded-full font-bold disabled:opacity-60">
                        Tout récupérer ({ready.length})
                    </button>
                )}
            </div>
            {trophies && (
                <div className="mt-5 h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#cd8a4a] via-[#e9c46a] to-[#ff5fd2]" initial={{ width: 0 }} animate={{ width: `${(claimed / trophies.length) * 100}%` }} transition={{ duration: 1 }} />
                </div>
            )}
            {message && <p className="mt-4 text-sm font-semibold text-white">{message}</p>}

            <div className="mt-6 flex flex-wrap gap-2">
                {FILTERS.map(([key, label]) => (
                    <button key={key} onClick={() => setFilter(key)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${filter === key ? 'bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/30' : 'text-white/70 bg-white/5 hover:bg-white/10'}`}>
                        {label}{key === 'ready' && ready.length > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-[#e9c46a] text-[#05130d] text-xs">{ready.length}</span>}
                    </button>
                ))}
            </div>

            {!trophies ? (
                <div className="py-20 text-center font-display text-lg text-ink-soft">Chargement…</div>
            ) : groups.length === 0 ? (
                <p className="py-16 text-center text-ink-soft">Rien ici pour l'instant.</p>
            ) : groups.map(([name, g]) => (
                <section key={name} className="mt-10">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-display text-2xl text-white">{name}</h2>
                        <span className="text-sm text-white/50 tabular-nums">{g.all.filter((t) => t.claimed).length}/{g.all.length}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {g.shown.map((t) => <TrophyCard key={t.key} t={t} onClaim={claim} busy={busy} />)}
                    </div>
                </section>
            ))}
        </div>
    );
}
