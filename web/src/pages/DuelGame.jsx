import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Flag, Layers, Lightbulb, Trash2, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Amount } from '../components/Currency.jsx';
import { CardText, CostRow, GameCard, biomeColor } from '../components/TcgCard.jsx';
import { CAPTURES_TO_WIN, attackDamage, chainMult } from '../tcg.js';
import { sfx } from '../sfx.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function eventSound(e) {
    const pan = e.side === 0 ? -0.3 : 0.3;
    if (e.k === 'attack') return sfx.attack(pan);
    if (e.k === 'damage') return sfx.hit(e.chain === 'prey' ? 2 : 1, pan);
    if (e.k === 'heal') return sfx.heal(pan);
    if (e.k === 'shield') return sfx.shield(pan);
    if (e.k === 'poisoned' || e.k === 'weak' || e.k === 'discardEnergy') return sfx.debuff(pan);
    if (e.k === 'ko') return sfx.ko(pan);
    if (['bench', 'energy', 'play', 'retreat', 'switch', 'promote'].includes(e.k)) return sfx.swish(pan);
    if (e.k === 'end') return e.winner === 0 ? sfx.win() : sfx.lose();
}

// What to say for an event (the engine's text, or one written for the player's point of view).
function eventText(e, names) {
    if (e.k === 'turn') return e.side === 0 ? 'À toi de jouer !' : `Tour de ${names[1]}`;
    if (e.k === 'draw' && e.side === 0) return `Tu pioches ${e.n > 1 ? `${e.n} cartes` : 'une carte'}.`;
    if (e.k === 'search') return e.side === 0 ? `Tu prends : ${e.names.join(', ')}.` : `${names[1]} cherche dans son deck.`;
    if (e.k === 'damage' && e.text) return e.text;
    if (e.k === 'damage' || e.k === 'heal' || e.k === 'draw') return null;
    return (e.text || '').replace(/^Toi /, 'Tu ').replace(/^Tu termine /, 'Tu termines ').replace(/^Tu joue /, 'Tu joues ').replace(/^Tu pose (.+) sur son /, 'Tu poses $1 sur ton ');
}

