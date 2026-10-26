import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Crown, Flag, RefreshCw, Shield, Skull, Sparkles, Swords, Wind, Zap } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { TYPES } from '../game.jsx';
import { ABILITIES, Avatar, HpBar, MultTag, PROFILES, Stats, TypeChip, matchup } from '../components/Fighter.jsx';
import { Reward } from './Combat.jsx';
import { sfx } from '../sfx.js';

const STEP_MS = 650;
const INTENT_ICON = { attack: Swords, special: Sparkles, guard: Shield, switch: RefreshCw };
const same = (a, b) => a.kind === b.kind && (a.kind !== 'switch' || a.to === b.to);
const clone = (o) => JSON.parse(JSON.stringify(o));

// one sound per battle event, panned to the side it happens on
function eventSound(e) {
    const pan = e.side === 0 ? -0.35 : 0.35;
    if (e.kind === 'act') return e.special ? sfx.special(pan) : sfx.attack(pan);
    if (e.kind === 'damage') return sfx.hit(e.source?.mult, pan);
    if (e.kind === 'heal' || e.kind === 'boost') return sfx.heal(pan);
    if (e.kind === 'shield') return sfx.shield(pan);
    if (e.kind === 'dodge') return sfx.dodge(pan);
    if (e.kind === 'poison' || e.kind === 'weak' || e.kind === 'drain') return sfx.debuff(pan);
    if (e.kind === 'ko') return sfx.ko(pan);
    if (e.kind === 'switch') return sfx.swish(pan);
    if (e.kind === 'end') return e.winner === 0 ? sfx.win() : sfx.lose();
}

function Energy({ value, max = 5, label }) {
    return (
        <span className="inline-flex items-center gap-1" title={`${value} énergie`}>
            {label && <span className="text-[10px] uppercase tracking-wider text-white/50 mr-0.5">{label}</span>}
            {Array.from({ length: max }, (_, i) => (
                <motion.span key={i} initial={false} animate={{ scale: i < value ? 1 : 0.8, opacity: i < value ? 1 : 0.35 }}>
                    <Zap className={`w-4 h-4 ${i < value ? 'text-[#f4d88f] fill-[#f4d88f]' : 'text-white/40'}`} />
                </motion.span>
            ))}
        </span>
    );
}

