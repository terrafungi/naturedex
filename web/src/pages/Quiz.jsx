import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    ArrowRight, BookOpen, Bone, Brain, Check, ExternalLink, Flame, Flower2, Globe2, Lightbulb, PawPrint, Play, RotateCcw, Shell, Target, Timer, X,
} from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card, TypeBadge } from '../components/Card.jsx';
import { Amount } from '../components/Currency.jsx';
import { IUCN, RARITIES, TYPES } from '../game.jsx';

const THEME_STYLE = {
    all: { Icon: Globe2, color: '#4fd18b', hint: 'Toutes les familles mélangées' },
    faune: { Icon: PawPrint, color: '#e2683c', hint: 'Mammifères, oiseaux, reptiles, poissons' },
    flore: { Icon: Flower2, color: '#65a30d', hint: 'Plantes, arbres, algues, champignons' },
    petites: { Icon: Shell, color: '#4f46e5', hint: 'Insectes, araignées, vie marine' },
    origines: { Icon: Bone, color: '#a8763e', hint: 'Fossiles, bactéries, virus, levures' },
};
const LEVELS = [
    { label: 'Facile', color: '#4fd18b' },
    { label: 'Moyen', color: '#e9c46a' },
    { label: 'Expert', color: '#ff7a59' },
];

const img = (url) => url || undefined;