function Captures({ n, side }) {
    return (
        <span className="flex gap-1" title={`${n} capture${n > 1 ? 's' : ''} sur ${CAPTURES_TO_WIN}`}>
            {Array.from({ length: CAPTURES_TO_WIN }, (_, i) => (
                <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${i < n ? (side === 0 ? 'bg-[#4ea8ff] border-white' : 'bg-[#ff6b5b] border-white') : 'border-white/30'}`} />
            ))}
        </span>
    );
}

function Pile({ Icon, n, label, onClick }) {
    const Tag = onClick ? 'button' : 'span';
    return (
        <Tag onClick={onClick} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/30 text-xs font-bold tabular-nums" title={label}>
            <Icon className="w-3.5 h-3.5 text-white/70" />{n}
        </Tag>
    );
}

// An empty slot of the bench, so the board keeps its shape.
const Slot = ({ w = 62 }) => <span className="block shrink-0 rounded-xl border-2 border-dashed border-white/15" style={{ width: w, height: Math.round(w * 1.38) }} />;

// Floating damage / heal number over a card.
function Flash({ f }) {
    return (
        <AnimatePresence>
            {f && (
                <motion.span key={f.n} initial={{ opacity: 0, y: 6, scale: 0.6 }} animate={{ opacity: 1, y: -18, scale: 1.1 }} exit={{ opacity: 0 }}
                    className={`absolute left-1/2 -translate-x-1/2 top-1/3 z-10 font-display font-black text-3xl drop-shadow-[0_2px_4px_rgb(0_0_0/0.8)] pointer-events-none ${f.heal ? 'text-[#8ee6a8]' : f.chain === 'prey' ? 'text-[#ff8a65]' : 'text-white'}`}>
                    {f.heal ? '+' : '−'}{f.amount}
                </motion.span>
            )}
        </AnimatePresence>
    );
}

function Sheet({ onClose, children }) {
    return (
        <motion.div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={(e) => e.stopPropagation()}
                className="relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#13261d] border border-white/10 p-4 pb-6">
                <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10" title="Fermer"><X className="w-4 h-4" /></button>
                {children}
            </motion.div>
        </motion.div>
    );
}

export default function DuelGame() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { setUser } = useGame();
    const [duel, setDuel] = useState(null);
    const [shown, setShown] = useState(null); // the board on screen (replays go through each frame)
    const [replaying, setReplaying] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const [flashes, setFlashes] = useState({});
    const [sheet, setSheet] = useState(null); // { card, where: 'hand' | 'mine' | 'foe' } or { discard: true }
    const [targeting, setTargeting] = useState(null); // { label, actions: [{...action, target|to}] }
    const [setup, setSetup] = useState({ active: null, bench: [] });
    const [over, setOver] = useState(false);
    const skip = useRef(false);
    const n = useRef(0);

    useEffect(() => {
        api('duel', { id }).then(({ duel: d }) => { setDuel(d); setShown(d.view); if (d.status !== 'active') setOver(true); }).catch((e) => setError(e.message));
    }, [id]);

    async function replay(frames, final) {
        setReplaying(true);
        skip.current = false;
        for (const f of frames) {
            if (!skip.current) {
                const fl = {};
                let text = null;
                let slow = false;
                for (const e of f.events) {
                    eventSound(e);
                    if (e.k === 'damage' && e.amount) fl[e.uid] = { amount: e.amount, chain: e.chain, n: ++n.current };
                    if (e.k === 'heal' && e.amount) fl[e.uid] = { amount: e.amount, heal: true, n: ++n.current };
                    if (e.k === 'attack' || e.k === 'ko') slow = true;
                    text = eventText(e, f.view.names) || text;
                }
                setShown(f.view);
                setFlashes(fl);
                if (text) setToast({ text, n: ++n.current, side: f.events.at(-1)?.side });
                await wait(slow ? 1100 : f.events.some((e) => e.side === 1) ? 650 : 250);
            }
        }
        setShown(final.view);
        setFlashes({});
        setReplaying(false);
    }

    async function act(action) {
        if (busy || replaying) return;
        setBusy(true);
        setSheet(null);
        setTargeting(null);
        setError('');
        try {
            const res = await api('duelAct', { id, move: action });
            setDuel(res.duel);
            if (res.user) setUser(res.user);
            await replay(res.duel.frames || [], res.duel);
            if (res.duel.status !== 'active') setOver(true);
        } catch (e) {
            setError(e.message);
            sfx.error?.();
        } finally { setBusy(false); }
    }

    async function forfeit() {
        if (!window.confirm('Abandonner ce duel ? Il comptera comme une défaite.')) return;
        setBusy(true);
        try {
            const { duel: d } = await api('duelForfeit', { id });
            setDuel(d); setShown(d.view); setOver(true); sfx.lose();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    // a toast fades after a while
    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast((x) => (x?.n === toast.n ? null : x)), 2200);
        return () => clearTimeout(t);
    }, [toast]);

    if (!duel || !shown) {
        return <div className="max-w-xl mx-auto px-4 py-16 text-ink-soft">{error ? <>{error} · <Link to="/duel" className="text-[#f4d88f]">Retour</Link></> : 'Préparation du plateau…'}</div>;
    }

    const v = shown;
    const me = v.players[0];
    const foe = v.players[1];
    const names = v.names;
    const live = !busy && !replaying && duel.status === 'active' && v === duel.view;
    const acts = live ? v.actions : [];
    const myTurn = v.current === 0 && v.phase === 'main';
    const isSetup = v.phase === 'setup';
    const promoting = v.phase === 'promote' && v.current === 0;
    const targetUids = new Set((targeting?.actions || []).map((a) => a.target ?? a.to));
    const promoteUids = new Set(acts.filter((a) => a.t === 'promote').map((a) => a.uid));

    function pickTarget(uid) {
        const a = targeting.actions.find((x) => (x.target ?? x.to) === uid);
        if (a) act(a);
    }

    // a tap on any card of the board
    function tapField(card, where) {
        sfx.tap?.();
        if (targeting && targetUids.has(card.uid)) return pickTarget(card.uid);
        if (promoting && promoteUids.has(card.uid)) return act({ t: 'promote', uid: card.uid });
        if (targeting) return;
        setSheet({ card, where });
    }

    function tapHand(card) {
        sfx.tap?.();
        if (isSetup) {
            if (card.kind !== 'creature') return;
            setSetup((s) => {
                if (s.active === card.uid) return { active: s.bench[0] ?? null, bench: s.bench.slice(1) };
                if (s.bench.includes(card.uid)) return { ...s, bench: s.bench.filter((u) => u !== card.uid) };
                if (s.active == null) return { ...s, active: card.uid };
                if (s.bench.length >= 3) return s;
                return { ...s, bench: [...s.bench, card.uid] };
            });
            return;
        }
        setTargeting(null);
        setSheet({ card, where: 'hand' });
    }

    // why a hand card cannot be played now
    function blockedReason(card) {
        if (!myTurn) return 'Attends ton tour.';
        if (card.kind === 'creature') return 'Ton Banc est plein (3 créatures).';
        if (card.kind === 'energy') return me.energyPlayed ? 'Tu as déjà attaché une Énergie ce tour-ci.' : null;
        if (card.kind === 'supporter') return me.supporterPlayed ? 'Un seul Supporter par tour.' : v.turn === 1 ? 'Pas de Supporter au tout premier tour.' : 'Rien à faire avec cette carte pour l\'instant.';
        if (card.kind === 'stadium' && v.stadium?.key === card.key.slice(2)) return 'Ce Stade est déjà en jeu.';
        return 'Rien à faire avec cette carte pour l\'instant.';
    }

    // the coach line under the board
    function hint() {
        if (isSetup) return setup.active == null ? 'Touche une créature de ta main : elle sera ta créature active.' : 'Ajoute jusqu\'à 3 créatures sur ton Banc, puis touche « Commencer ».';
        if (promoting) return 'Ta créature a été capturée : choisis celle de ton Banc qui la remplace.';
        if (targeting) return targeting.label;
        if (!myTurn) return `${names[1]} réfléchit…`;
        if (!acts.length) return null;
        if (!me.energyPlayed && acts.some((a) => a.t === 'energy')) return 'Attache une Énergie à une créature (1 par tour) : touche-la dans ta main.';
        if (acts.some((a) => a.t === 'attack')) return 'Touche ta créature active pour attaquer. Attaquer termine ton tour.';
        if (acts.some((a) => a.t === 'bench')) return 'Pose des créatures sur ton Banc pour préparer la suite.';
        if (v.turn === 1 && v.first === 0) return 'Le premier joueur ne peut pas attaquer à son premier tour.';
        return 'Il te manque des Énergies pour attaquer : termine ton tour.';
    }

    function endTurn() {
        if (acts.some((a) => a.t === 'attack') && !window.confirm('Tu peux encore attaquer. Terminer ton tour sans attaquer ?')) return;
        act({ t: 'end' });
    }

    const handActs = (card) => acts.filter((a) => a.uid === card.uid);
    const fieldCard = (card, where, size) => {
        if (!card) return <Slot w={size === 'active' ? 108 : 62} />;
        const hl = targetUids.has(card.uid) || promoteUids.has(card.uid);
        return (
            <motion.div layout key={card.uid} className="relative" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <motion.div animate={flashes[card.uid] && !flashes[card.uid].heal ? { x: [0, -7, 7, -4, 0] } : {}} transition={{ duration: 0.35 }} key={flashes[card.uid]?.n}>
                    <GameCard card={card} size={size} highlight={hl} onClick={() => tapField(card, where)} />
                </motion.div>
                <Flash f={flashes[card.uid]} />
            </motion.div>
        );
    };

    // in setup the chosen creatures appear on the field before the game starts
    const setupCard = (uid) => me.hand.find((c) => c.uid === uid);
    const myActive = isSetup ? (setup.active != null ? { ...setupCard(setup.active), damage: 0, energies: [] } : null) : me.active;
    const myBench = isSetup ? setup.bench.map((u) => ({ ...setupCard(u), damage: 0, energies: [] })) : me.bench;
    const hand = isSetup ? me.hand.filter((c) => c.uid !== setup.active && !setup.bench.includes(c.uid)) : me.hand;

    const sheetCard = sheet?.card;
    const damageOf = sheetCard?.kind === 'creature' && (sheet.where === 'mine' || sheet.where === 'hand') && foe.active
        ? (i) => attackDamage(v, 0, sheetCard, sheetCard.attacks[i], foe.active)
        : sheetCard?.kind === 'creature' && sheet.where === 'foe' && me.active ? (i) => attackDamage(v, 1, sheetCard, sheetCard.attacks[i], me.active) : null;
    const chain = sheetCard?.kind === 'creature' && foe.active && me.active
        ? chainMult(sheet.where === 'foe' ? sheetCard.type : sheetCard.type, sheet.where === 'foe' ? me.active.type : foe.active.type) : null;

    return (
        <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden text-white"
            style={{ background: 'linear-gradient(180deg, #4a1d1d 0%, #2a1a1d 30%, #14261d 50%, #172a3d 70%, #12325a 100%)' }}>
            {/* opponent bar */}
            <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),8px)] pb-1">
                <button onClick={() => navigate('/duel')} className="p-1.5 rounded-full bg-black/30" title="Retour"><ArrowLeft className="w-4 h-4" /></button>
                <span className="font-bold text-sm truncate">{names[1]}</span>
                <span className="flex -space-x-3 ml-1" title={`${foe.handCount} cartes en main`}>
                    {Array.from({ length: Math.min(foe.handCount, 7) }, (_, i) => <span key={i} className="w-4 h-6 rounded-sm border border-white/40 bg-gradient-to-br from-[#2f6b4a] to-[#123322]" />)}
                </span>
                <span className="text-[10px] text-white/60">{foe.handCount}</span>
                <span className="flex-1" />
                <Pile Icon={Layers} n={foe.deck} label="Cartes dans son deck" />
                <Pile Icon={Trash2} n={foe.discard.length} label="Sa défausse" />
                <Captures n={foe.captures} side={1} />
            </div>

            {/* opponent side */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-evenly">
                <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i}>{fieldCard(foe.bench[i], 'foe', 'bench')}</div>)}</div>
                {fieldCard(foe.active, 'foe', 'active')}
            </div>

            {/* middle line: stadium, turn, last event */}
            <div className="relative h-9 flex items-center justify-center px-3">
                <span className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                {v.stadium && (
                    <button onClick={() => setSheet({ card: { ...v.stadium, kind: 'stadium', key: `t:${v.stadium.key}` }, where: 'stadium' })}
                        className="absolute left-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#8ee6a8]/20 text-[#bff5cf] border border-[#8ee6a8]/40">
                        Stade : {v.stadium.name}
                    </button>
                )}
                <AnimatePresence mode="wait">
                    <motion.span key={toast?.n ?? 'turn'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className={`relative px-3 py-1 rounded-full text-xs font-bold max-w-[62%] text-center leading-tight ${toast ? (toast.side === 1 ? 'bg-[#7a2a2a]' : 'bg-[#1f4f86]') : 'bg-black/40'}`}>
                        {toast ? toast.text : isSetup ? 'Mise en place' : v.phase === 'over' ? 'Partie terminée' : v.current === 0 ? `Ton tour · ${Math.ceil(v.turn / 2)}` : `Tour de ${names[1]}`}
                    </motion.span>
                </AnimatePresence>
                {duel.status === 'active' && !isSetup && (
                    <button onClick={forfeit} className="absolute right-2 p-1 rounded-full bg-black/30 text-white/60" title="Abandonner"><Flag className="w-3.5 h-3.5" /></button>
                )}
            </div>

            {/* my side */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-evenly">
                {fieldCard(myActive, 'mine', 'active')}
                <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i}>{fieldCard(myBench[i], 'mine', 'bench')}</div>)}</div>
            </div>

            {hint() && (
                <p className="mx-3 mb-1 px-3 py-1.5 rounded-xl bg-black/30 text-xs leading-snug text-white/85 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 shrink-0 text-[#f4d88f]" />{hint()}
                </p>
            )}
            {/* my bar */}
            <div className="flex items-center gap-2 px-3 py-1">
                <Captures n={me.captures} side={0} />
                <Pile Icon={Layers} n={me.deck} label="Cartes dans ton deck" />
                <Pile Icon={Trash2} n={me.discard.length} label="Ta défausse" onClick={() => setSheet({ discard: true })} />
                <span className="flex-1" />
                {targeting && <button onClick={() => setTargeting(null)} className="px-3 py-2 rounded-full bg-white/10 text-xs font-bold">Annuler</button>}
                {isSetup && (
                    <button disabled={setup.active == null || busy} onClick={() => act({ t: 'setup', active: setup.active, bench: setup.bench })}
                        className="px-4 py-2 rounded-full nd-cta-gold font-bold text-sm disabled:opacity-40">Commencer</button>
                )}
                {!isSetup && !targeting && acts.some((a) => a.t === 'end') && (
                    <button onClick={endTurn} className="px-4 py-2 rounded-full bg-[#1f6fd1] font-bold text-sm shadow-lg">Fin du tour</button>
                )}
            </div>

            {/* hand */}
            <div className="px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 bg-black/25">
                <div className="overflow-x-auto no-scrollbar py-1.5">
                    <div className="flex w-max mx-auto px-1" style={{ gap: hand.length > 6 ? 0 : 6 }}>
                        <AnimatePresence initial={false}>
                            {hand.map((c, i) => {
                                const playable = isSetup ? c.kind === 'creature' : handActs(c).length > 0;
                                return (
                                    <motion.div key={c.uid} layout initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
                                        style={{ marginLeft: hand.length > 6 && i ? -Math.min(30, (hand.length - 6) * 6) : 0, zIndex: i }}>
                                        <GameCard card={c} size="hand" dim={!playable && (myTurn || isSetup)} highlight={false} onClick={() => tapHand(c)}
                                            className={playable && live ? 'ring-1 ring-[#8ee6a8]/70' : ''} />
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {!hand.length && <span className="h-[102px] grid place-items-center text-xs text-white/40">Main vide</span>}
                    </div>
                </div>
            </div>

            {error && <button onClick={() => setError('')} className="absolute top-14 inset-x-4 z-[80] p-2.5 rounded-xl bg-rust text-sm font-bold">{error}</button>}
            {replaying && <button onClick={() => { skip.current = true; }} className="absolute top-14 right-3 z-[75] px-3 py-1 rounded-full bg-black/50 text-xs font-bold">Passer ⏩</button>}

            <AnimatePresence>
                {sheet?.discard && (
                    <Sheet onClose={() => setSheet(null)}>
                        <p className="font-display text-xl font-semibold mb-3">Ta défausse ({me.discard.length})</p>
                        <div className="flex flex-wrap gap-2">{me.discard.map((c, i) => <GameCard key={i} card={c} size="hand" />)}</div>
                        {!me.discard.length && <p className="text-sm text-white/60">Vide pour l'instant.</p>}
                    </Sheet>
                )}
                {sheetCard && (
                    <Sheet onClose={() => setSheet(null)}>
                        <div className="flex gap-4 items-start">
                            <GameCard card={sheetCard} size="active" />
                            <div className="min-w-0 flex-1 pt-1">
                                <p className="font-display text-xl font-semibold leading-tight pr-6">{sheetCard.name}</p>
                                {sheetCard.kind === 'creature' && <p className="text-sm text-white/70 mt-0.5">{sheetCard.hp - (sheetCard.damage || 0)} / {sheetCard.hp} PV</p>}
                                {chain === 'prey' && <p className="mt-1 text-xs font-bold text-[#ff8a65]">{sheet.where === 'foe' ? 'C\'est un prédateur de ta créature : dégâts ×2 !' : 'Prédateur de la créature adverse : dégâts ×2 !'}</p>}
                                {chain === 'predator' && <p className="mt-1 text-xs font-bold text-[#a5c8ff]">{sheet.where === 'foe' ? 'C\'est une proie de ta créature : elle résiste (−20).' : 'Proie de la créature adverse : −20 dégâts.'}</p>}
                                {sheetCard.poisoned && <p className="mt-1 text-xs font-bold text-[#d6b3ff]">Empoisonnée : −10 PV à chaque fin de tour.</p>}
                            </div>
                        </div>
                        <div className="mt-3"><CardText card={sheetCard} damageOf={damageOf} /></div>
                        <SheetActions />
                    </Sheet>
                )}
            </AnimatePresence>

            <AnimatePresence>{over && duel.status !== 'active' && <Outcome duel={duel} onClose={() => setOver(false)} onAgain={() => navigate('/duel')} />}</AnimatePresence>
        </div>
    );

    // buttons under the card in the detail sheet: what can be done with it right now
    function SheetActions() {
        const card = sheetCard;
        if (sheet.where === 'hand' && !isSetup) {
            const list = handActs(card);
            if (!list.length) return <p className="mt-4 text-sm text-white/60 text-center">{blockedReason(card)}</p>;
            const label = card.kind === 'creature' ? 'Poser sur le Banc' : card.kind === 'energy' ? 'Attacher à une créature' : card.kind === 'tool' ? 'Équiper une créature' : 'Jouer cette carte';
            const go = () => {
                if (list.length === 1 && list[0].target == null) return act(list[0]);
                if (list.length === 1 && card.kind !== 'energy' && card.kind !== 'tool') return act(list[0]);
                setSheet(null);
                setTargeting({ label: card.kind === 'energy' ? `Touche la créature qui reçoit ${card.name}.` : `Touche la cible de ${card.name}.`, actions: list });
            };
            return <button onClick={go} className="mt-4 w-full py-3 rounded-2xl nd-cta-gold font-bold">{label}</button>;
        }
        if (sheet.where === 'mine' && card.uid === me.active?.uid && !isSetup) {
            const retreats = acts.filter((a) => a.t === 'retreat');
            return (
                <div className="mt-4 space-y-2">
                    {card.attacks.map((a, i) => {
                        const ok = acts.some((x) => x.t === 'attack' && x.i === i);
                        const dmg = damageOf ? damageOf(i) : a.damage;
                        const ko = foe.active && dmg >= foe.active.hp - foe.active.damage;
                        return (
                            <button key={i} disabled={!ok} onClick={() => act({ t: 'attack', i })}
                                className={`w-full p-3 rounded-2xl text-left flex items-center gap-3 font-bold transition disabled:opacity-40 ${ok ? 'bg-[#c2410c] hover:bg-[#d4511a]' : 'bg-white/10'}`}>
                                <CostRow cost={a.cost} size={18} />
                                <span className="flex-1">{a.name}{ko && ok && <span className="ml-2 px-1.5 rounded bg-[#f4d88f] text-[#2a1c00] text-[10px]">CAPTURE</span>}</span>
                                <span className="font-display text-xl">{dmg}</span>
                            </button>
                        );
                    })}
                    {!acts.some((x) => x.t === 'attack') && myTurn && <p className="text-xs text-white/60 text-center">{v.turn === 1 ? 'Pas d\'attaque au tout premier tour de la partie.' : 'Attache des Énergies du bon biome pour payer le coût d\'une attaque.'}</p>}
                    {retreats.length > 0 && (
                        <button onClick={() => { setSheet(null); setTargeting({ label: 'Touche la créature du Banc qui prend sa place.', actions: retreats }); }}
                            className="w-full py-2.5 rounded-2xl bg-white/10 font-bold text-sm flex items-center justify-center gap-2">
                            Battre en retraite {card.retreat > 0 && card.tool !== 'bottes' ? <CostRow cost={Array(card.retreat).fill('any')} size={14} /> : '(gratuit)'}
                        </button>
                    )}
                </div>
            );
        }
        return null;
    }
}

function Outcome({ duel, onClose, onAgain }) {
    const won = duel.status === 'won';
    return (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl p-6 text-center bg-[#13261d] border border-white/10">
                <p className="font-display text-4xl font-semibold" style={{ color: won ? '#f4d88f' : '#ffb4a2' }}>{won ? 'Victoire !' : 'Défaite'}</p>
                <p className="text-sm text-white/70 mt-1">{duel.view.reason}</p>
                {duel.reward ? (
                    <div className="mt-4 space-y-3">
                        <Amount seeds={duel.reward.coins} sign />
                        <div className="flex justify-center gap-2 flex-wrap">
                            {duel.reward.cards.map((c, i) => (
                                <motion.div key={i} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.25 }}>
                                    <GameCard card={c} size="hand" />
                                </motion.div>
                            ))}
                        </div>
                        <p className="text-xs text-white/60">Nouvelles cartes ajoutées à ta collection de jeu.</p>
                    </div>
                ) : won ? <p className="text-xs text-white/60 mt-3">Tu as déjà gagné toutes les récompenses de duel aujourd'hui.</p> : null}
                <div className="mt-5 flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-full bg-white/10 font-bold text-sm">Voir le plateau</button>
                    <button onClick={onAgain} className="flex-1 py-2.5 rounded-full nd-cta-gold font-bold text-sm">Continuer</button>
                </div>
            </motion.div>
        </motion.div>
    );
}

export { biomeColor };