function Statuses({ f }) {
    const tags = [];
    if (f.shield > 0) tags.push(['#a5c8ff', `Bouclier ${f.shield}`]);
    if (f.boost > 0) tags.push(['#8ee6a8', `ATQ +${f.boost * 30} %`]);
    if (f.weak > 0) tags.push(['#ffb4a2', `ATQ −30 % (${f.weak})`]);
    if (f.poisonTurns > 0) tags.push(['#c39bff', `Poison ${f.poison} × ${f.poisonTurns}`]);
    if (f.thorns > 0) tags.push(['#e9c46a', 'Épines']);
    return tags.length ? (
        <span className="flex flex-wrap gap-1">
            {tags.map(([c, t]) => <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${c}26`, color: c }}>{t}</span>)}
        </span>
    ) : null;
}

// The big card on the field, with floating damage numbers.
function ActiveCard({ f, foe, side, flash }) {
    const t = TYPES[f.type];
    const mine = side === 0;
    const m = foe ? matchup(f, foe) : { dealt: 1 };
    return (
        <motion.div key={f.id} initial={{ opacity: 0, x: mine ? -30 : 30 }} animate={{ opacity: 1, x: 0 }}
            className="relative flex gap-3 sm:gap-4 items-center p-3 sm:p-4 rounded-3xl border w-full"
            style={{ borderColor: `${t.color}66`, background: `linear-gradient(135deg, ${t.color}22, transparent 70%)` }}>
            <motion.div animate={flash?.kind === 'damage' ? { x: [0, -8, 8, -4, 0] } : flash?.kind === 'act' ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.35 }} key={flash?.n}>
                <Avatar card={f} size={84} dim={f.hp <= 0} />
            </motion.div>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-lg sm:text-xl font-semibold leading-tight truncate">{f.name}</p>
                    <TypeChip type={f.type} small />
                    {foe && <MultTag mult={m.dealt} prefix="inflige " />}
                </div>
                <HpBar hp={f.hp} max={f.maxHp} shield={f.shield} height={12} />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold tabular-nums">{f.hp}<span className="text-white/50">/{f.maxHp} PV</span></span>
                    <Stats card={f} hp={false} />
                </div>
                <Statuses f={f} />
            </div>
            <AnimatePresence>
                {flash && (flash.kind === 'damage' || flash.kind === 'heal') && (
                    <motion.span key={flash.n} initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: 1, y: -34, scale: 1.15 }} exit={{ opacity: 0 }}
                        className={`absolute top-2 left-14 font-display font-black text-3xl drop-shadow ${flash.kind === 'heal' ? 'text-[#8ee6a8]' : flash.mult > 1 ? 'text-[#ff8a65]' : 'text-white'}`}>
                        {flash.kind === 'heal' ? '+' : '−'}{flash.amount}
                        {flash.mult > 1 && <span className="block text-xs font-bold">super efficace</span>}
                        {flash.mult < 1 && <span className="block text-xs font-bold text-white/70">peu efficace</span>}
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function Bench({ team, active, foe, side, onPick, options, disabled }) {
    return (
        <div className={`flex gap-2 ${side === 1 ? 'justify-end' : ''}`}>
            {team.map((f, i) => {
                if (i === active) return null;
                const m = foe ? matchup(f, foe) : null;
                const opt = options?.find((o) => o.action.kind === 'switch' && o.action.to === i);
                const Tag = opt && onPick ? 'button' : 'div';
                return (
                    <Tag key={f.id} onClick={opt && onPick ? () => onPick(opt.action) : undefined} disabled={disabled}
                        className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.06] text-left ${opt && onPick ? 'hover:bg-white/[0.12] ring-1 ring-white/15 disabled:opacity-50' : ''}`}>
                        <Avatar card={f} size={34} dim={f.hp <= 0} />
                        <span className="min-w-0">
                            <span className="block text-[11px] font-semibold leading-tight truncate max-w-24">{f.name}</span>
                            {f.hp > 0 ? (
                                <span className="flex items-center gap-1">
                                    <span className="w-14"><HpBar hp={f.hp} max={f.maxHp} height={4} /></span>
                                    {m && side === 0 && <><MultTag mult={m.dealt} prefix="inflige " /><MultTag mult={m.taken} prefix="subit " invert /></>}
                                </span>
                            ) : <span className="text-[10px] text-[#ffb4a2] font-bold">K.O.</span>}
                        </span>
                    </Tag>
                );
            })}
        </div>
    );
}

function Outcome({ opt }) {
    if (!opt) return null;
    return (
        <span className="block mt-1 text-[11px] leading-snug">
            <span className="text-[#8ee6a8]">Tu infliges {opt.dealt}</span> · <span className="text-[#ffb4a2]">tu subis {opt.taken}</span>
            <span className="flex flex-wrap gap-1 mt-0.5">
                {opt.win && <b className="px-1.5 rounded bg-[#e9c46a] text-[#2a1c00]">VICTOIRE</b>}
                {!opt.win && opt.koFoe && <b className="px-1.5 rounded bg-[#4fd18b]/25 text-[#8ee6a8]">K.O. adverse</b>}
                {opt.lose && <b className="px-1.5 rounded bg-rust text-white">DÉFAITE</b>}
                {!opt.lose && opt.koSelf && <b className="px-1.5 rounded bg-rust/30 text-[#ffb4a2]">ta carte tombe</b>}
            </span>
        </span>
    );
}

function Intent({ intent, foeName }) {
    if (!intent) return null;
    const Icon = INTENT_ICON[intent.icon] || Swords;
    return (
        <motion.div key={intent.label + intent.text} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="relative mx-auto max-w-md px-4 py-2.5 rounded-2xl bg-[#1b0f0a]/80 border border-rust/50 text-sm shadow-lg">
            <span className="absolute -top-2 left-6 w-4 h-4 rotate-45 bg-[#1b0f0a] border-l border-t border-rust/50" />
            <p className="flex items-center gap-2 font-bold text-[#ffb4a2]">
                <Icon className="w-4 h-4" />{foeName} prépare : {intent.label}
                {intent.damage != null && <span className="ml-auto tabular-nums text-white">{intent.damage} dégâts <MultTag mult={intent.mult} /></span>}
            </p>
            <p className="text-xs text-white/75 mt-0.5">{intent.text}</p>
        </motion.div>
    );
}

