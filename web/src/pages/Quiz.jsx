import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    ArrowRight, BookOpen, Bone, Brain, CalendarDays, Check, Crown, ExternalLink, FastForward, Flame, Flower2, Globe2, Heart, HeartCrack,
    Leaf, Lightbulb, Medal, PawPrint, Play, RotateCcw, Shell, Sparkles, Target, Timer, TimerReset, Trophy, X, Zap,
} from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { Amount, Nugget, NUGGET_COLOR } from '../components/Currency.jsx';
import PlayerAvatar from '../components/PlayerAvatar.jsx';
import { sfx } from '../sfx.js';
import { IUCN, RARITIES, TYPES } from '../game.jsx';

const THEME_STYLE = {
    all: { Icon: Globe2, color: '#4fd18b', hint: 'Toutes les familles mélangées' },
    faune: { Icon: PawPrint, color: '#e2683c', hint: 'Mammifères, oiseaux, reptiles, poissons' },
    flore: { Icon: Flower2, color: '#65a30d', hint: 'Plantes, arbres, algues, champignons' },
    petites: { Icon: Shell, color: '#4f46e5', hint: 'Insectes, araignées, vie marine' },
    origines: { Icon: Bone, color: '#a8763e', hint: 'Fossiles, minéraux, bactéries, virus' },
};
const MODE_STYLE = {
    classic: { Icon: Brain, color: '#4fd18b', deep: '#0f3d2a', tagline: '10 questions, de facile à expert. Le quiz de référence.' },
    daily: { Icon: CalendarDays, color: '#f2c14e', deep: '#4a3510', tagline: 'Les mêmes 10 questions pour tous les joueurs. Un seul essai, un classement du jour.' },
    survival: { Icon: Heart, color: '#ff6b6b', deep: '#4a1518', tagline: '3 vies, des questions de plus en plus dures. Jusqu\'où iras-tu ?' },
    blitz: { Icon: Zap, color: '#38bdf8', deep: '#0c3550', tagline: '60 secondes. Bonne réponse : +2 s. Erreur : −5 s. Va vite !' },
};
const LEVELS = [
    { label: 'Facile', color: '#4fd18b' },
    { label: 'Moyen', color: '#e9c46a' },
    { label: 'Expert', color: '#ff7a59' },
];
const JOKERS = [
    { key: 'fifty', label: '50/50', Icon: Sparkles, hint: 'Retire 2 mauvaises réponses (points ÷ 2)' },
    { key: 'time', label: '+10 s', Icon: TimerReset, hint: '10 secondes de plus' },
    { key: 'skip', label: 'Passer', Icon: FastForward, hint: 'Change de question sans perdre de vie ni ton combo' },
];
const BOARDS = [
    { key: 'week', label: 'Concours', unit: 'pts', extra: (v) => `${v} bonnes`, note: 'Points gagnés depuis lundi dans tous les modes. Le podium gagne des pépites.' },
    { key: 'daily', label: 'Défi du jour', unit: 'pts', extra: (v) => `${v}/10` },
    { key: 'survival', label: 'Survie', unit: 'pts', extra: (v) => `${v} bonnes`, note: 'Meilleure partie des 7 derniers jours' },
    { key: 'blitz', label: 'Blitz', unit: 'pts', extra: (v) => `${v} bonnes`, note: 'Meilleure partie des 7 derniers jours' },
    { key: 'level', label: 'Naturalistes', unit: 'pts', extra: (v) => `${v} parties`, note: 'Tous les points de quiz gagnés' },
];

const img = (url) => url || undefined;
const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');
const plural = (n, w) => `${fmt(n)} ${w}${n > 1 ? 's' : ''}`;

// Number that rolls up to its new value.
function Rolling({ value, duration = 600, className = '' }) {
    const [shown, setShown] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = performance.now(), a = from.current;
        let raf;
        const step = (t) => {
            const k = Math.min(1, (t - start) / duration);
            const v = Math.round(a + (value - a) * (1 - (1 - k) ** 3));
            setShown(v);
            if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
        };
        raf = requestAnimationFrame(step);
        return () => { cancelAnimationFrame(raf); from.current = value; };
    }, [value, duration]);
    return <span className={`tabular-nums ${className}`}>{fmt(shown)}</span>;
}

function Pips({ total, used, color = '#4fd18b' }) {
    return (
        <span className="inline-flex gap-1">
            {Array.from({ length: total }, (_, i) => (
                <span key={i} className="w-2.5 h-2.5 rounded-full" style={i < used ? { background: 'rgb(255 255 255 / .15)' } : { background: color, boxShadow: `0 0 8px ${color}` }} />
            ))}
        </span>
    );
}

function LevelBadge({ level, size = 64 }) {
    return (
        <div className="relative grid place-items-center shrink-0 rounded-2xl font-display text-white"
            style={{ width: size, height: size, fontSize: size * 0.42, background: 'conic-gradient(from 200deg,#f2c14e,#4fd18b,#38bdf8,#a78bfa,#f2c14e)', padding: 3 }}>
            <div className="w-full h-full rounded-[13px] grid place-items-center bg-[#0b1d15]">{level}</div>
        </div>
    );
}

function XpBar({ level, from, to, animateFrom }) {
    const pct = (p) => Math.max(0, Math.min(100, ((p - level.from) / (level.to - level.from)) * 100));
    const [w, setW] = useState(animateFrom != null ? pct(animateFrom) : pct(level.points));
    useEffect(() => { const t = setTimeout(() => setW(pct(level.points)), 300); return () => clearTimeout(t); }, [level.points]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#4fd18b] via-[#f2c14e] to-[#ff9f43] transition-[width] duration-[1400ms] ease-out" style={{ width: `${w}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-white/50 tabular-nums">
                <span>{from ?? `${fmt(level.points - level.from)} / ${fmt(level.to - level.from)} pts`}</span>
                <span>{to ?? `niveau ${level.level + 1}`}</span>
            </div>
        </div>
    );
}

// ---------- menu ----------

function PassHint({ mode }) {
    const { user } = useGame();
    if (user?.pass || !mode.passBonus) return null;
    return (
        <Link to="/boutique" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#f4d88f] hover:underline">
            <Leaf className="w-4 h-4" />Encore envie ? Le Pass Naturaliste donne {plural(mode.passBonus, 'partie')} de {mode.label} en plus chaque jour.
        </Link>
    );
}

const MEDALS = ['#f2c14e', '#cfd8dc', '#d08b5b'];

function timeLeft(endsAt) {
    const ms = new Date(endsAt) - Date.now();
    if (ms <= 0) return 'résultats imminents';
    const h = Math.floor(ms / 3600_000);
    return h >= 24 ? `fin dans ${Math.floor(h / 24)} j ${h % 24} h` : `fin dans ${h} h ${Math.floor(ms / 60_000) % 60} min`;
}

