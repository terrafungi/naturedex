import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Info, Minus, Plus, RotateCcw, Search, Wand2, X } from 'lucide-react';
import { api } from '../api.jsx';
import { RARITIES } from '../game.jsx';
import { CardText, EnergyDot, GameCard, biomeColor, biomeName } from '../components/TcgCard.jsx';
import { BIOMES, UNIVERSAL, creatureCard, deckProblems, power } from '../tcg.js';
import { sfx } from '../sfx.js';

const TABS = [['creature', 'Créatures'], ['energy', 'Énergies'], ['trainer', 'Naturalistes']];
const PAGE = 48;
// what a full deck of 40 roughly looks like
const TARGET = { creature: 16, energy: 16, trainer: 8 };
const group = (c) => (c.kind === 'creature' || c.kind === 'energy' ? c.kind : 'trainer');
const rarityRank = (c) => RARITIES[c.rarity]?.order ?? 0;

export default function DeckBuilder() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [keys, setKeys] = useState([]);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [view, setView] = useState('collection'); // collection | deck
    const [tab, setTab] = useState('creature');
    const [biome, setBiome] = useState('');
    const [q, setQ] = useState('');
    const [shown, setShown] = useState(PAGE);
    const [detail, setDetail] = useState(null);

    const load = () => api('duelCollection').then((d) => { setData(d); setKeys(d.deck); setDirty(false); }).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    // every card the player owns, as game cards, with how many copies may go in the deck
    const { cards, byKey, owned } = useMemo(() => {
        if (!data) return { cards: [], byKey: {}, owned: {} };
        const creatures = data.species.map((s) => { const c = creatureCard(s); return { ...c, owned: s.count, power: power(c) }; })
            .sort((a, b) => b.power - a.power); // strongest first, once: big collections have thousands
        const items = data.items.map((c) => ({ ...c, owned: c.count }));
        const all = [...creatures, ...items];
        return {
            cards: all,
            byKey: Object.fromEntries(all.map((c) => [c.key, c])),
            owned: Object.fromEntries(all.map((c) => [c.key, c.owned])),
        };
    }, [data]);

    const inDeck = useMemo(() => {
        const n = {};
        for (const k of keys) n[k] = (n[k] || 0) + 1;
        return n;
    }, [keys]);
    const deckCards = keys.map((k) => byKey[k]).filter(Boolean);
    const problems = data ? deckProblems(keys, owned) : [];
    const limitOf = (c) => (c.kind === 'energy' ? c.owned : Math.min(c.owned, data.rules.copies));

    function why(c) {
        if (keys.length >= data.rules.max) return `Ton deck est plein (${data.rules.max} cartes).`;
        if ((inDeck[c.key] || 0) >= c.owned) return c.owned > 1 ? `Tu possèdes ${c.owned} exemplaires de cette carte.` : 'Tu ne possèdes qu\'un exemplaire de cette carte.';
        return `${data.rules.copies} exemplaires au maximum d'une même carte.`;
    }

    function add(c) {
        if (keys.length >= data.rules.max || (inDeck[c.key] || 0) >= limitOf(c)) { setNote(why(c)); sfx.error?.(); return; }
        sfx.tap?.();
        setKeys((k) => [...k, c.key]);
        setDirty(true);
        setNote('');
    }
    function remove(c) {
        sfx.swish?.(0);
        setKeys((k) => { const i = k.lastIndexOf(c.key); return i < 0 ? k : [...k.slice(0, i), ...k.slice(i + 1)]; });
        setDirty(true);
        setNote('');
    }

    // Fills up to 40: creatures of the deck's biomes, the Énergies they need, the best Naturalistes.
    function autoFill() {
        const next = [...keys];
        const count = (k) => next.filter((x) => x === k).length;
        const groups = () => next.reduce((m, k) => { const c = byKey[k]; if (c) m[group(c)] += 1; return m; }, { creature: 0, energy: 0, trainer: 0 });
        const biomesOf = () => {
            const m = {};
            for (const k of next) if (byKey[k]?.kind === 'creature') m[byKey[k].biome] = (m[byKey[k].biome] || 0) + 1;
            return m;
        };
        const limit = (c) => (c.kind === 'energy' ? c.owned : Math.min(c.owned, data.rules.copies));
        const free = (c) => count(c.key) < limit(c);
        // Énergies owned per biome: creatures are picked among the biomes the player can power
        const fuel = {};
        for (const c of cards) if (c.kind === 'energy') fuel[c.biome] = (fuel[c.biome] || 0) + c.owned;
        const powered = (b) => fuel[UNIVERSAL] || fuel[b];
        const creatures = cards.filter((c) => c.kind === 'creature'); // already strongest first
        for (let guard = 0; next.length < data.rules.max && guard < 200; guard++) {
            const g = groups();
            const order = Object.keys(TARGET).sort((a, b) => g[a] / TARGET[a] - g[b] / TARGET[b]);
            let pick = null;
            for (const want of order) {
                if (want === 'creature') {
                    // the two biomes with the most Énergies owned
                    const main = Object.entries(fuel).filter(([b]) => b !== UNIVERSAL).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([b]) => b);
                    const pool = creatures.filter(free);
                    pick = pool.find((c) => main.includes(c.biome)) || pool.find((c) => powered(c.biome))
                        || (g.creature < data.rules.minCreatures || !Object.keys(fuel).length ? pool[0] : null);
                } else if (want === 'energy') {
                    const need = biomesOf();
                    const have = (b) => count(`e:${b}`);
                    const pool = cards.filter((c) => c.kind === 'energy' && free(c));
                    pick = pool.filter((c) => need[c.biome]).sort((a, b) => (have(a.biome) / need[a.biome]) - (have(b.biome) / need[b.biome]))[0]
                        || pool.find((c) => c.biome === UNIVERSAL);
                } else {
                    pick = cards.filter((c) => group(c) === 'trainer' && free(c)).sort((a, b) => rarityRank(b) - rarityRank(a) || count(a.key) - count(b.key))[0];
                }
                if (pick) break;
            }
            if (!pick) break;
            next.push(pick.key);
        }
        if (next.length === keys.length) { setNote('Plus aucune carte à ajouter : gagne des duels et ouvre des boosters pour en obtenir.'); return; }
        sfx.special?.();
        setKeys(next);
        setDirty(true);
        setNote(next.length < data.rules.max ? `Complété avec tout ce que tu possèdes (${next.length} cartes).` : '');
    }

    async function save() {
        setBusy(true); setError('');
        try {
            await api('duelSaveDeck', { keys });
            sfx.win?.();
            setDirty(false);
            setNote('Deck enregistré ! Il sera utilisé pour tes prochains duels.');
        } catch (e) { setNote(e.message); sfx.error?.(); } finally { setBusy(false); }
    }

    async function reset() {
        if (!window.confirm('Revenir au deck automatique, composé à partir de ta collection ?')) return;
        setBusy(true);
        try { await api('duelSaveDeck', { reset: true }); await load(); setNote('Deck automatique rétabli.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    const byTab = useMemo(() => {
        const m = { creature: [], energy: [], trainer: [] };
        for (const c of cards) m[group(c)].push(c);
        m.trainer.sort((a, b) => rarityRank(b) - rarityRank(a));
        return m;
    }, [cards]);
    const list = useMemo(() => {
        const s = q.toLowerCase();
        return byTab[tab].filter((c) => (!biome || c.biome === biome) && (!s || c.name.toLowerCase().includes(s)));
    }, [byTab, tab, biome, q]);

    if (!data) return <div className="max-w-xl mx-auto px-4 py-16 text-ink-soft">{error || 'Chargement de ta collection…'}</div>;

    const g = deckCards.reduce((m, c) => { m[group(c)] += 1; return m; }, { creature: 0, energy: 0, trainer: 0 });
    const energies = deckCards.filter((c) => c.kind === 'energy').reduce((m, c) => ({ ...m, [c.biome]: (m[c.biome] || 0) + 1 }), {});
    const needs = deckCards.filter((c) => c.kind === 'creature').reduce((m, c) => ({ ...m, [c.biome]: (m[c.biome] || 0) + 1 }), {});
    const missingEnergy = Object.keys(needs).filter((b) => !energies[b] && !energies[UNIVERSAL]);
    const pct = Math.min(1, keys.length / data.rules.max);

    // the deck, grouped and with the copies counted
    const rows = Object.entries(inDeck).map(([k, n]) => ({ card: byKey[k], n })).filter((r) => r.card)
        .sort((a, b) => TABS.findIndex(([t]) => t === group(a.card)) - TABS.findIndex(([t]) => t === group(b.card)) || a.card.name.localeCompare(b.card.name));

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 pb-40 space-y-4">
            <div className="flex items-center gap-3">
                <button onClick={() => (dirty && !window.confirm('Quitter sans enregistrer ?') ? null : navigate('/duel'))} className="p-2 rounded-full nd-glass" title="Retour"><ArrowLeft className="w-4 h-4" /></button>
                <div className="flex-1 min-w-0">
                    <h1 className="font-display text-3xl font-semibold">Mon deck</h1>
                    <p className="text-sm text-ink-soft">{data.custom ? 'Ton deck personnalisé.' : 'Deck automatique : modifie-le et enregistre-le pour en faire le tien.'}</p>
                </div>
            </div>

            {/* summary */}
            <div className="p-4 rounded-2xl nd-glass space-y-3">
                <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold tabular-nums">{keys.length}</span>
                    <span className="text-ink-soft">/ {data.rules.max} cartes</span>
                    <span className="flex-1" />
                    <span className="text-xs text-ink-soft">minimum {data.rules.min}</span>
                </div>
                <span className="block h-2 rounded-full bg-black/40 overflow-hidden">
                    <span className="block h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: keys.length >= data.rules.min ? '#4fd18b' : '#f4c84f' }} />
                </span>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span><b>{g.creature}</b> créatures</span>
                    <span><b>{g.energy}</b> Énergies</span>
                    <span><b>{g.trainer}</b> Naturalistes</span>
                </p>
                {Object.keys(energies).length > 0 && (
                    <p className="flex flex-wrap gap-2 text-xs">
                        {Object.entries(energies).map(([b, n]) => <span key={b} className="flex items-center gap-1 font-bold" style={{ color: biomeColor(b) }}><EnergyDot biome={b} size={14} />{n}</span>)}
                    </p>
                )}
                {missingEnergy.length > 0 && <p className="text-xs text-[#ffd27a]">Aucune Énergie pour tes créatures {missingEnergy.map(biomeName).join(', ')} : elles ne pourront pas attaquer.</p>}
                {problems.map((p) => <p key={p} className="text-xs text-[#ffb4a2]">• {p}</p>)}
                <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={autoFill} disabled={busy || keys.length >= data.rules.max} className="px-3 py-2 rounded-full bg-white/10 text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"><Wand2 className="w-4 h-4" />Compléter</button>
                    <button onClick={() => { setKeys([]); setDirty(true); }} disabled={busy || !keys.length} className="px-3 py-2 rounded-full bg-white/10 text-sm font-bold disabled:opacity-40">Vider</button>
                    {data.custom && <button onClick={reset} disabled={busy} className="px-3 py-2 rounded-full bg-white/10 text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"><RotateCcw className="w-4 h-4" />Deck automatique</button>}
                </div>
            </div>

            {error && <p className="p-3 rounded-xl bg-rust/20 text-sm font-bold">{error}</p>}

            <div className="flex p-1 rounded-full bg-black/30 w-max">
                {[['collection', 'Ma collection'], ['deck', `Mon deck (${keys.length})`]].map(([k, l]) => (
                    <button key={k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-full text-sm font-bold ${view === k ? 'bg-white/15 text-white' : 'text-ink-soft'}`}>{l}</button>
                ))}
            </div>

            {view === 'collection' ? (
                <section className="space-y-3">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {TABS.map(([k, l]) => (
                            <button key={k} onClick={() => { setTab(k); setBiome(''); setShown(PAGE); }}
                                className={`px-3 py-1.5 rounded-full text-sm font-bold shrink-0 ${tab === k ? 'nd-cta-gold' : 'bg-white/[0.06]'}`}>
                                {l} <span className="opacity-60">({byTab[k].length})</span>
                            </button>
                        ))}
                    </div>
                    {tab === 'creature' && (
                        <>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06]">
                                <Search className="w-4 h-4 text-ink-soft" />
                                <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Chercher une espèce" className="flex-1 bg-transparent outline-none text-sm" />
                                {q && <button onClick={() => setQ('')}><X className="w-4 h-4" /></button>}
                            </label>
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                                <button onClick={() => setBiome('')} className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${!biome ? 'bg-white/20' : 'bg-white/[0.06]'}`}>Tous</button>
                                {Object.keys(BIOMES).map((b) => (
                                    <button key={b} onClick={() => { setBiome(biome === b ? '' : b); setShown(PAGE); }}
                                        className="px-2.5 py-1 rounded-full text-xs font-bold shrink-0 flex items-center gap-1"
                                        style={{ background: biome === b ? biomeColor(b) : 'rgb(255 255 255 / 0.06)' }}>
                                        <EnergyDot biome={b} size={13} />{biomeName(b)}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {tab === 'creature' && <p className="text-xs text-ink-soft">Touche une carte pour l'ajouter · les plus fortes d'abord · {data.rules.copies} exemplaires max (si tu les possèdes).</p>}
                    {tab === 'energy' && <p className="text-xs text-ink-soft">Pas de limite d'exemplaires pour les Énergies, à part celles que tu possèdes. Ouvre des boosters et gagne des duels pour en obtenir.</p>}
                    {tab === 'trainer' && <p className="text-xs text-ink-soft">Objets, Supporters, Stades et Outils · {data.rules.copies} exemplaires max de chaque.</p>}

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-x-2 gap-y-3">
                        {list.slice(0, shown).map((c) => {
                            const n = inDeck[c.key] || 0;
                            const full = n >= limitOf(c);
                            return (
                                <div key={c.key} className="relative justify-self-center">
                                    <GameCard card={c} size="hand" dim={full} selected={n > 0 && !full} onClick={() => add(c)} />
                                    <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 rounded-full text-[10px] font-black tabular-nums ${n ? 'bg-[#f4d88f] text-[#2a1c00]' : 'bg-black/70 text-white/70'}`}>
                                        {n}/{limitOf(c)}
                                    </span>
                                    {n > 0 && (
                                        <button onClick={() => remove(c)} className="absolute -top-1.5 -right-1.5 w-6 h-6 grid place-items-center rounded-full bg-rust text-white shadow" title="Retirer un exemplaire">
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => setDetail(c)} className="absolute -top-1.5 -left-1.5 w-6 h-6 grid place-items-center rounded-full bg-black/70 text-white/80" title="Détails">
                                        <Info className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {!list.length && (
                        <p className="p-4 rounded-xl bg-white/[0.04] text-sm text-ink-soft text-center">
                            {tab === 'creature' ? 'Aucune espèce ici.' : <>Tu n'en as pas encore. Ouvre des <Link to="/booster" className="underline">boosters</Link> ou gagne des duels !</>}
                        </p>
                    )}
                    {list.length > shown && <button onClick={() => setShown(shown + PAGE * 2)} className="w-full py-2.5 rounded-xl bg-white/[0.06] text-sm font-bold">Voir plus ({list.length - shown})</button>}
                </section>
            ) : (
                <section className="space-y-1.5">
                    {!rows.length && <p className="p-4 rounded-xl bg-white/[0.04] text-sm text-ink-soft text-center">Ton deck est vide : ajoute des cartes depuis ta collection.</p>}
                    {rows.map(({ card: c, n }, i) => (
                        <div key={c.key}>
                            {(i === 0 || group(rows[i - 1].card) !== group(c)) && <p className="pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-ink-soft">{TABS.find(([t]) => t === group(c))[1]} · {g[group(c)]}</p>}
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.05]">
                                <button onClick={() => setDetail(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                    {c.kind === 'creature' ? <img src={c.thumb_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                        : c.kind === 'energy' ? <EnergyDot biome={c.biome} size={40} />
                                            : c.img ? <img src={c.img} alt="" className="w-10 h-10 rounded-lg object-cover object-top" /> : <span className="w-10 h-10 rounded-lg bg-white/10" />}
                                    <span className="min-w-0">
                                        <span className="block font-bold text-sm truncate">{c.name}</span>
                                        <span className="block text-xs text-ink-soft">{c.kind === 'creature' ? <>{c.hp} PV · {biomeName(c.biome)}</> : c.text}</span>
                                    </span>
                                </button>
                                <span className="font-display text-lg tabular-nums w-8 text-center">×{n}</span>
                                <button onClick={() => remove(c)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10" title="Retirer"><Minus className="w-4 h-4" /></button>
                                <button onClick={() => add(c)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10" title="Ajouter"><Plus className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {/* save bar */}
            <div className="fixed inset-x-0 bottom-[84px] sm:bottom-6 z-40 px-4 pointer-events-none">
                <div className="max-w-md mx-auto space-y-2 pointer-events-auto">
                    <AnimatePresence>
                        {note && (
                            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setNote('')}
                                className="p-2.5 rounded-xl bg-[#13261d] border border-white/10 text-sm text-center shadow-lg">{note}</motion.p>
                        )}
                    </AnimatePresence>
                    {dirty && (
                        <button onClick={save} disabled={busy || problems.length > 0}
                            className="w-full py-3 rounded-full nd-cta-gold font-bold shadow-lg disabled:opacity-50">
                            {problems.length ? `Deck incomplet (${keys.length}/${data.rules.max})` : `Enregistrer mon deck (${keys.length} cartes)`}
                        </button>
                    )}
                    {dirty && problems.length > 0 && (
                        <p className="px-3 py-1.5 rounded-xl bg-black/75 text-xs text-center text-[#ffd27a] font-bold">{problems[0]}</p>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {detail && (
                    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetail(null)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-3xl p-5 bg-[#13261d] text-white border border-white/10">
                            <div className="flex gap-4 items-start">
                                <GameCard card={detail} size="active" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-display text-xl font-semibold mb-1">{detail.name}</p>
                                    <p className="text-xs text-white/60 mb-2">Tu en possèdes {detail.owned} · {inDeck[detail.key] || 0} dans ton deck</p>
                                    <CardText card={detail} />
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button onClick={() => remove(detail)} disabled={!inDeck[detail.key]} className="flex-1 py-2.5 rounded-full bg-white/10 font-bold text-sm disabled:opacity-40">Retirer</button>
                                <button onClick={() => add(detail)} className="flex-1 py-2.5 rounded-full nd-cta-gold font-bold text-sm">Ajouter</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