function EndModal({ battle, onClose }) {
    const won = battle.status === 'won';
    const st = battle.state;
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur p-4">
            <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm p-6 rounded-[2rem] nd-glass nd-ring text-center">
                {won ? <Crown className="w-14 h-14 mx-auto text-[#f4d88f]" /> : <Skull className="w-14 h-14 mx-auto text-[#ffb4a2]" />}
                <h2 className="mt-2 font-display text-4xl font-bold">{won ? 'Victoire !' : 'Défaite'}</h2>
                <p className="text-ink-soft text-sm mt-1">
                    {st.forfeit ? 'Tu as abandonné.' : `${st.round} manche${st.round > 1 ? 's' : ''} contre ${battle.opponent?.name || battle.stageName}.`}
                </p>
                {battle.reward && (battle.reward.coins > 0 || battle.reward.nuggets > 0) && (
                    <div className="mt-4 p-3 rounded-2xl bg-white/[0.06]">
                        <p className="text-xs text-ink-soft">{battle.reward.first ? 'Première victoire sur cette étape' : 'Récompense'}</p>
                        <p className="text-2xl mt-1"><Reward coins={battle.reward.coins} nuggets={battle.reward.nuggets} sign /></p>
                    </div>
                )}
                {won && !battle.reward && battle.mode !== 'friend' && <p className="mt-3 text-xs text-white/60">Victoires récompensées du jour épuisées : reviens demain.</p>}
                {battle.ratingDelta != null && (
                    <p className={`mt-3 font-display text-2xl font-bold ${battle.ratingDelta >= 0 ? 'text-[#8ee6a8]' : 'text-[#ffb4a2]'}`}>
                        {battle.ratingDelta >= 0 ? '+' : ''}{battle.ratingDelta} points
                    </p>
                )}
                <div className="mt-5 flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-full bg-white/10 font-semibold">Revoir</button>
                    <Link to="/combat" className="flex-1 py-2.5 rounded-full nd-btn font-bold">Continuer</Link>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function Battle() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { setUser, refreshBadges } = useGame();
    const [battle, setBattle] = useState(null);
    const [shown, setShown] = useState(null); // teams/active/energy currently on screen
    const [flash, setFlash] = useState([null, null]);
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(false);
    const n = useRef(0);
    const logRef = useRef(null);

    const show = (b) => setShown({ teams: clone(b.state.teams), active: [...b.state.active], energy: [...b.state.energy] });
    useEffect(() => {
        api('battle', { id }).then(({ battle: b }) => { setBattle(b); show(b); if (b.status !== 'active') setModal(true); }).catch((e) => setError(e.message));
    }, [id]);
    useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [log]);

    async function replay(events, view) {
        const cur = clone(shown);
        const names = (side) => view.names?.[side];
        for (const e of events) {
            if (e.kind === 'switch') cur.active[e.side] = e.slot;
            if (e.side != null && e.slot != null && e.hp != null) {
                cur.teams[e.side][e.slot].hp = e.hp;
                cur.teams[e.side][e.slot].shield = e.shield;
            }
            if (e.kind === 'drain') cur.energy[e.side] = Math.max(0, cur.energy[e.side] - e.amount);
            let text = e.text;
            if (e.kind === 'damage') {
                const f = cur.teams[e.side][e.slot];
                const mult = e.source?.mult;
                text = `${f.name} subit ${e.amount} dégâts${mult > 1 ? ' (super efficace ×1,5)' : mult < 1 ? ' (peu efficace ×0,75)' : ''}.`;
            }
            if (e.kind === 'heal') text = `${cur.teams[e.side][e.slot].name} récupère ${e.amount} PV.`;
            if (e.side != null) {
                const fl = { kind: e.kind, amount: e.amount, mult: e.source?.mult, n: ++n.current };
                setFlash((p) => e.side === 0 ? [fl, p[1]] : [p[0], fl]);
            }
            setShown(clone(cur));
            eventSound(e);
            if (text) setLog((l) => [...l.slice(-60), { n: n.current + Math.random(), side: e.side, text, mine: e.side === 0, who: e.side != null ? names(e.side) : null }]);
            await new Promise((r) => setTimeout(r, e.kind === 'info' || e.kind === 'end' ? STEP_MS * 0.6 : STEP_MS));
        }
        setFlash([null, null]);
    }

    async function act(move) {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const res = await api('battleAct', { id, move });
            setLog((l) => [...l, { n: Math.random(), round: true, text: battle.state.phase === 'replace' ? 'Remplacement' : `Manche ${battle.state.round}` }]);
            await replay(res.events, res.battle.state);
            setBattle(res.battle);
            show(res.battle);
            if (res.battle.status !== 'active') {
                if (res.user) setUser(res.user);
                refreshBadges?.();
                setModal(true);
            }
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    async function forfeit() {
        if (!window.confirm('Abandonner ce combat ? Il comptera comme une défaite.')) return;
        setBusy(true);
        try {
            const { battle: b } = await api('battleForfeit', { id });
            sfx.lose();
            setBattle(b);
            show(b);
            refreshBadges?.();
            setModal(true);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    if (!battle || !shown) {
        return <div className="max-w-4xl mx-auto px-4 py-16 text-ink-soft">{error ? <>{error} · <Link to="/combat" className="text-[#f4d88f]">Retour</Link></> : 'Chargement du combat…'}</div>;
    }
    const st = battle.state;
    const me = shown.teams[0][shown.active[0]];
    const foe = shown.teams[1][shown.active[1]];
    const opts = busy ? [] : st.options;
    const optFor = (a) => opts.find((o) => same(o.action, a));
    const ab = ABILITIES[me.type];
    const replacing = st.phase === 'replace' && !busy;
    const over = battle.status !== 'active';
    const foeName = st.names?.[1] || battle.opponent?.name || 'Adversaire';
    const alive = (team) => team.filter((f) => f.hp > 0).length;

    const ActionBtn = ({ action, Icon, title, sub, tone }) => {
        const opt = optFor(action);
        return (
            <button disabled={!opt || busy} onClick={() => act(action)}
                className={`text-left p-3 rounded-2xl border transition disabled:opacity-40 disabled:cursor-not-allowed ${tone} ${opt?.win ? 'ring-2 ring-[#e9c46a]' : ''}`}>
                <span className="flex items-center gap-2 font-bold"><Icon className="w-5 h-5 shrink-0" />{title}</span>
                <span className="block text-[11px] text-white/70 leading-snug mt-0.5">{sub}</span>
                <Outcome opt={opt} />
            </button>
        );
    };

    return (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => navigate('/combat')} className="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12]" title="Retour"><ArrowLeft className="w-5 h-5" /></button>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-brass-deep">
                        {battle.mode === 'campaign' ? `Campagne · étape ${battle.stage}` : battle.mode === 'friend' ? 'Entraînement' : 'Arène classée'}
                    </p>
                    <p className="font-display text-xl font-semibold truncate">{battle.stageName || `Contre ${foeName}`}</p>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-white/[0.06] text-sm font-bold tabular-nums"><span className="hidden sm:inline">Manche </span>{Math.max(1, st.round)}/{st.maxRounds}</span>
                {!over && <button onClick={forfeit} disabled={busy} title="Abandonner" className="px-3 py-1.5 rounded-full bg-rust/20 text-[#ffb4a2] text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"><Flag className="w-4 h-4" /><span className="hidden sm:inline">Abandonner</span></button>}
            </div>

            <div className="mt-4 p-3 sm:p-5 rounded-[2rem] nd-glass space-y-3">
                {/* opponent */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                    <span className="font-semibold">{foeName} <span className="text-white/50 font-normal">· {alive(shown.teams[1])}/3 en vie</span></span>
                    <Energy value={shown.energy[1]} />
                </div>
                <Bench team={shown.teams[1]} active={shown.active[1]} foe={me} side={1} />
                <ActiveCard f={foe} foe={me} side={1} flash={flash[1]} />
                {!over && !busy && st.phase === 'choose' && <Intent intent={st.intent} foeName={foe.name} />}

                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold"><span className="flex-1 h-px bg-white/10" />vs<span className="flex-1 h-px bg-white/10" /></div>

                {/* player */}
                <ActiveCard f={me} foe={foe} side={0} flash={flash[0]} />
                <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                    <span className="font-semibold">Toi <span className="text-white/50 font-normal">· {alive(shown.teams[0])}/3 en vie</span></span>
                    <Energy value={shown.energy[0]} />
                </div>
            </div>

            {/* actions */}
            <div className="mt-4">
                {error && <p className="mb-2 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                {over ? (
                    <div className="flex gap-2">
                        <button onClick={() => setModal(true)} className="flex-1 py-3 rounded-full bg-white/10 font-semibold">Voir le résultat</button>
                        <Link to="/combat" className="flex-1 py-3 rounded-full nd-btn font-bold text-center">Retour à l'arène</Link>
                    </div>
                ) : replacing ? (
                    <div className="p-4 rounded-3xl border border-rust/40 bg-rust/10">
                        <p className="font-bold">Ta carte est K.O. — choisis celle qui entre en jeu</p>
                        <p className="text-xs text-white/70 mb-3">Vert = avantage, rouge = désavantage face à {foe.name} (inflige / subit ×1,5 ou ×0,75).</p>
                        <Bench team={shown.teams[0]} active={shown.active[0]} foe={foe} side={0} options={opts} onPick={act} disabled={busy} />
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-ink-soft mb-2">
                            {busy ? 'La manche se joue…' : <>Ce que tu vois est exact : aucun hasard. {me.spd > foe.spd ? `${me.name} est plus rapide et frappera en premier.` : me.spd < foe.spd ? `${foe.name} est plus rapide et frappera en premier.` : 'Vitesse égale : tu frappes en premier.'}</>}
                        </p>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                            <ActionBtn action={{ kind: 'attack' }} Icon={Swords} title="Attaque" sub={`Coup normal · ${PROFILES[me.type].role}`} tone="border-white/15 bg-white/[0.05] hover:bg-white/[0.1]" />
                            <ActionBtn action={{ kind: 'special' }} Icon={Sparkles}
                                title={<>{ab.name} <span className="ml-auto inline-flex items-center text-[#f4d88f]">{ab.cost}<Zap className="w-3.5 h-3.5 fill-current" /></span></>}
                                sub={shown.energy[0] < ab.cost ? `Il faut ${ab.cost} ⚡ (tu en as ${shown.energy[0]}). ${ab.text}` : ab.text}
                                tone="border-[#e9c46a]/40 bg-[#e9c46a]/[0.08] hover:bg-[#e9c46a]/[0.15]" />
                            <ActionBtn action={{ kind: 'guard' }} Icon={Shield} title="Se protéger" sub="Dégâts reçus ÷ 2 et +1 ⚡. Agit en priorité." tone="border-[#a5c8ff]/30 bg-[#a5c8ff]/[0.06] hover:bg-[#a5c8ff]/[0.12]" />
                        </div>
                        {shown.teams[0].some((f, i) => i !== shown.active[0] && f.hp > 0) && (
                            <div className="mt-3">
                                <p className="text-xs text-ink-soft mb-1.5 flex items-center gap-1"><Wind className="w-3.5 h-3.5" />Changer de carte (priorité : la nouvelle encaisse le coup adverse)</p>
                                <div className="grid sm:grid-cols-2 gap-2">
                                    {shown.teams[0].map((f, i) => i === shown.active[0] || f.hp <= 0 ? null : (
                                        <ActionBtn key={f.id} action={{ kind: 'switch', to: i }} Icon={RefreshCw}
                                            title={<span className="flex items-center gap-2 min-w-0"><Avatar card={f} size={26} /><span className="truncate">{f.name}</span><MultTag mult={matchup(f, foe).dealt} prefix="inflige " /><MultTag mult={matchup(f, foe).taken} prefix="subit " invert /></span>}
                                            sub={`${f.hp}/${f.maxHp} PV · ${TYPES[f.type].label}`} tone="border-white/10 bg-white/[0.03] hover:bg-white/[0.08]" />
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* log */}
            <div ref={logRef} className="mt-4 max-h-56 overflow-y-auto p-3 rounded-2xl bg-black/30 text-sm space-y-1">
                {log.length === 0 ? <p className="text-white/40 text-xs">Le journal du combat s'affichera ici.</p> : log.map((l) => l.round ? (
                    <p key={l.n} className="pt-1 text-[10px] uppercase tracking-[0.2em] font-bold text-brass-deep">{l.text}</p>
                ) : (
                    <p key={l.n} className={l.side === 0 ? 'text-[#c8f2d6]' : l.side === 1 ? 'text-[#ffd2c4]' : 'text-white/80 font-semibold'}>{l.text}</p>
                ))}
            </div>

            <AnimatePresence>{modal && over && <EndModal battle={battle} onClose={() => setModal(false)} />}</AnimatePresence>
        </div>
    );
}