// Weekly contest: the 3 players with the most quiz points between Monday and Sunday win pépites.
function Contest({ c }) {
    return (
        <section className="mt-6 rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-[#f2c14e]/15 to-transparent ring-1 ring-[#f2c14e]/30">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="flex items-center gap-2 font-display text-xl text-white"><Trophy className="w-5 h-5 text-[#f2c14e]" />Concours de la semaine</p>
                <span className="text-xs font-semibold text-[#f3dc9b] bg-black/25 rounded-full px-2.5 py-1">{timeLeft(c.endsAt)} · lundi 0 h</span>
                <span className="sm:ml-auto text-sm text-white/80">
                    {c.me ? <>Toi : <b className="text-white">{c.me.rank}<sup>{c.me.rank === 1 ? 're' : 'e'}</sup></b> avec <b className="text-white">{fmt(c.me.points)} pts</b></> : 'Joue une partie pour entrer dans le classement'}
                </span>
            </div>
            <p className="mt-2 text-sm text-white/75">Les 3 joueurs qui gagnent le plus de points de quiz entre lundi et dimanche, tous modes confondus, remportent :</p>
            <ul className="mt-2 flex flex-wrap gap-2">
                {c.prizes.map((n, i) => (
                    <li key={i} className="flex items-center gap-1.5 rounded-full bg-black/25 pl-1 pr-3 py-1 text-sm font-bold tabular-nums" style={{ color: NUGGET_COLOR }}>
                        <span className="grid place-items-center w-6 h-6 rounded-full text-xs text-[#2a1c00]" style={{ background: MEDALS[i] }}>{i + 1}</span>
                        {n}<Nugget className="w-4 h-4" />
                    </li>
                ))}
            </ul>
            {c.last.length > 0 && (
                <p className="mt-3 text-xs text-ink-soft">
                    Gagnants de la semaine dernière :{' '}
                    {c.last.map((w, i) => (
                        <span key={w.username}>{i > 0 && ', '}
                            <Link to={`/joueur/${encodeURIComponent(w.username)}`} className="font-semibold text-white hover:underline">{w.username}</Link> ({fmt(w.points)} pts)
                        </span>
                    ))}
                </p>
            )}
        </section>
    );
}