function Pips({ total, used, className = '' }) {
    return (
        <span className={`inline-flex gap-1.5 ${className}`}>
            {Array.from({ length: total }, (_, i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < used ? 'bg-white/15' : 'bg-[#4fd18b] shadow-[0_0_10px_#4fd18b]'}`} />
            ))}
        </span>
    );
}

// ---------- home ----------

function Home({ state, onStart, busy, error }) {
    const [theme, setTheme] = useState('all');
    const s = state.stats;
    const accuracy = s.questions ? Math.round((s.correct / s.questions) * 100) : null;
    const kinds = state.kinds.filter((k) => k.answered).sort((a, b) => b.correct / b.answered - a.correct / a.answered);
    const r = state.rewards;

    return (
        <div className="max-w-5xl mx-auto px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Apprendre en jouant</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Quiz du naturaliste</h1>
            <p className="mt-3 text-ink-soft max-w-2xl">
                {state.perDay} quiz par jour, 10 questions chacun, de plus en plus difficiles. Photos, noms latins, textes Wikipédia,
                espèces menacées, poids, cousins de genre… Les espèces que tu as déjà vues reviennent le moins possible.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-2xl nd-glass px-4 py-3 flex items-center gap-3">
                    <Pips total={state.perDay} used={state.perDay - state.left} />
                    <span className="text-sm text-white/80"><b className="text-white">{state.left}</b> quiz restant{state.left > 1 ? 's' : ''} aujourd'hui</span>
                </div>
                <div className="rounded-2xl nd-glass px-4 py-3 flex items-center gap-2 text-sm text-white/80">
                    <Flame className={`w-5 h-5 ${state.streak ? 'text-[#ff9f43]' : 'text-white/30'}`} />
                    <span><b className="text-white">{state.streak}</b> jour{state.streak > 1 ? 's' : ''} de suite</span>
                </div>
            </div>

            {error && <p className="mt-4 text-sm font-semibold text-[#ffb4a2]">{error}</p>}

            {state.active ? (
                <div className="mt-8 rounded-3xl nd-glass p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                        <div className="font-display text-2xl text-white">Quiz en cours</div>
                        <p className="text-ink-soft text-sm mt-1">Question {state.active.current + 1} / {state.active.total} · {state.active.score} bonne{state.active.score > 1 ? 's' : ''} réponse{state.active.score > 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={() => onStart(null, state.active.id)} className="nd-cta-gold inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-bold">
                        <Play className="w-5 h-5" />Reprendre
                    </button>
                </div>
            ) : state.left > 0 ? (
                <div className="mt-8">
                    <h2 className="font-display text-2xl text-white">Choisis ton thème</h2>
                    <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {state.themes.map((t) => {
                            const st = THEME_STYLE[t.key] || THEME_STYLE.all;
                            const on = theme === t.key;
                            return (
                                <button key={t.key} onClick={() => setTheme(t.key)}
                                    className={`relative text-left rounded-2xl p-4 transition-all overflow-hidden ${on ? 'ring-2 bg-white/[0.08]' : 'nd-glass hover:bg-white/[0.06]'} ${t.key === 'all' ? 'col-span-2 lg:col-span-1' : ''}`}
                                    style={{ '--tw-ring-color': st.color }}>
                                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl" style={{ background: st.color, opacity: on ? 0.4 : 0.12 }} />
                                    <st.Icon className="relative w-7 h-7" style={{ color: st.color }} />
                                    <div className="relative mt-3 font-bold text-white leading-tight">{t.label}</div>
                                    <div className="relative mt-1 text-xs text-white/55 leading-snug">{st.hint}</div>
                                </button>
                            );
                        })}
                    </div>
                    <button disabled={busy} onClick={() => onStart(theme)} className="nd-cta-gold mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold disabled:opacity-60">
                        <Brain className="w-5 h-5" />{busy ? 'Préparation…' : 'Lancer le quiz'}
                    </button>
                </div>
            ) : (
                <div className="mt-8 rounded-3xl nd-glass p-6">
                    <div className="font-display text-2xl text-white">C'est tout pour aujourd'hui !</div>
                    <p className="text-ink-soft mt-1">Tu as joué tes {state.perDay} quiz. De nouvelles questions t'attendent demain : reviens pour garder ta série.</p>
                </div>
            )}

            {state.today.some((q) => q.status === 'done') && (
                <div className="mt-6 flex flex-wrap gap-2">
                    {state.today.filter((q) => q.status === 'done').map((q) => (
                        <span key={q.id} className="rounded-full bg-white/[0.06] ring-1 ring-white/10 px-3 py-1.5 text-sm text-white/80">
                            {state.themes.find((t) => t.key === q.theme)?.label} · <b className="text-white">{q.score}/{q.total}</b> · <Amount seeds={q.coins} sign />
                            {q.nuggets > 0 && <> <Amount nuggets={q.nuggets} sign /></>}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-10 grid lg:grid-cols-2 gap-4">
                <div className="rounded-3xl nd-glass p-5">
                    <h3 className="font-display text-xl text-white flex items-center gap-2"><Target className="w-5 h-5 text-[#e9c46a]" />Récompenses</h3>
                    <ul className="mt-3 space-y-2 text-sm text-white/80">
                        {LEVELS.map((l, i) => (
                            <li key={l.label} className="flex items-center justify-between">
                                <span><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: l.color }} />Bonne réponse {l.label.toLowerCase()}</span>
                                <Amount seeds={r.levelCoins[i]} sign />
                            </li>
                        ))}
                        <li className="flex items-center justify-between"><span>Au moins {r.cardScore}/10</span><span className="font-bold text-[#a8f0c6]">+1 carte d'une espèce trouvée</span></li>
                        <li className="flex items-center justify-between"><span>Sans faute 10/10</span><span className="flex gap-2"><Amount seeds={r.perfectCoins} sign /><Amount nuggets={r.perfectNuggets} sign /></span></li>
                    </ul>
                    <p className="mt-3 text-xs text-white/50">Chaque question a un temps limité. Après chaque réponse, une fiche t'explique l'espèce.</p>
                </div>
                <div className="rounded-3xl nd-glass p-5">
                    <h3 className="font-display text-xl text-white flex items-center gap-2"><Lightbulb className="w-5 h-5 text-[#e9c46a]" />Tes connaissances</h3>
                    {s.quizzes === 0 && !kinds.length ? (
                        <p className="mt-3 text-sm text-ink-soft">Joue ton premier quiz pour voir tes points forts.</p>
                    ) : (
                        <>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                                {[[s.quizzes, 'quiz'], [accuracy != null ? `${accuracy}%` : '–', 'réussite'], [s.perfect, 'sans faute'], [s.species, 'espèces vues']].map(([v, l]) => (
                                    <div key={l} className="rounded-xl bg-white/[0.04] py-2">
                                        <div className="font-display text-xl text-white">{v}</div>
                                        <div className="text-[11px] text-white/50">{l}</div>
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

// ---------- question ----------

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

function Option({ q, o, i, feedback, chosen, onPick, disabled }) {
    const isAnswer = feedback && i === feedback.answer;
    const isWrong = feedback && i === chosen && !feedback.correct;
    const label = o.label ?? feedback?.reveal?.[i];
    const ring = isAnswer ? 'ring-2 ring-[#4fd18b] bg-[#4fd18b]/12' : isWrong ? 'ring-2 ring-[#ff6b6b] bg-[#ff6b6b]/10' : 'ring-1 ring-white/12 bg-white/[0.04] hover:bg-white/[0.09]';
    const fade = feedback && !isAnswer && !isWrong ? 'opacity-55' : '';
    const fact = feedback?.facts?.[i];
    const key = <span className="hidden sm:grid place-items-center w-6 h-6 rounded-md bg-white/10 text-[11px] font-bold text-white/60 shrink-0">{i + 1}</span>;

    if (o.image !== undefined) {
        return (
            <button disabled={disabled} onClick={() => onPick(i)} className={`group relative rounded-2xl overflow-hidden text-left transition-all ${ring} ${fade}`}>
                <div className="aspect-square bg-black/40">
                    {o.image && <img src={img(o.image)} alt="" className="w-full h-full object-cover" loading="eager" />}
                </div>
                <span className="absolute top-2 left-2">{key}</span>
                {(label || fact) && (
                    <div className="px-2.5 py-2 text-[13px] leading-tight text-white font-semibold">
                        {label}{fact && <div className="text-[11px] font-normal text-[#e9c46a] mt-0.5">{fact}</div>}
                    </div>
                )}
                {isAnswer && <Check className="absolute top-2 right-2 w-7 h-7 p-1 rounded-full bg-[#4fd18b] text-[#05130d]" />}
                {isWrong && <X className="absolute top-2 right-2 w-7 h-7 p-1 rounded-full bg-[#ff6b6b] text-white" />}
            </button>
        );
    }
    const type = o.type && TYPES[o.type];
    const iucn = o.iucn && IUCN[o.iucn];
    return (
        <button disabled={disabled} onClick={() => onPick(i)} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all ${ring} ${fade}`}>
            {key}
            {type && <TypeBadge type={o.type} className="w-8 h-8 shrink-0" />}
            {iucn && <span className="px-1.5 py-0.5 rounded text-[11px] font-black text-white shrink-0" style={{ background: iucn.color }}>{o.iucn}</span>}
            <span className={`flex-1 font-semibold text-white leading-snug ${o.italic ? 'italic font-display' : ''}`}>{type ? type.label : label}</span>
            {isAnswer && <Check className="w-5 h-5 text-[#4fd18b] shrink-0" />}
            {isWrong && <X className="w-5 h-5 text-[#ff6b6b] shrink-0" />}
        </button>
    );
}

function Learn({ learn, correct }) {
    if (!learn) return null;
    const r = RARITIES[learn.rarity] || RARITIES.common;
    const iucn = learn.iucn && IUCN[learn.iucn];
    return (
        <div className="rounded-3xl nd-glass p-4 sm:p-5 flex gap-4">
            <Link to={`/carte/${learn.id}`} className="w-24 sm:w-28 shrink-0">
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
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-white/[0.07] text-white/80"><TypeBadge type={learn.type} className="w-4 h-4" />{TYPES[learn.type]?.label}</span>
                    <span className="rounded-full px-2 py-0.5 bg-white/[0.07]" style={{ color: r.color }}>{r.label}</span>
                    {iucn && <span className="rounded-full px-2 py-0.5 text-white" style={{ background: iucn.color }}>{iucn.label}</span>}
                    {learn.count > 0 && <span className="rounded-full px-2 py-0.5 bg-[#4fd18b]/15 text-[#a8f0c6]">Dans ta collection ×{learn.count}</span>}
                </div>
                {learn.fact && <p className="mt-2 text-sm text-white/80 leading-relaxed">{learn.fact}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                    <Link to={`/carte/${learn.id}`} className="text-[#a8f0c6] hover:underline">Voir la carte</Link>
                    {learn.wiki_url && <a href={learn.wiki_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/60 hover:text-white">Wikipédia<ExternalLink className="w-3.5 h-3.5" /></a>}
                </div>
            </div>
        </div>
    );
}

function QuizRun({ id, onExit }) {
    const { setUser, addCards } = useGame();
    const [data, setData] = useState(null); // { quiz, question }
    const [offset, setOffset] = useState(0);
    const [chosen, setChosen] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [recap, setRecap] = useState([]);
    const [final, setFinal] = useState(null);
    const [error, setError] = useState('');
    const sending = useRef(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const res = await api('quizNext', { id });
            if (res.done) { onExit(); return; }
            if (data) window.scrollTo({ top: 0, behavior: 'smooth' });
            setOffset(new Date(res.serverNow).getTime() - Date.now());
            setChosen(null);
            setFeedback(null);
            setData(res);
        } catch (e) { setError(e.message); }
    }, [id, onExit, data]);
    useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const q = data?.question;
    const left = useCountdown(q?.deadline, offset, !!feedback);

    const pick = useCallback(async (choice) => {
        if (!q || feedback || sending.current) return;
        sending.current = true;
        setChosen(choice);
        try {
            const res = await api('quizAnswer', { id, index: q.index, choice });
            setFeedback(res);
            setData((d) => ({ ...d, quiz: res.quiz }));
            setRecap((r) => [...r, { learn: res.learn, correct: res.correct, kind: q.kind }]);
            if (res.done) {
                setUser(res.user);
                if (res.rewardCard) addCards([res.rewardCard]);
                setFinal(res);
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

    useEffect(() => {
        const onKey = (e) => {
            if (feedback) { if (e.key === 'Enter' && !feedback.done) load(); return; }
            const n = Number(e.key);
            if (q && n >= 1 && n <= q.options.length) pick(n - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [q, feedback, pick, load]);

    if (final && final.showSummary) return <Summary res={final} recap={recap} onExit={onExit} />;
    if (!data) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Chargement…'}</div>;

    const quiz = data.quiz;
    const level = LEVELS[q.level] || LEVELS[0];
    const pct = Math.max(0, Math.min(1, left / (q.seconds * 1000)));
    const imageOptions = q.options[0]?.image !== undefined;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-10">
            <div className="flex items-center gap-3">
                <button onClick={onExit} className="grid place-items-center w-9 h-9 rounded-full nd-cta-glass shrink-0" aria-label="Quitter"><X className="w-4 h-4" /></button>
                <div className="flex-1 flex gap-1">
                    {Array.from({ length: quiz.total }, (_, i) => {
                        const r = quiz.results[i];
                        return <span key={i} className={`h-2 flex-1 rounded-full ${r === true ? 'bg-[#4fd18b]' : r === false ? 'bg-[#ff6b6b]' : i === q.index ? 'bg-white/60' : 'bg-white/12'}`} />;
                    })}
                </div>
                <span className="text-sm font-bold text-white tabular-nums">{q.index + 1}/{quiz.total}</span>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
                <span className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider" style={{ background: `${level.color}22`, color: level.color }}>
                    {level.label} · +{[3, 5, 8][q.level]} graines
                </span>
                <span className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${pct < 0.3 && !feedback ? 'text-[#ff7a59]' : 'text-white/70'}`}>
                    <Timer className="w-4 h-4" />{feedback ? '—' : `${Math.max(0, Math.ceil(left / 1000))} s`}
                </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${(feedback ? 0 : pct) * 100}%`, background: pct < 0.3 ? '#ff7a59' : level.color }} />
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={q.index} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                    <h2 className="mt-5 font-display text-2xl sm:text-3xl text-white leading-snug">{q.prompt}</h2>

                    {q.media?.image && (
                        <div className="mt-4 rounded-3xl overflow-hidden bg-black/40 ring-1 ring-white/10 h-56 sm:h-72">
                            <img src={q.media.image} alt="" className="w-full h-full object-contain" />
                        </div>
                    )}
                    {q.media?.sci && (
                        <div className="mt-4 rounded-3xl nd-glass py-8 px-4 text-center font-display italic text-3xl sm:text-4xl text-[#e9c46a]">{q.media.sci}</div>
                    )}
                    {q.media?.text && (
                        <blockquote className="mt-4 rounded-3xl nd-glass p-5 text-[15px] sm:text-base leading-relaxed text-white/85 border-l-4 border-[#e9c46a]">« {q.media.text} »</blockquote>
                    )}

                    <div className={`mt-5 grid gap-3 ${imageOptions ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
                        {q.options.map((o, i) => (
                            <Option key={i} q={q} o={o} i={i} feedback={feedback} chosen={chosen} onPick={pick} disabled={!!feedback || chosen != null} />
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {error && <p className="mt-4 text-sm font-semibold text-[#ffb4a2]">{error}</p>}

            {feedback && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
                    <div className={`flex items-center gap-3 font-display text-2xl ${feedback.correct ? 'text-[#4fd18b]' : 'text-[#ff8f7a]'}`}>
                        {feedback.correct ? <><Check className="w-7 h-7" />Bonne réponse ! <Amount seeds={feedback.gained} sign className="text-base" /></>
                            : feedback.late ? <><Timer className="w-7 h-7" />Temps écoulé</> : <><X className="w-7 h-7" />Raté</>}
                    </div>
                    <Learn learn={feedback.learn} correct={feedback.correct} />
                    <button onClick={() => (feedback.done ? setFinal({ ...final, showSummary: true }) : load())}
                        className="nd-cta-gold w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold">
                        {feedback.done ? 'Voir mon résultat' : 'Question suivante'}<ArrowRight className="w-5 h-5" />
                    </button>
                </motion.div>
            )}
        </div>
    );
}

// ---------- end ----------

function Summary({ res, recap, onExit }) {
    const { quiz } = res;
    const message = res.perfect ? 'Sans faute, bravo naturaliste !' : quiz.score >= 8 ? 'Excellent !' : quiz.score >= 5 ? 'Bien joué !' : 'Chaque erreur est une espèce de plus apprise.';
    return (
        <div className="max-w-4xl mx-auto px-5 py-10">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">{quiz.themeLabel}</p>
                <div className="mt-2 font-display text-7xl text-white">{quiz.score}<span className="text-white/40 text-4xl">/{quiz.total}</span></div>
                <p className="mt-2 font-display text-xl text-[#a8f0c6]">{message}</p>
                <div className="mt-4 flex justify-center gap-4 text-lg">
                    <Amount seeds={quiz.coins} sign />
                    {quiz.nuggets > 0 && <Amount nuggets={quiz.nuggets} sign />}
                </div>
            </motion.div>

            {res.rewardCard && (
                <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }} className="mt-8 flex flex-col items-center">
                    <p className="mb-3 font-bold text-[#e9c46a]">Carte gagnée !</p>
                    <Link to={`/carte/${res.rewardCard.id}`} className="w-56"><Card card={res.rewardCard} tilt /></Link>
                </motion.div>
            )}
            {!res.rewardCard && (
                <p className="mt-6 text-center text-sm text-ink-soft">Atteins {8}/10 pour gagner une carte d'une espèce que tu as reconnue.</p>
            )}

            {recap.length > 0 && (
                <div className="mt-10">
                    <h2 className="font-display text-2xl text-white">Ce que tu as appris</h2>
                    <div className="mt-4 grid sm:grid-cols-2 gap-2">
                        {recap.map(({ learn, correct }, i) => learn && (
                            <Link key={i} to={`/carte/${learn.id}`} className="flex items-center gap-3 rounded-2xl nd-glass p-2.5 hover:bg-white/[0.06]">
                                <img src={img(learn.thumb_url)} alt="" className="w-12 h-12 rounded-xl object-cover bg-black/30" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-white truncate">{learn.name}</div>
                                    {learn.sci_name && learn.sci_name !== learn.name && <div className="text-xs italic text-white/50 truncate">{learn.sci_name}</div>}
                                </div>
                                {correct ? <Check className="w-5 h-5 text-[#4fd18b] shrink-0" /> : <X className="w-5 h-5 text-[#ff6b6b] shrink-0" />}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-10 flex flex-wrap gap-3">
                <button onClick={onExit} className="nd-cta-gold inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold"><RotateCcw className="w-5 h-5" />Retour au quiz</button>
                <Link to="/collection" className="nd-cta-glass inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold">Ma collection</Link>
            </div>
        </div>
    );
}

export default function Quiz() {
    const [state, setState] = useState(null);
    const [playing, setPlaying] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const refresh = useCallback(() => api('quiz').then(setState).catch((e) => setError(e.message)), []);
    useEffect(() => { refresh(); }, [refresh]);

    async function start(theme, resumeId) {
        if (resumeId) { setPlaying(resumeId); return; }
        setBusy(true);
        setError('');
        try {
            const { id } = await api('quizStart', { theme });
            setPlaying(id);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }

    const exit = useCallback(() => { setPlaying(null); refresh(); window.scrollTo(0, 0); }, [refresh]);

    if (playing) return <QuizRun key={playing} id={playing} onExit={exit} />;
    if (!state) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Chargement…'}</div>;
    return <Home state={state} onStart={start} busy={busy} error={error} />;
}