function ModeCard({ mode, on, onClick }) {
    const st = MODE_STYLE[mode.key];
    const rec = mode.record;
    return (
        <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={onClick}
            className={`relative text-left rounded-3xl p-5 overflow-hidden transition-shadow ${on ? 'ring-2' : 'ring-1 ring-white/10'}`}
            style={{ '--tw-ring-color': st.color, background: `linear-gradient(145deg, ${st.deep} 0%, #0b1712 75%)`, boxShadow: on ? `0 0 40px -10px ${st.color}` : undefined }}>
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl" style={{ background: st.color, opacity: on ? 0.35 : 0.15 }} />
            <st.Icon className="absolute -bottom-4 -right-3 w-28 h-28 opacity-[0.07] text-white" />
            <div className="relative flex items-center justify-between gap-2">
                <span className="grid place-items-center w-11 h-11 rounded-2xl" style={{ background: `${st.color}22`, color: st.color }}><st.Icon className="w-6 h-6" /></span>
                {mode.left > 0
                    ? <Pips total={mode.perDay} used={mode.perDay - mode.left} color={st.color} />
                    : <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">{mode.key === 'daily' ? 'Relevé' : 'Demain'}</span>}
            </div>
            <div className="relative mt-3 font-display text-2xl text-white">{mode.label}</div>
            <p className="relative mt-1 text-[13px] leading-snug text-white/65 min-h-[2.5em]">{st.tagline}</p>
            <div className="relative mt-3 flex items-center gap-1.5 text-xs font-bold" style={{ color: st.color }}>
                <Trophy className="w-3.5 h-3.5" />{rec ? <>Record : {fmt(rec.points)} pts{mode.key !== 'classic' && mode.key !== 'daily' ? ` · ${rec.score} bonnes` : ''}</> : 'Pas encore de record'}
            </div>
        </motion.button>
    );
}

function Board() {
    const [key, setKey] = useState('week');
    const [data, setData] = useState(null);
    useEffect(() => {
        let live = true;
        setData(null);
        api('quizBoard', { board: key }).then((d) => live && setData(d)).catch(() => live && setData({ top: [], me: null }));
        return () => { live = false; };
    }, [key]);
    const b = BOARDS.find((x) => x.key === key);
    const rows = data ? [...data.top, ...(data.me && !data.top.some((r) => r.me) ? [data.me] : [])] : [];
    return (
        <div className="rounded-3xl nd-glass p-5">
            <h3 className="font-display text-xl text-white flex items-center gap-2"><Crown className="w-5 h-5 text-[#f2c14e]" />Classements</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {BOARDS.map((x) => (
                    <button key={x.key} onClick={() => setKey(x.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${x.key === key ? 'bg-white text-[#0b1712]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'}`}>{x.label}</button>
                ))}
            </div>
            {b.note && <p className="mt-2 text-[11px] text-white/45">{b.note}</p>}
            <ol className="mt-3 space-y-1">
                {!data && <li className="text-sm text-white/50 py-4 text-center">Chargement…</li>}
                {data && !rows.length && <li className="text-sm text-white/50 py-4 text-center">Personne encore… sois le premier !</li>}
                {rows.map((r) => (
                    <li key={r.username} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${r.me ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/40' : ''}`}>
                        <span className={`w-6 text-center font-display text-sm ${r.rank === 1 ? 'text-[#f2c14e]' : r.rank === 2 ? 'text-[#cfd8dc]' : r.rank === 3 ? 'text-[#d08b5b]' : 'text-white/45'}`}>{r.rank}</span>
                        <PlayerAvatar name={r.username} avatar={r.avatar} size={28} />
                        <Link to={`/joueur/${encodeURIComponent(r.username)}`} className="flex-1 min-w-0 truncate text-sm font-semibold text-white hover:underline">{r.username}</Link>
                        {r.level && <span className="text-[11px] font-bold text-[#a8f0c6]">niv. {r.level.level}</span>}
                        <span className="text-[11px] text-white/45 hidden sm:inline">{b.extra(r.extra)}</span>
                        <span className="text-sm font-bold text-white tabular-nums">{fmt(r.score)}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Rewards({ mode, r }) {
    const st = MODE_STYLE[mode];
    const rows = mode === 'classic' || mode === 'daily' ? [
        ...LEVELS.map((l, i) => [<><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: l.color }} />Bonne réponse · {l.label.toLowerCase()}</>, <Amount seeds={r.levelCoins[i]} sign />]),
        [`Au moins ${r.cardScore}/10`, <span className="font-bold text-[#a8f0c6]">+1 carte</span>],
        ['Sans faute 10/10', <span className="flex gap-2"><Amount seeds={r.perfectCoins} sign /><Amount nuggets={r.perfectNuggets} sign /></span>],
    ] : (() => {
        const R = r.runs[mode];
        return [
            ['Chaque bonne réponse', <Amount seeds={R.perCorrect} sign />],
            [`Toutes les ${R.every} bonnes réponses`, <Amount seeds={R.everyCoins} sign />],
            ...R.nuggets.map(([n, v]) => [`${n} bonnes réponses`, <Amount nuggets={v} sign />]),
            [`${R.card} bonnes réponses`, <span className="font-bold text-[#a8f0c6]">+1 carte</span>],
        ];
    })();
    return (
        <div className="rounded-3xl nd-glass p-5">
            <h3 className="font-display text-xl text-white flex items-center gap-2"><Target className="w-5 h-5" style={{ color: st.color }} />Récompenses · {mode === 'classic' ? 'Classique' : mode === 'daily' ? 'Défi du jour' : mode === 'survival' ? 'Survie' : 'Blitz'}</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
                {rows.map(([a, b], i) => <li key={i} className="flex items-center justify-between gap-3"><span>{a}</span>{b}</li>)}
            </ul>
            <div className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-xs text-white/60 leading-relaxed">
                <b className="text-white/85">Points :</b> facile 100, moyen 150, expert 200, + jusqu'à 100 de bonus de vitesse.
                Combo : <b className="text-[#ff9f43]">×1,5</b> dès 3 bonnes réponses de suite, <b className="text-[#ff9f43]">×2</b> dès 5, <b className="text-[#ff9f43]">×3</b> dès 8.
                <div className="mt-1.5"><b className="text-white/85">Jokers</b> (1 de chaque par partie) : 50/50, +10 s, passer la question.</div>
            </div>
        </div>
    );
}

function Home({ state, onStart, busy, error }) {
    const { user } = useGame();
    const [modeKey, setModeKey] = useState('daily');
    const [theme, setTheme] = useState('all');
    const s = state.stats;
    const accuracy = s.questions ? Math.round((s.correct / s.questions) * 100) : null;
    const kinds = state.kinds.filter((k) => k.answered).sort((a, b) => b.correct / b.answered - a.correct / a.answered);
    const mode = state.modes.find((m) => m.key === modeKey) || state.modes[0];
    const st = MODE_STYLE[mode.key];
    const lvl = state.level;
    // Daily challenge first if still open, otherwise the first mode with games left.
    useEffect(() => {
        const daily = state.modes.find((m) => m.key === 'daily');
        if (!daily?.left) setModeKey((state.modes.find((m) => m.left > 0) || state.modes[0]).key);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="max-w-6xl mx-auto px-5 py-8 sm:py-10">
            <div className="relative overflow-hidden rounded-[2rem] p-6 sm:p-8 ring-1 ring-white/10"
                style={{ background: 'radial-gradient(120% 140% at 0% 0%, #1d4d36 0%, #0b1712 55%), #0b1712' }}>
                <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-[#f2c14e]/10 blur-3xl" />
                <Brain className="absolute right-6 bottom-0 w-48 h-48 text-white/[0.04]" />
                <div className="relative flex flex-col lg:flex-row lg:items-end gap-6">
                    <div className="flex-1">
                        <p className="uppercase tracking-[0.3em] text-xs font-bold text-[#f2c14e]">NatureDex</p>
                        <h1 className="mt-1 font-display text-5xl sm:text-6xl font-medium text-white leading-none">Quiz Arena</h1>
                        <p className="mt-3 text-white/70 max-w-xl">
                            Quatre modes de jeu, des milliers d'espèces, des combos, des jokers et des classements.
                            Chaque partie fait monter ton niveau de naturaliste.
                        </p>
                    </div>
                    <div className="lg:w-80 rounded-3xl bg-black/25 ring-1 ring-white/10 p-4">
                        <div className="flex items-center gap-3">
                            <LevelBadge level={lvl.level} />
                            <div className="min-w-0">
                                <div className="text-[11px] uppercase tracking-widest font-bold text-white/50">Niveau {lvl.level}</div>
                                <div className="font-display text-2xl text-white leading-tight">{lvl.title}</div>
                                {lvl.next && <div className="text-[11px] text-white/45">« {lvl.next[1]} » au niveau {lvl.next[0]}</div>}
                            </div>
                        </div>
                        <div className="mt-3"><XpBar level={lvl} /></div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            {[[<><Flame className={`inline w-4 h-4 -mt-0.5 ${state.streak ? 'text-[#ff9f43]' : 'text-white/30'}`} />{state.streak}</>, 'jours de suite'],
                                [s.bestCombo, 'meilleure série'], [accuracy != null ? `${accuracy}%` : '–', 'réussite']].map(([v, l], i) => (
                                <div key={i} className="rounded-xl bg-white/[0.05] py-1.5">
                                    <div className="font-display text-lg text-white">{v}</div>
                                    <div className="text-[10px] text-white/50 leading-tight">{l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {state.contest && <Contest c={state.contest} />}

            {error && <p className="mt-4 text-sm font-semibold text-[#ffb4a2]">{error}</p>}

            {state.active && (
                <div className="mt-6 rounded-3xl nd-glass p-5 flex flex-col sm:flex-row sm:items-center gap-4 ring-1 ring-[#f2c14e]/40">
                    <div className="flex-1">
                        <div className="font-display text-2xl text-white">Partie en cours · {state.modes.find((m) => m.key === state.active.mode)?.label}</div>
                        <p className="text-ink-soft text-sm mt-1">
                            Question {state.active.current + 1}{state.active.mode === 'classic' || state.active.mode === 'daily' ? ` / ${state.active.total}` : ''} · {plural(state.active.score, 'bonne réponse')} · {fmt(state.active.points)} pts
                        </p>
                    </div>
                    <button onClick={() => onStart(null, null, state.active.id)} className="nd-cta-gold inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-bold">
                        <Play className="w-5 h-5" />Reprendre
                    </button>
                </div>
            )}

            <h2 className="mt-8 font-display text-2xl text-white">Choisis ton mode de jeu</h2>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {state.modes.map((m) => <ModeCard key={m.key} mode={m} on={m.key === modeKey} onClick={() => setModeKey(m.key)} />)}
            </div>

            {!state.active && (
                <AnimatePresence mode="wait">
                    <motion.div key={mode.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 rounded-3xl p-5 ring-1" style={{ '--tw-ring-color': `${st.color}55`, background: `linear-gradient(120deg, ${st.deep}cc, #0b1712)` }}>
                        {mode.left > 0 ? (
                            <>
                                {mode.themes && (
                                    <>
                                        <div className="text-sm font-bold text-white/80">Thème</div>
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                                            {state.themes.map((t) => {
                                                const ts = THEME_STYLE[t.key] || THEME_STYLE.all;
                                                const on = theme === t.key;
                                                return (
                                                    <button key={t.key} onClick={() => setTheme(t.key)} title={ts.hint}
                                                        className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-all ${on ? 'bg-white/[0.12] ring-2 text-white' : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'} ${t.key === 'all' ? 'col-span-2 sm:col-span-1' : ''}`}
                                                        style={{ '--tw-ring-color': ts.color }}>
                                                        <ts.Icon className="w-5 h-5 shrink-0" style={{ color: ts.color }} />{t.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                                <div className={`${mode.themes ? 'mt-4' : ''} flex flex-col sm:flex-row sm:items-center gap-3`}>
                                    <button disabled={busy} onClick={() => onStart(mode.key, theme)}
                                        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black text-lg text-[#08130d] disabled:opacity-60 shadow-lg"
                                        style={{ background: `linear-gradient(135deg, #fff, ${st.color})`, boxShadow: `0 10px 40px -10px ${st.color}` }}>
                                        <st.Icon className="w-6 h-6" />{busy ? 'Préparation…' : mode.key === 'daily' ? 'Relever le défi' : 'Jouer'}
                                    </button>
                                    <span className="text-sm text-white/60">{plural(mode.left, 'partie')} restante{mode.left > 1 ? 's' : ''} aujourd'hui{user?.pass && mode.passBonus > 0 && <span className="text-[#f4d88f]"> · dont +{mode.passBonus} avec ton Pass</span>}</span>
                                </div>
                            </>
                        ) : (
                            <div>
                                <div className="font-display text-xl text-white">{mode.key === 'daily' ? 'Défi du jour relevé !' : `Plus de parties ${mode.label} aujourd'hui`}</div>
                                <p className="text-white/60 text-sm mt-1">{mode.key === 'daily' ? 'Regarde ton classement ci-dessous. Un nouveau défi arrive demain.' : 'Essaie un autre mode ou reviens demain.'}</p>
                                {mode.key !== 'daily' && <PassHint mode={mode} />}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}

            {state.today.some((q) => q.status === 'done') && (
                <div className="mt-5 flex flex-wrap gap-2">
                    {state.today.filter((q) => q.status === 'done').map((q) => {
                        const ms = MODE_STYLE[q.mode] || MODE_STYLE.classic;
                        return (
                            <span key={q.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 px-3 py-1.5 text-sm text-white/80">
                                <ms.Icon className="w-4 h-4" style={{ color: ms.color }} />
                                <b className="text-white">{q.mode === 'classic' || q.mode === 'daily' ? `${q.score}/${q.total}` : plural(q.score, 'bonne')}</b>
                                · {fmt(q.points)} pts · <Amount seeds={q.coins} sign />{q.nuggets > 0 && <Amount nuggets={q.nuggets} sign />}
                            </span>
                        );
                    })}
                </div>
            )}

            <div className="mt-8 grid lg:grid-cols-3 gap-4">
                <Board />
                <Rewards mode={mode.key} r={state.rewards} />
                <div className="rounded-3xl nd-glass p-5">
                    <h3 className="font-display text-xl text-white flex items-center gap-2"><Lightbulb className="w-5 h-5 text-[#e9c46a]" />Tes connaissances</h3>
                    {s.quizzes === 0 && !kinds.length ? (
                        <p className="mt-3 text-sm text-ink-soft">Joue ta première partie pour voir tes points forts.</p>
                    ) : (
                        <>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                                {[[s.quizzes, 'parties'], [s.perfect, 'sans faute'], [s.species, 'espèces'], [fmt(s.points), 'points']].map(([v, l]) => (
                                    <div key={l} className="rounded-xl bg-white/[0.04] py-2">
                                        <div className="font-display text-lg text-white">{v}</div>
                                        <div className="text-[10px] text-white/50">{l}</div>
                                    </div>
                                ))}
                            </div>
                            <ul className="mt-4 space-y-1.5">
                                {kinds.map((k) => {
                                    const pct = Math.round((k.correct / k.answered) * 100);
                                    return (
                                        <li key={k.kind} className="text-xs">
                                            <div className="flex justify-between text-white/75"><span>{k.label}</span><span className="tabular-nums">{k.correct}/{k.answered}</span></div>
                                            <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? '#4fd18b' : pct >= 40 ? '#e9c46a' : '#ff7a59' }} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------- game ----------

function useCountdown(deadline, offset, paused) {
    const [left, setLeft] = useState(1);
    useEffect(() => {
        if (!deadline) return;
        const end = new Date(deadline).getTime();
        const tick = () => setLeft(end - (Date.now() + offset));
        tick();
        if (paused) return;
        const t = setInterval(tick, 100);
        return () => clearInterval(t);
    }, [deadline, offset, paused]);
    return left;
}

function Option({ o, i, feedback, chosen, onPick, disabled, removed }) {
    const isAnswer = feedback && i === feedback.answer;
    const isWrong = feedback && i === chosen && !feedback.correct;
    const label = o.label ?? feedback?.reveal?.[i];
    const ring = isAnswer ? 'ring-2 ring-[#4fd18b] bg-[#4fd18b]/15 shadow-[0_0_30px_-6px_#4fd18b]' : isWrong ? 'ring-2 ring-[#ff6b6b] bg-[#ff6b6b]/12'
        : 'ring-1 ring-white/12 bg-white/[0.05] hover:bg-white/[0.1] hover:ring-white/30';
    const fade = removed ? 'opacity-20 grayscale pointer-events-none' : feedback && !isAnswer && !isWrong ? 'opacity-50' : '';
    const fact = feedback?.facts?.[i];
    const key = <span className="hidden sm:grid place-items-center w-6 h-6 rounded-md bg-black/40 text-[11px] font-bold text-white/70 shrink-0">{i + 1}</span>;
    const anim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, scale: isAnswer && feedback?.correct ? [1, 1.05, 1] : 1 }, transition: { delay: feedback ? 0 : 0.05 * i } };

    if (o.image !== undefined) {
        return (
            <motion.button {...anim} disabled={disabled || removed} onClick={() => onPick(i)} className={`group relative rounded-2xl overflow-hidden text-left transition-all ${ring} ${fade}`}>
                <div className="aspect-square bg-black/40">
                    {o.image && <img src={img(o.image)} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="eager" />}
                </div>
                <span className="absolute z-10 top-2 left-2">{key}</span>
                {(label || fact) && (
                    <div className="px-2.5 py-2 text-[13px] leading-tight text-white font-semibold">
                        {label}{fact && <div className="text-[11px] font-normal text-[#e9c46a] mt-0.5">{fact}</div>}
                    </div>
                )}
                {isAnswer && <Check className="absolute top-2 right-2 w-7 h-7 p-1 rounded-full bg-[#4fd18b] text-[#05130d]" />}
                {isWrong && <X className="absolute top-2 right-2 w-7 h-7 p-1 rounded-full bg-[#ff6b6b] text-white" />}
            </motion.button>
        );
    }
    if (o.tf !== undefined) {
        const c = o.tf ? '#4fd18b' : '#ff7a59';
        return (
            <motion.button {...anim} disabled={disabled} onClick={() => onPick(i)}
                className={`flex items-center justify-center gap-3 rounded-2xl px-4 py-6 font-display text-3xl text-white transition-all ${ring} ${fade}`}
                style={!feedback ? { background: `linear-gradient(135deg, ${c}33, ${c}0d)` } : undefined}>
                {key}{o.tf ? <Check className="w-8 h-8" style={{ color: c }} /> : <X className="w-8 h-8" style={{ color: c }} />}{o.label}
            </motion.button>
        );
    }
    const type = o.type && TYPES[o.type];
    const iucn = o.iucn && IUCN[o.iucn];
    return (
        <motion.button {...anim} disabled={disabled || removed} onClick={() => onPick(i)} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all ${ring} ${fade}`}>
            {key}
            {type && <span className="grid place-items-center w-8 h-8 rounded-full shrink-0 text-white" style={{ background: type.color }}><type.Icon className="w-4.5 h-4.5" /></span>}
            {iucn && <span className="px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0" style={{ background: iucn.color }}>{o.iucn}</span>}
            <span className={`flex-1 font-semibold text-white leading-snug ${o.italic ? 'italic font-display' : ''} ${removed ? 'line-through' : ''}`}>{type ? type.label : label}</span>
            {isAnswer && <Check className="w-5 h-5 text-[#4fd18b] shrink-0" />}
            {isWrong && <X className="w-5 h-5 text-[#ff6b6b] shrink-0" />}
        </motion.button>
    );
}

function Learn({ learn, correct }) {
    if (!learn) return null;
    const r = RARITIES[learn.rarity] || RARITIES.common;
    const iucn = learn.iucn && IUCN[learn.iucn];
    return (
        <div className="rounded-3xl bg-black/30 ring-1 ring-white/10 p-4 sm:p-5 flex gap-4">
            <Link to={`/carte/${learn.id}`} className="w-20 sm:w-28 shrink-0">
                <div className="aspect-[3/4] rounded-xl overflow-hidden ring-2 bg-black/30" style={{ '--tw-ring-color': r.color }}>
                    {learn.thumb_url && <img src={img(learn.thumb_url)} alt="" className="w-full h-full object-cover" />}
                </div>
            </Link>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: correct ? '#4fd18b' : '#e9c46a' }}>
                    <BookOpen className="w-4 h-4" />{correct ? 'Le savais-tu ?' : 'À retenir'}
                </div>
                <div className="mt-1 font-display text-xl text-white leading-tight">{learn.name}</div>
                {learn.sci_name && learn.sci_name !== learn.name && <div className="italic text-sm text-white/60">{learn.sci_name}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                    {TYPES[learn.type] && (() => { const T = TYPES[learn.type]; return (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-white/[0.07]" style={{ color: T.color }}><T.Icon className="w-3.5 h-3.5" />{T.label}</span>
                    ); })()}
                    <span className="rounded-full px-2 py-0.5 bg-white/[0.07]" style={{ color: r.color }}>{r.label}</span>
                    {iucn && <span className="rounded-full px-2 py-0.5 text-white" style={{ background: iucn.color }}>{iucn.label}</span>}
                    {learn.count > 0 && <span className="rounded-full px-2 py-0.5 bg-[#4fd18b]/15 text-[#a8f0c6]">Dans ta collection ×{learn.count}</span>}
                </div>
                {learn.fact && <p className="mt-2 text-sm text-white/80 leading-relaxed line-clamp-4 sm:line-clamp-none">{learn.fact}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                    <Link to={`/carte/${learn.id}`} className="text-[#a8f0c6] hover:underline">Voir la carte</Link>
                    {learn.wiki_url && <a href={learn.wiki_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/60 hover:text-white">Wikipédia<ExternalLink className="w-3.5 h-3.5" /></a>}
                </div>
            </div>
        </div>
    );
}

// Full-screen stage: the game hides the site around it.
function Stage({ mode, flash, children }) {
    const st = MODE_STYLE[mode] || MODE_STYLE.classic;
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);
    return (
        <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#06100b]">
            <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(90% 70% at 50% -10%, ${st.deep} 0%, transparent 70%), radial-gradient(60% 50% at 100% 100%, ${st.color}14 0%, transparent 70%)` }} />
            <motion.div className="pointer-events-none fixed -top-40 -left-40 w-[28rem] h-[28rem] rounded-full blur-3xl" style={{ background: st.color, opacity: 0.08 }}
                animate={{ x: [0, 80, 0], y: [0, 60, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
            <AnimatePresence>
                {flash && (
                    <motion.div key={flash.id} className="pointer-events-none fixed inset-0 z-10" initial={{ opacity: 0.45 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }}
                        style={{ background: `radial-gradient(circle at 50% 50%, transparent 30%, ${flash.color} 100%)` }} />
                )}
            </AnimatePresence>
            <div className="relative">{children}</div>
        </div>
    );
}

function Countdown({ mode, onDone }) {
    const st = MODE_STYLE[mode] || MODE_STYLE.classic;
    const [n, setN] = useState(3);
    useEffect(() => {
        if (n < 0) { onDone(); return; }
        sfx.count(n === 0);
        const t = setTimeout(() => setN(n - 1), n === 0 ? 550 : 750);
        return () => clearTimeout(t);
    }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
    const rules = { classic: '10 questions · de facile à expert', daily: 'Le même défi pour tous · un seul essai', survival: '3 vies · jusqu\'où iras-tu ?', blitz: '60 secondes · +2 s / −5 s' }[mode];
    return (
        <div className="min-h-[100dvh] grid place-items-center text-center px-6">
            <div>
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-grid place-items-center w-20 h-20 rounded-3xl" style={{ background: `${st.color}22`, color: st.color }}>
                    <st.Icon className="w-11 h-11" />
                </motion.div>
                <div className="mt-4 font-display text-4xl text-white">{{ classic: 'Classique', daily: 'Défi du jour', survival: 'Survie', blitz: 'Blitz' }[mode]}</div>
                <div className="mt-1 text-white/60">{rules}</div>
                <div className="mt-10 h-40 grid place-items-center">
                    <AnimatePresence mode="popLayout">
                        {n >= 0 && (
                            <motion.div key={n} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                                className="font-display text-[9rem] leading-none" style={{ color: n === 0 ? st.color : '#fff', textShadow: `0 0 50px ${st.color}` }}>
                                {n === 0 ? 'GO !' : n}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function Hud({ quiz, q, left, feedback, onQuit }) {
    const st = MODE_STYLE[quiz.mode] || MODE_STYLE.classic;
    const blitz = quiz.mode === 'blitz';
    const blitzLeft = blitz ? left : 0;
    return (
        <div className="sticky top-0 z-20 bg-[#06100b]/80 backdrop-blur-md border-b border-white/5">
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                <button onClick={onQuit} className="grid place-items-center w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/15 shrink-0" aria-label="Quitter"><X className="w-4 h-4 text-white" /></button>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: st.color }}><st.Icon className="w-4 h-4" />{quiz.modeLabel}</span>
                <div className="flex-1 flex justify-center">
                    {quiz.total ? (
                        <div className="w-full flex gap-1">
                            {Array.from({ length: quiz.total }, (_, i) => {
                                const r = quiz.results[i];
                                return <span key={i} className={`h-2 flex-1 rounded-full transition-colors ${r === true ? 'bg-[#4fd18b]' : r === false ? 'bg-[#ff6b6b]' : i === q?.index ? 'bg-white/70' : 'bg-white/12'}`} />;
                            })}
                        </div>
                    ) : quiz.mode === 'survival' ? (
                        <div className="flex items-center gap-1">
                            {Array.from({ length: quiz.maxLives }, (_, i) => (
                                <motion.span key={i} animate={i >= quiz.lives ? { scale: [1.4, 1], opacity: 0.25 } : { scale: 1, opacity: 1 }}>
                                    {i < quiz.lives ? <Heart className="w-6 h-6 fill-[#ff6b6b] text-[#ff6b6b] drop-shadow-[0_0_6px_#ff6b6b]" /> : <HeartCrack className="w-6 h-6 text-white/40" />}
                                </motion.span>
                            ))}
                            <span className="ml-2 text-sm font-bold text-white/70 tabular-nums">#{quiz.answered + (feedback ? 0 : 1)}</span>
                        </div>
                    ) : (
                        <div className={`font-display text-3xl tabular-nums ${blitzLeft < 10000 && !feedback ? 'text-[#ff7a59] animate-pulse' : 'text-white'}`}>
                            <Timer className="inline w-6 h-6 -mt-1 mr-1" />{Math.max(0, Math.ceil(blitzLeft / 1000))}
                        </div>
                    )}
                </div>
                <div className="text-right shrink-0">
                    <div className="font-display text-xl text-white leading-none"><Rolling value={quiz.points} /></div>
                    <div className="text-[10px] uppercase tracking-wider text-white/45">points</div>
                </div>
            </div>
            {blitz && (
                <div className="h-1.5 bg-white/5">
                    <div className="h-full transition-[width] duration-100 ease-linear" style={{ width: `${Math.max(0, Math.min(1, blitzLeft / 60000)) * 100}%`, background: blitzLeft < 10000 ? '#ff7a59' : st.color }} />
                </div>
            )}
        </div>
    );
}

function ComboBadge({ combo, multiplier }) {
    if (combo < 2) return null;
    return (
        <motion.span key={combo} initial={{ scale: 1.5 }} animate={{ scale: 1 }}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black text-[#1b0d02]"
            style={{ background: 'linear-gradient(90deg,#ffd166,#ff9f43,#ff6b6b)', boxShadow: '0 0 20px -2px #ff9f43' }}>
            <Flame className="w-4 h-4" />{combo} d'affilée{multiplier > 1 ? ` · ×${String(multiplier).replace('.', ',')}` : ''}
        </motion.span>
    );
}

function QuizRun({ id, fresh, mode: startMode, onExit, onReplay }) {
    const { setUser, addCards } = useGame();
    const [phase, setPhase] = useState(fresh ? 'countdown' : 'play');
    const [data, setData] = useState(null); // { quiz, question }
    const [offset, setOffset] = useState(0);
    const [chosen, setChosen] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [final, setFinal] = useState(null);
    const [error, setError] = useState('');
    const [flash, setFlash] = useState(null);
    const [pop, setPop] = useState(null);
    const [shake, setShake] = useState(0);
    const [busyJoker, setBusyJoker] = useState(false);
    const sending = useRef(false);
    const lastTick = useRef(null);

    const load = useCallback(async () => {
        setError('');
        try {
            const res = await api('quizNext', { id });
            if (res.done) { onExit(); return; }
            document.querySelector('[data-quiz-stage]')?.scrollTo?.({ top: 0, behavior: 'smooth' });
            setOffset(new Date(res.serverNow).getTime() - Date.now());
            setChosen(null);
            setFeedback(null);
            setPop(null);
            setData(res);
        } catch (e) { setError(e.message); }
    }, [id, onExit]);
    useEffect(() => { if (phase === 'play') load(); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const q = data?.question;
    const quiz = data?.quiz;
    const blitz = quiz?.mode === 'blitz';
    const deadline = blitz && feedback ? feedback.quiz.endsAt : q?.deadline;
    const left = useCountdown(deadline, offset, !!feedback && !blitz);

    // Ticking clock on the last seconds.
    useEffect(() => {
        if (!q || feedback) return;
        const s = Math.ceil(left / 1000);
        if (s <= 5 && s > 0 && lastTick.current !== s) { lastTick.current = s; sfx.tick(s <= 3); }
    }, [left, q, feedback]);

    const pick = useCallback(async (choice) => {
        if (!q || feedback || sending.current) return;
        sending.current = true;
        setChosen(choice);
        try {
            const res = await api('quizAnswer', { id, index: q.index, choice });
            setFeedback(res);
            setData((d) => ({ ...d, quiz: res.quiz }));
            if (res.correct) {
                sfx.correct();
                setFlash({ id: Date.now(), color: '#4fd18b' });
                setPop({ id: Date.now(), points: res.points, combo: res.combo, multiplier: res.multiplier });
                if ([3, 5, 8].includes(res.combo) || (res.combo > 8 && res.combo % 5 === 0)) setTimeout(() => sfx.combo(res.combo >= 8 ? 4 : res.combo >= 5 ? 2 : 1), 180);
            } else {
                if (res.lifeLost) sfx.lifeLost(); else sfx.wrong();
                setFlash({ id: Date.now(), color: '#ff4d4d' });
                setShake((n) => n + 1);
            }
            if (res.done) {
                setUser(res.user);
                if (res.rewardCard) addCards([res.rewardCard]);
                setFinal(res);
                if (ENDLESS_MODES.includes(res.quiz.mode)) setTimeout(() => sfx.gameOver(), 500);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            sending.current = false;
        }
    }, [q, feedback, id, setUser, addCards]);

    useEffect(() => {
        if (q && !feedback && left <= 0) pick(-1);
    }, [left, q, feedback, pick]);

    // Blitz keeps the pace: next question right after the answer is shown.
    useEffect(() => {
        if (!blitz || !feedback) return;
        const t = setTimeout(() => (feedback.done ? setFinal((f) => ({ ...f, showSummary: true })) : load()), feedback.done ? 1600 : feedback.correct ? 550 : 1100);
        return () => clearTimeout(t);
    }, [blitz, feedback, load]);

    async function joker(key) {
        if (!q || feedback || busyJoker || sending.current) return;
        setBusyJoker(true);
        try {
            const res = await api('quizJoker', { id, index: q.index, joker: key });
            sfx.joker(key);
            if (key === 'skip') { setData((d) => ({ ...d, quiz: res.quiz })); await load(); }
            else {
                setOffset(new Date(res.serverNow).getTime() - Date.now());
                setData((d) => ({ ...d, quiz: res.quiz, question: res.question || d.question }));
            }
        } catch (e) { setError(e.message); } finally { setBusyJoker(false); }
    }

    const next = useCallback(() => (feedback?.done ? setFinal((f) => ({ ...f, showSummary: true })) : load()), [feedback, load]);

    useEffect(() => {
        const onKey = (e) => {
            if (phase !== 'play' || final?.showSummary) return;
            if (feedback) { if (e.key === 'Enter' && !blitz) next(); return; }
            const n = Number(e.key);
            if (q && n >= 1 && n <= q.options.length && !q.removed.includes(n - 1)) pick(n - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [q, feedback, pick, next, phase, blitz, final]);

    const stageMode = quiz?.mode || startMode || 'classic';
    if (phase === 'countdown') return <Stage mode={stageMode}><Countdown mode={stageMode} onDone={() => setPhase('play')} /></Stage>;
    if (final?.showSummary) return <Stage mode={stageMode}><Summary res={final} onExit={onExit} onReplay={onReplay} /></Stage>;
    if (!data) return <Stage mode={stageMode}><div className="min-h-[100dvh] grid place-items-center font-display text-xl text-white/60">{error || 'Chargement…'}</div></Stage>;

    const level = LEVELS[q.level] || LEVELS[0];
    const pct = Math.max(0, Math.min(1, left / (q.seconds * 1000)));
    const imageOptions = q.options[0]?.image !== undefined;
    const tf = q.options[0]?.tf !== undefined;
    const endless = !quiz.total;
    const over = feedback?.done;

    return (
        <Stage mode={quiz.mode} flash={flash}>
            <Hud quiz={quiz} q={q} left={left} feedback={feedback} onQuit={onExit} />
            <div className="max-w-3xl mx-auto px-4 sm:px-5 pt-4 pb-32">
                <div className="flex items-center justify-between gap-3 min-h-[28px]">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider" style={{ background: `${level.color}22`, color: level.color }}>
                            {level.label}
                        </span>
                        <ComboBadge combo={quiz.combo} multiplier={quiz.multiplier} />
                    </div>
                    {!blitz && (
                        <span className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${pct < 0.3 && !feedback ? 'text-[#ff7a59]' : 'text-white/70'}`}>
                            <Timer className="w-4 h-4" />{feedback ? '—' : `${Math.max(0, Math.ceil(left / 1000))} s`}
                        </span>
                    )}
                </div>
                {!blitz && (
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${(feedback ? 0 : pct) * 100}%`, background: pct < 0.3 ? '#ff7a59' : level.color }} />
                    </div>
                )}

                <motion.div key={`s${shake}`} animate={shake ? { x: [0, -12, 10, -6, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                    <AnimatePresence mode="wait">
                        <motion.div key={`${q.index}-${q.prompt}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
                            <h2 className="mt-5 font-display text-2xl sm:text-3xl text-white leading-snug">{q.prompt}</h2>

                            {q.media?.image && (
                                <div className={`mt-4 rounded-3xl overflow-hidden bg-black/40 ring-1 ring-white/10 ${tf ? 'h-48 sm:h-64' : 'h-52 sm:h-72'}`}>
                                    <img src={q.media.image} alt="" className="w-full h-full object-contain" />
                                </div>
                            )}
                            {q.media?.sci && (
                                <div className="mt-4 rounded-3xl bg-black/30 ring-1 ring-white/10 py-8 px-4 text-center font-display italic text-3xl sm:text-4xl text-[#e9c46a]">{q.media.sci}</div>
                            )}
                            {q.media?.text && (
                                <blockquote className="mt-4 rounded-3xl bg-black/30 ring-1 ring-white/10 p-5 text-[15px] sm:text-base leading-relaxed text-white/85 border-l-4 border-[#e9c46a]">« {q.media.text} »</blockquote>
                            )}

                            <div className={`mt-5 grid gap-3 ${imageOptions ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
                                {q.options.map((o, i) => (
                                    <Option key={i} o={o} i={i} feedback={feedback} chosen={chosen} onPick={pick}
                                        disabled={!!feedback || chosen != null} removed={q.removed.includes(i) && !(feedback && i === feedback.answer)} />
                                ))}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

                {/* points earned, floating up */}
                <AnimatePresence>
                    {pop && (
                        <motion.div key={pop.id} className="pointer-events-none fixed left-1/2 top-1/3 z-30 -translate-x-1/2 text-center"
                            initial={{ opacity: 0, y: 30, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1 }} transition={{ duration: 1.3, times: [0, 0.15, 0.7, 1] }}>
                            <div className="font-display text-6xl text-[#a8f0c6]" style={{ textShadow: '0 0 30px #4fd18b, 0 4px 16px #000c' }}>+{pop.points}</div>
                            {pop.multiplier > 1 && <div className="mt-1 font-black text-lg text-[#ffb347] tracking-wider">COMBO ×{String(pop.multiplier).replace('.', ',')}</div>}
                        </motion.div>
                    )}
                </AnimatePresence>

                {error && <p className="mt-4 text-sm font-semibold text-[#ffb4a2]">{error}</p>}

                {feedback && !blitz && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
                        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-2xl ${feedback.correct ? 'text-[#4fd18b]' : 'text-[#ff8f7a]'}`}>
                            {feedback.correct ? <><Check className="w-7 h-7" />Bonne réponse ! <span className="text-base text-white/80">+{feedback.points} pts</span><Amount seeds={feedback.gained} sign className="text-base" /></>
                                : feedback.late ? <><Timer className="w-7 h-7" />Temps écoulé</> : <><X className="w-7 h-7" />Raté</>}
                            {feedback.lifeLost && <span className="inline-flex items-center gap-1 text-base text-[#ff6b6b]"><HeartCrack className="w-5 h-5" />Une vie en moins</span>}
                        </div>
                        {over && endless && (
                            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }}
                                className="rounded-3xl p-5 text-center bg-[#ff6b6b]/10 ring-1 ring-[#ff6b6b]/40">
                                <div className="font-display text-4xl text-white">Plus de vies !</div>
                                <div className="mt-1 text-white/70">{plural(feedback.quiz.score, 'bonne réponse')} · {fmt(feedback.quiz.points)} points</div>
                            </motion.div>
                        )}
                        <Learn learn={feedback.learn} correct={feedback.correct} />
                        <button onClick={next} className="nd-cta-gold w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold">
                            {over ? 'Voir mon résultat' : 'Question suivante'}<ArrowRight className="w-5 h-5" />
                        </button>
                    </motion.div>
                )}
                {feedback && blitz && over && (
                    <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="fixed inset-0 z-30 grid place-items-center bg-black/50">
                        <div className="font-display text-6xl text-white" style={{ textShadow: '0 0 40px #38bdf8' }}>Temps écoulé !</div>
                    </motion.div>
                )}
            </div>

            {/* jokers */}
            {!over && !(feedback && !blitz) && (
                <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#06100b] via-[#06100b]/90 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="max-w-3xl mx-auto px-4 flex justify-center gap-3">
                        {JOKERS.map((j) => {
                            const n = quiz.jokers?.[j.key] || 0;
                            const blocked = !n || !!feedback || busyJoker || (j.key === 'fifty' && (q.options.length < 4 || q.removed.length > 0))
                                || (j.key === 'skip' && !endless && !quiz.reserve);
                            return (
                                <motion.button key={j.key} whileTap={{ scale: 0.92 }} onClick={() => joker(j.key)} disabled={blocked} title={j.hint}
                                    className={`relative flex flex-col items-center gap-0.5 w-20 sm:w-24 rounded-2xl py-2 ring-1 transition-all ${blocked ? 'opacity-30 ring-white/10 bg-white/[0.03]' : 'ring-[#f2c14e]/50 bg-[#f2c14e]/10 hover:bg-[#f2c14e]/20 text-[#f4d88f]'}`}>
                                    <j.Icon className="w-5 h-5" />
                                    <span className="text-xs font-black">{j.label}</span>
                                    {n > 0 && <span className="absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full bg-[#f2c14e] text-[10px] font-black text-[#1b1203]">{n}</span>}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            )}
        </Stage>
    );
}

const ENDLESS_MODES = ['survival', 'blitz'];

// ---------- end ----------

function grade(score, total) {
    const p = score / total;
    if (p === 1) return { g: 'S', color: '#f2c14e', text: 'Sans faute, bravo naturaliste !' };
    if (p >= 0.8) return { g: 'A', color: '#4fd18b', text: 'Excellent !' };
    if (p >= 0.6) return { g: 'B', color: '#38bdf8', text: 'Bien joué !' };
    if (p >= 0.4) return { g: 'C', color: '#e9c46a', text: 'Pas mal, continue !' };
    return { g: 'D', color: '#ff7a59', text: 'Chaque erreur est une espèce de plus apprise.' };
}

function Summary({ res, onExit, onReplay }) {
    const { quiz } = res;
    const st = MODE_STYLE[quiz.mode] || MODE_STYLE.classic;
    const endless = ENDLESS_MODES.includes(quiz.mode);
    const recap = res.recap || [];
    const answered = recap.filter((r) => !r.skip);
    const correct = quiz.score;
    const acc = answered.length ? Math.round((correct / answered.length) * 100) : 0;
    const G = !endless && grade(correct, quiz.total);
    const levelUp = res.level && res.level.after.level > res.level.before.level;
    const newRecord = res.record?.beaten && res.record.previous != null && quiz.points > 0;

    useEffect(() => {
        const t = [];
        if (newRecord) t.push(setTimeout(() => sfx.record(), 700));
        else if (G && G.g === 'S') t.push(setTimeout(() => sfx.win(), 500));
        if (levelUp) t.push(setTimeout(() => sfx.levelUp(), newRecord ? 2600 : 1600));
        return () => t.forEach(clearTimeout);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="max-w-4xl mx-auto px-5 py-10">
            <div className="flex justify-end"><button onClick={onExit} className="grid place-items-center w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/15" aria-label="Fermer"><X className="w-4 h-4 text-white" /></button></div>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <p className="inline-flex items-center gap-1.5 uppercase tracking-[0.25em] text-xs font-bold" style={{ color: st.color }}><st.Icon className="w-4 h-4" />{quiz.modeLabel}{quiz.theme !== 'all' ? ` · ${quiz.themeLabel}` : ''}</p>
                {G ? (
                    <div className="mt-4 flex items-center justify-center gap-6">
                        <motion.div initial={{ scale: 3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 12 }}
                            className="grid place-items-center w-28 h-28 rounded-[2rem] font-display text-7xl"
                            style={{ color: G.color, background: `${G.color}18`, boxShadow: `0 0 60px -10px ${G.color}`, border: `3px solid ${G.color}` }}>{G.g}</motion.div>
                        <div className="text-left">
                            <div className="font-display text-6xl text-white">{correct}<span className="text-white/40 text-3xl">/{quiz.total}</span></div>
                            <div className="font-display text-lg" style={{ color: G.color }}>{G.text}</div>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4">
                        <div className="font-display text-7xl text-white">{correct}</div>
                        <div className="font-display text-xl" style={{ color: st.color }}>bonne{correct > 1 ? 's' : ''} réponse{correct > 1 ? 's' : ''} {quiz.mode === 'blitz' ? 'en un blitz' : 'avant de tomber'}</div>
                    </div>
                )}
                <div className="mt-5 font-display text-4xl text-white"><Rolling value={quiz.points} duration={1400} /> <span className="text-xl text-white/50">points</span></div>

                {newRecord && (
                    <motion.div initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 12 }}
                        className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 font-black text-[#1b1203]" style={{ background: 'linear-gradient(90deg,#ffe9a0,#f2c14e,#ffb347)', boxShadow: '0 0 40px -6px #f2c14e' }}>
                        <Trophy className="w-5 h-5" />NOUVEAU RECORD ! <span className="font-semibold opacity-70">(avant : {fmt(res.record.previous)})</span>
                    </motion.div>
                )}
                {res.dailyRank && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f2c14e]/12 ring-1 ring-[#f2c14e]/40 px-5 py-2 text-[#f4d88f] font-bold">
                        <Medal className="w-5 h-5" />{res.dailyRank.rank === 1 ? '1er' : `${res.dailyRank.rank}e`} sur {plural(res.dailyRank.players, 'joueur')} au défi du jour
                    </div>
                )}

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mx-auto">
                    {[[`${acc}%`, 'précision'], [quiz.bestCombo, 'meilleure série'], [correct, 'bonnes réponses'], [answered.length, 'questions']].map(([v, l]) => (
                        <div key={l} className="rounded-2xl bg-white/[0.05] ring-1 ring-white/10 py-3">
                            <div className="font-display text-2xl text-white">{v}</div>
                            <div className="text-[11px] text-white/50">{l}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-5 flex justify-center gap-4 text-xl">
                    <Amount seeds={quiz.coins} sign />
                    {quiz.nuggets > 0 && <Amount nuggets={quiz.nuggets} sign />}
                </div>
            </motion.div>

            {res.level && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                    className={`mt-8 max-w-md mx-auto rounded-3xl p-4 ring-1 ${levelUp ? 'ring-[#f2c14e]/60 bg-[#f2c14e]/10' : 'ring-white/10 bg-white/[0.04]'}`}>
                    <div className="flex items-center gap-3">
                        <LevelBadge level={res.level.after.level} size={52} />
                        <div className="flex-1">
                            {levelUp
                                ? <div className="font-display text-xl text-[#f4d88f]">Niveau {res.level.after.level} atteint !</div>
                                : <div className="font-display text-xl text-white">Niveau {res.level.after.level}</div>}
                            <div className="text-sm text-white/60">{res.level.after.title}</div>
                        </div>
                        <span className="text-sm font-bold text-[#a8f0c6]">+{fmt(quiz.points)} pts</span>
                    </div>
                    <div className="mt-3"><XpBar level={res.level.after} animateFrom={levelUp ? res.level.after.from : res.level.before.points} /></div>
                </motion.div>
            )}

            {res.rewardCard && (
                <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 1.2, duration: 0.6 }} className="mt-8 flex flex-col items-center">
                    <p className="mb-3 font-bold text-[#e9c46a]">Carte gagnée !</p>
                    <Link to={`/carte/${res.rewardCard.id}`} onClick={onExit} className="w-56"><Card card={res.rewardCard} tilt /></Link>
                </motion.div>
            )}

            {recap.length > 0 && (
                <div className="mt-10">
                    <h2 className="font-display text-2xl text-white">Ce que tu as appris</h2>
                    <div className="mt-4 grid sm:grid-cols-2 gap-2">
                        {recap.map(({ card, correct: ok, skip }, i) => card && (
                            <Link key={i} to={`/carte/${card.id}`} onClick={onExit} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-2.5 hover:bg-white/[0.08]">
                                <img src={img(card.thumb_url)} alt="" className="w-12 h-12 rounded-xl object-cover bg-black/30" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-white truncate">{card.name}</div>
                                    {card.sci_name && card.sci_name !== card.name && <div className="text-xs italic text-white/50 truncate">{card.sci_name}</div>}
                                </div>
                                {skip ? <FastForward className="w-5 h-5 text-white/40 shrink-0" /> : ok ? <Check className="w-5 h-5 text-[#4fd18b] shrink-0" /> : <X className="w-5 h-5 text-[#ff6b6b] shrink-0" />}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-10 flex flex-wrap justify-center gap-3">
                {quiz.mode !== 'daily' && (
                    <button onClick={() => onReplay(quiz.mode, quiz.theme)} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-black text-[#08130d]"
                        style={{ background: `linear-gradient(135deg, #fff, ${st.color})` }}><RotateCcw className="w-5 h-5" />Rejouer</button>
                )}
                <button onClick={onExit} className="nd-cta-glass inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold">Menu du quiz</button>
            </div>
        </div>
    );
}

export default function Quiz() {
    const [state, setState] = useState(null);
    const [playing, setPlaying] = useState(null); // { id, fresh, mode, theme }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const refresh = useCallback(() => api('quiz').then(setState).catch((e) => setError(e.message)), []);
    useEffect(() => { refresh(); }, [refresh]);

    const start = useCallback(async (mode, theme, resumeId) => {
        if (resumeId) { setPlaying({ id: resumeId, fresh: false }); return; }
        setBusy(true);
        setError('');
        try {
            const { id } = await api('quizStart', { mode, theme });
            setPlaying({ id, fresh: true, mode, theme });
        } catch (e) {
            setError(e.message);
            setPlaying(null);
            refresh();
        } finally {
            setBusy(false);
        }
    }, [refresh]);

    const exit = useCallback(() => { setPlaying(null); refresh(); window.scrollTo(0, 0); }, [refresh]);
    const replay = useCallback((mode, theme) => { setPlaying(null); start(mode, theme); }, [start]);

    const game = useMemo(() => playing && (
        <QuizRun key={playing.id} id={playing.id} fresh={playing.fresh} mode={playing.mode} onExit={exit} onReplay={replay} />
    ), [playing, exit, replay]);

    if (game) return game;
    if (!state) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Chargement…'}</div>;
    return <Home state={state} onStart={start} busy={busy} error={error} />;
}
