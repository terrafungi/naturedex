import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, CheckCheck, ChevronDown, Clock, Copy, Gift, MessageCircle, Minus, Plus, Search, Send, Sparkles, Trash2, UserPlus, Users, X } from 'lucide-react';
import InviteBanner from '../components/InviteBanner.jsx';
import SeasonBadge from '../components/SeasonBadge.jsx';
import { api, useGame } from '../api.jsx';
import PlayerAvatar from '../components/PlayerAvatar.jsx';
import { Card } from '../components/Card.jsx';
import { RARITIES, SORTS, TYPES } from '../game.jsx';
import { Nugget, NUGGET_COLOR, Plant, PLANT_COLOR, Seed, SEED_COLOR } from '../components/Currency.jsx';

const TABS = [
    ['friends', 'Mes amis'],
    ['requests', 'Demandes'],
    ['trades', 'Échanges'],
];

function Badge({ n }) {
    if (!n) return null;
    return <span className="ml-1.5 min-w-5 h-5 px-1.5 inline-grid place-items-center rounded-full bg-[#ff6b6b] text-white text-[11px] font-bold">{n}</span>;
}

// Small card used in trade summaries.
function MiniCard({ item, warn }) {
    const r = RARITIES[item.card.rarity] || RARITIES.common;
    return (
        <Link to={`/carte/${item.card.id}`} className="relative block w-[4.5rem] shrink-0 group" title={item.card.name}>
            <div className="aspect-[3/4] rounded-xl overflow-hidden ring-2 bg-black/30" style={{ '--tw-ring-color': r.color }}>
                {item.card.thumb_url && <img src={item.card.thumb_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
            </div>
            {item.qty > 1 && <span className="absolute -top-1.5 -right-1.5 px-1.5 rounded-full bg-[#e9c46a] text-[#05130d] text-[11px] font-black">×{item.qty}</span>}
            {warn && <span className="absolute inset-x-0 top-1/3 mx-1 rounded bg-black/80 text-[9px] font-bold text-[#ffb4a2] text-center leading-tight py-0.5">Plus dispo</span>}
            <div className="mt-1 text-[11px] leading-tight text-white/80 line-clamp-2 group-hover:text-white">{item.card.name}</div>
            <div className="text-[10px] font-bold" style={{ color: r.color }}>{r.symbol} {r.label}</div>
        </Link>
    );
}

function AddFriend({ onDone }) {
    const [query, setQuery] = useState('');
    const [players, setPlayers] = useState([]);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) { setPlayers([]); return; }
        const t = setTimeout(() => api('searchPlayers', { query: q }).then((r) => setPlayers(r.players)).catch(() => {}), 250);
        return () => clearTimeout(t);
    }, [query]);

    async function add(username) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await api('friendRequest', { username });
            setMessage(['ok', res.status === 'accepted' ? `Toi et ${res.username} êtes maintenant amis !` : `Demande envoyée à ${res.username}.`]);
            setQuery('');
            setPlayers([]);
            onDone();
        } catch (err) {
            setMessage(['error', err.message]);
        } finally {
            setBusy(false);
        }
    }

    const exact = players.find((p) => p.username.toLowerCase() === query.trim().toLowerCase());
    return (
        <div className="rounded-3xl nd-glass p-4 sm:p-5">
            <h2 className="font-display text-xl text-white flex items-center gap-2"><UserPlus className="w-5 h-5 text-[#8ee6a8]" />Ajouter un ami</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) add(exact?.username || query.trim()); }} className="mt-3 flex gap-2">
                <label className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full bg-black/30 ring-1 ring-white/15 focus-within:ring-[#4fd18b]/60">
                    <Search className="w-4 h-4 text-white/50 shrink-0" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Entre un pseudo…" autoComplete="off"
                        className="w-full min-w-0 bg-transparent py-2.5 text-white outline-none placeholder:text-white/40" />
                </label>
                <button disabled={busy || !query.trim()} className="nd-btn px-4 sm:px-5 rounded-full font-bold disabled:opacity-50 flex items-center gap-1.5"><Send className="w-4 h-4" /><span className="hidden sm:inline">Envoyer</span></button>
            </form>
            {players.length > 0 && (
                <ul className="mt-2 divide-y divide-white/5 rounded-2xl bg-black/20 ring-1 ring-white/10 overflow-hidden">
                    {players.map((p) => (
                        <li key={p.username} className="flex items-center gap-3 px-3 py-2">
                            <PlayerAvatar name={p.username} size={32} />
                            <span className="flex-1 min-w-0 truncate font-semibold text-white">{p.username}</span>
                            {p.status === 'accepted' ? <span className="text-xs font-bold text-[#8ee6a8] flex items-center gap-1"><Check className="w-4 h-4" />Ami</span>
                                : p.status === 'pending' && p.outgoing ? <span className="text-xs font-semibold text-white/50">Demande envoyée</span>
                                : <button disabled={busy} onClick={() => add(p.username)} className="px-3 py-1.5 rounded-full text-xs font-bold bg-[#4fd18b] text-[#05130d] disabled:opacity-50">{p.status === 'pending' ? 'Accepter' : 'Ajouter'}</button>}
                        </li>
                    ))}
                </ul>
            )}
            {query.trim().length >= 2 && players.length === 0 && <p className="mt-2 text-sm text-white/50">Aucun joueur ne commence par « {query.trim()} ».</p>}
            {message && <p className={`mt-2 text-sm font-semibold ${message[0] === 'error' ? 'text-[#ffb4a2]' : 'text-[#a8f0c6]'}`}>{message[1]}</p>}
        </div>
    );
}

const MAX_ITEMS = 30; // MAX_TRADE_ITEMS in the API

function Filter({ value, onChange, label, children }) {
    return (
        <label className="relative flex-1 min-w-[8.5rem]">
            <span className="sr-only">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className={`w-full appearance-none pl-3.5 pr-8 py-1.5 rounded-full bg-white/5 ring-1 text-xs font-semibold outline-none cursor-pointer [&>option]:bg-[#0b1f16] [&>option]:text-white ${value ? 'ring-[#4fd18b]/60 text-white' : 'ring-white/10 text-white/70'}`}>
                {children}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/50" />
        </label>
    );
}

// Grid of cards to pick from, for one side of the trade.
function Picker({ username, selected, onToggle, onQty, onBulk, total }) {
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [sort, setSort] = useState('');
    const [type, setType] = useState('');
    const [rarity, setRarity] = useState('');
    const [page, setPage] = useState(null);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);
    const params = useMemo(() => ({ username, query: debounced, missing: true, sort: sort || undefined, type: type || null, rarity: rarity || null }), [username, debounced, sort, type, rarity]);
    useEffect(() => {
        let alive = true;
        setPage(null);
        api('tradeCards', params).then((r) => alive && setPage(r)).catch(() => alive && setPage({ cards: [], matches: 0 }));
        return () => { alive = false; };
    }, [params]);

    async function more() {
        const r = await api('tradeCards', { ...params, offset: page.cards.length });
        setPage({ matches: r.matches, cards: [...page.cards, ...r.cards] });
    }
    // bulk picks: every card shown, or my doubles (keeping one of each)
    const pickShown = () => onBulk(page.cards.map((c) => ({ card: c, qty: selected.get(c.id)?.qty || 1 })));
    async function pickDoubles() {
        const r = await api('tradeCards', { sort: 'count' });
        onBulk(r.cards.filter((c) => c.count > 1).map((c) => ({ card: c, qty: c.count - 1 })));
    }

    return (
        <div>
            <label className="flex items-center gap-2 px-3.5 rounded-full bg-white/5 ring-1 ring-white/10 focus-within:ring-[#4fd18b]/50">
                <Search className="w-4 h-4 text-white/50" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, ou mot de la description…" className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40" />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <Filter label="Trier" value={sort} onChange={setSort}>
                    <option value="">{username ? 'Trier : celles qui me manquent' : 'Trier : rareté'}</option>
                    {SORTS.filter(([key]) => key).map(([key, label]) => <option key={key} value={key}>Trier : {label}</option>)}
                </Filter>
                <Filter label="Type" value={type} onChange={setType}>
                    <option value="">Tous les types</option>
                    {Object.entries(TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
                </Filter>
                <Filter label="Rareté" value={rarity} onChange={setRarity}>
                    <option value="">Toutes les raretés</option>
                    {Object.entries(RARITIES).map(([key, r]) => <option key={key} value={key}>{r.symbol} {r.label}</option>)}
                </Filter>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <span className={`mr-auto ${selected.size >= MAX_ITEMS ? 'text-[#ffb4a2]' : 'text-white/55'}`}>{selected.size}/{MAX_ITEMS} cartes choisies</span>
                {page?.cards.length > 0 && <button type="button" onClick={pickShown} className="px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/85 hover:bg-white/5 flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" />Tout sélectionner</button>}
                {!username && <button type="button" onClick={pickDoubles} className="px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/85 hover:bg-white/5 flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Mes doubles</button>}
                {selected.size > 0 && <button type="button" onClick={() => onBulk(null)} className="px-3 py-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/5">Tout retirer</button>}
            </div>
            {!page ? <div className="py-12 text-center text-ink-soft">Chargement…</div> : page.cards.length === 0 ? (
                <p className="py-12 text-center text-ink-soft">{debounced || type || rarity ? 'Aucune carte trouvée.' : 'Aucune carte dans cette collection.'}</p>
            ) : (
                <>
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {page.cards.map((c) => {
                            const qty = selected.get(c.id)?.qty || 0;
                            return (
                                <div key={c.id} className="relative">
                                    <button type="button" onClick={() => onToggle(c)} className={`block w-full text-left rounded-2xl transition ${qty ? 'ring-[3px] ring-[#e9c46a] scale-[0.97]' : 'hover:-translate-y-0.5'}`}>
                                        <Card card={c} number={c.num} total={total} />
                                    </button>
                                    {username && !c.have && <span className="absolute -top-2 left-2 z-10 whitespace-nowrap px-1.5 py-0.5 rounded-full bg-[#4fd18b] shadow text-[#05130d] text-[9px] font-bold flex items-center gap-0.5 pointer-events-none"><Sparkles className="w-2.5 h-2.5" />Nouvelle</span>}
                                    {c.count > 1 && !qty && <span className="absolute -top-1.5 -right-1.5 px-1.5 rounded-full bg-white/90 text-[#05130d] text-[11px] font-black pointer-events-none">×{c.count}</span>}
                                    {qty > 0 && (
                                        <span className="absolute -top-2 -right-2 grid place-items-center w-7 h-7 rounded-full bg-[#e9c46a] text-[#05130d] shadow-lg pointer-events-none"><Check className="w-4 h-4" strokeWidth={3} /></span>
                                    )}
                                    {qty > 0 && c.count > 1 && (
                                        <div className="absolute bottom-1 inset-x-1 flex items-center justify-between rounded-full bg-black/85 px-1 py-0.5 text-white text-xs font-bold">
                                            <button type="button" onClick={() => onQty(c, qty - 1)} className="grid place-items-center w-6 h-6" aria-label="Moins"><Minus className="w-3.5 h-3.5" /></button>
                                            {qty}/{c.count}
                                            <button type="button" onClick={() => onQty(c, Math.min(c.count, qty + 1))} className="grid place-items-center w-6 h-6" aria-label="Plus"><Plus className="w-3.5 h-3.5" /></button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {page.matches > page.cards.length && <button type="button" onClick={more} className="mt-3 w-full py-2 rounded-full ring-1 ring-white/10 text-sm font-semibold text-white/80 hover:bg-white/5">Afficher plus</button>}
                </>
            )}
        </div>
    );
}

function TradeBuilder({ friend, total, onClose, onSent }) {
    const [side, setSide] = useState('get');
    const [give, setGive] = useState(new Map());
    const [get, setGet] = useState(new Map());
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const toggler = (set) => (c) => set((m) => {
        const next = new Map(m);
        if (next.has(c.id)) next.delete(c.id); else if (next.size < MAX_ITEMS) next.set(c.id, { card: c, qty: 1 });
        return next;
    });
    // adds the given cards (up to MAX_ITEMS in all); null clears the side
    const buller = (set) => (items) => set((m) => {
        if (!items) return new Map();
        const next = new Map(m);
        for (const it of items) if (next.has(it.card.id) || next.size < MAX_ITEMS) next.set(it.card.id, it);
        return next;
    });
    const qtyer = (set) => (c, qty) => set((m) => {
        const next = new Map(m);
        if (qty < 1) next.delete(c.id); else next.set(c.id, { card: c, qty });
        return next;
    });

    async function send() {
        setBusy(true);
        setError('');
        try {
            const list = (m) => [...m.values()].map(({ card, qty }) => ({ cardId: card.id, qty }));
            await api('proposeTrade', { username: friend, give: list(give), get: list(get), message });
            onSent();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const sum = (m) => [...m.values()].reduce((s, i) => s + i.qty, 0);
    const empty = give.size === 0 && get.size === 0;
    return (
        <motion.div className="fixed inset-0 z-[100] flex justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden sm:rounded-[2rem] bg-[#081a11] ring-1 ring-white/10"
                initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}>
                <div className="shrink-0 flex items-center gap-3 p-4 sm:p-6 pb-3 border-b border-white/5">
                    <ArrowLeftRight className="w-6 h-6 text-[#e9c46a] shrink-0" />
                    <div className="min-w-0">
                        <h2 className="font-display text-xl sm:text-2xl text-white truncate">Échange avec {friend}</h2>
                        <p className="text-xs text-white/55">Choisis ce que tu donnes et ce que tu demandes. Rien ne bouge tant que {friend} n'a pas accepté.</p>
                    </div>
                    <button type="button" onClick={onClose} className="ml-auto grid place-items-center w-9 h-9 rounded-full nd-cta-glass shrink-0" aria-label="Fermer"><X className="w-4 h-4" /></button>
                </div>
                <div className="shrink-0 px-4 sm:px-6 pt-3">
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-white/5 ring-1 ring-white/10">
                        <button type="button" onClick={() => setSide('get')} className={`py-2 rounded-full text-sm font-bold ${side === 'get' ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75'}`}>Tu demandes{get.size ? ` (${sum(get)})` : ''}</button>
                        <button type="button" onClick={() => setSide('give')} className={`py-2 rounded-full text-sm font-bold ${side === 'give' ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75'}`}>Tu donnes{give.size ? ` (${sum(give)})` : ''}</button>
                    </div>
                    <p className="mt-2 text-xs text-white/50">{side === 'get' ? `La collection de ${friend} : celles qui te manquent apparaissent en premier.` : 'Ta collection. Donner ton dernier exemplaire retire la carte de ta collection.'}</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3">
                    {side === 'get'
                        ? <Picker key="get" username={friend} selected={get} onToggle={toggler(setGet)} onQty={qtyer(setGet)} onBulk={buller(setGet)} total={total} />
                        : <Picker key="give" selected={give} onToggle={toggler(setGive)} onQty={qtyer(setGive)} onBulk={buller(setGive)} total={total} />}
                </div>
                <div className="shrink-0 border-t border-white/10 p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 bg-black/20 sm:rounded-b-[2rem]">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-white/50">Tu donnes</div>
                            <div className="truncate text-white font-semibold">{give.size ? [...give.values()].map((i) => `${i.card.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') : 'Rien'}</div>
                        </div>
                        <ArrowLeftRight className="w-5 h-5 text-[#e9c46a]" />
                        <div className="min-w-0 text-right">
                            <div className="text-[11px] uppercase tracking-wider text-white/50">Tu reçois</div>
                            <div className="truncate text-white font-semibold">{get.size ? [...get.values()].map((i) => `${i.card.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') : 'Rien'}</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="Petit mot (facultatif)"
                            className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-black/30 ring-1 ring-white/15 text-sm text-white outline-none focus:ring-[#e9c46a]/60 placeholder:text-white/40" />
                        <button onClick={send} disabled={busy || empty} className="nd-cta-gold px-4 sm:px-5 rounded-full font-bold disabled:opacity-50 flex items-center gap-1.5 shrink-0"><Send className="w-4 h-4" />Proposer</button>
                    </div>
                    {error && <p className="text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                </div>
            </motion.div>
        </motion.div>
    );
}

const GIFTS = [
    { key: 'coins', label: 'Graines', Icon: Seed, color: SEED_COLOR, presets: [10, 50, 100, 300] },
    { key: 'nuggets', label: 'Pépites', Icon: Nugget, color: NUGGET_COLOR, presets: [20, 100, 250, 500] },
    { key: 'plants', label: 'Plantes', Icon: Plant, color: PLANT_COLOR, presets: [1, 5, 10, 30] },
];

function GiftSheet({ friend, user, onClose, onSent }) {
    const [info, setInfo] = useState(null);
    const [currency, setCurrency] = useState('coins');
    const [amount, setAmount] = useState(0);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api('giftInfo', { username: friend }).then(setInfo).catch((err) => setError(err.message));
    }, [friend]);

    const g = GIFTS.find((x) => x.key === currency);
    const allow = info?.allowance[currency];
    const balance = user[currency] ?? 0;
    const max = allow ? Math.min(allow.left, balance) : 0;
    const locked = info?.readyAt;
    const pick = (key) => { setCurrency(key); setAmount(0); setError(''); };

    async function send() {
        setBusy(true);
        setError('');
        try {
            const res = await api('giftCurrency', { username: friend, currency, amount, note });
            onSent(res, `${amount.toLocaleString('fr-FR')} ${g.label.toLowerCase()}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <motion.div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] bg-[#081a11] ring-1 ring-white/10 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
                <div className="flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-full bg-[#e9c46a]/15 text-[#e9c46a] shrink-0"><Gift className="w-5 h-5" /></span>
                    <div className="min-w-0">
                        <h2 className="font-display text-xl text-white truncate">Offrir à {friend}</h2>
                        <p className="text-xs text-white/55">Le cadeau arrive tout de suite, avec un petit mot dans vos messages.</p>
                    </div>
                    <button type="button" onClick={onClose} className="ml-auto grid place-items-center w-9 h-9 rounded-full nd-cta-glass shrink-0" aria-label="Fermer"><X className="w-4 h-4" /></button>
                </div>

                {!info && !error && <div className="py-10 text-center text-sm text-white/55">Chargement…</div>}
                {locked && (
                    <p className="mt-5 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/75 flex gap-2">
                        <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#e9c46a]" />
                        Vous êtes amis depuis moins de 24 h. Les cadeaux seront possibles le {new Date(locked).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.
                    </p>
                )}
                {info && !locked && (
                    <>
                        <div className="mt-5 grid grid-cols-3 gap-2">
                            {GIFTS.map(({ key, label, Icon, color }) => (
                                <button key={key} type="button" onClick={() => pick(key)}
                                    className={`rounded-2xl p-3 text-left ring-1 transition-colors ${currency === key ? 'bg-white/10 ring-[#e9c46a]/70' : 'bg-white/[0.03] ring-white/10 hover:bg-white/5'}`}>
                                    <span style={{ color }}><Icon className="w-5 h-5" /></span>
                                    <div className="mt-1 text-sm font-bold text-white">{label}</div>
                                    <div className="text-[11px] text-white/50">Tu as {(user[key] ?? 0).toLocaleString('fr-FR')}</div>
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                            <button type="button" disabled={amount <= 0} onClick={() => setAmount((a) => Math.max(0, a - 1))} className="grid place-items-center w-10 h-10 rounded-full ring-1 ring-white/15 text-white/80 disabled:opacity-40" aria-label="Moins"><Minus className="w-4 h-4" /></button>
                            <div className="flex-1 text-center">
                                <div className="font-display text-4xl text-white tabular-nums flex items-center justify-center gap-2">
                                    <span style={{ color: g.color }}><g.Icon className="w-7 h-7" /></span>{amount.toLocaleString('fr-FR')}
                                </div>
                            </div>
                            <button type="button" disabled={amount >= max} onClick={() => setAmount((a) => Math.min(max, a + 1))} className="grid place-items-center w-10 h-10 rounded-full ring-1 ring-white/15 text-white/80 disabled:opacity-40" aria-label="Plus"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2">
                            {g.presets.map((n) => (
                                <button key={n} type="button" disabled={n > max} onClick={() => setAmount(n)}
                                    className={`py-2 rounded-full text-sm font-bold ring-1 disabled:opacity-35 ${amount === n ? 'bg-[#e9c46a] text-[#05130d] ring-transparent' : 'ring-white/15 text-white/85 hover:bg-white/5'}`}>{n}</button>
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-center text-white/55">
                            {allow.friendFull
                                ? `${friend} a déjà reçu le maximum de ${g.label.toLowerCase()} aujourd'hui.`
                                : `Encore ${allow.left.toLocaleString('fr-FR')} ${g.label.toLowerCase()} à offrir aujourd'hui (maximum ${allow.max} par jour).`}
                        </p>

                        <div className="mt-4 flex gap-2">
                            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Petit mot (facultatif)"
                                className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-black/30 ring-1 ring-white/15 text-sm text-white outline-none focus:ring-[#e9c46a]/60 placeholder:text-white/40" />
                            <button onClick={send} disabled={busy || amount < 1 || amount > max} className="nd-cta-gold px-5 rounded-full font-bold disabled:opacity-50 flex items-center gap-1.5 shrink-0"><Gift className="w-4 h-4" />Offrir</button>
                        </div>
                    </>
                )}
                {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
            </motion.div>
        </motion.div>
    );
}

const STATUS = {
    accepted: ['Échange réalisé', '#4fd18b'],
    declined: ['Refusé', '#ff8a80'],
    cancelled: ['Annulé', '#9ca3af'],
};

function TradeRow({ t, busy, onRespond, onCancel }) {
    const pending = t.status === 'pending';
    const missing = pending && [...t.give, ...t.get].some((i) => i.have < i.qty);
    const status = STATUS[t.status];
    return (
        <div className="rounded-3xl nd-glass p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <PlayerAvatar name={t.other} size={36} />
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{t.mine ? <>Proposé à <b>{t.other}</b></> : <><b>{t.other}</b> te propose</>}</div>
                    <div className="text-xs text-white/50">{new Date(t.resolved_at || t.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                {status && <span className="text-xs font-bold" style={{ color: status[1] }}>{status[0]}</span>}
                {pending && t.mine && <span className="text-xs font-semibold text-[#e9c46a] flex items-center gap-1"><Clock className="w-3.5 h-3.5" />En attente</span>}
            </div>
            {t.message && <p className="mt-3 text-sm text-white/80 italic">« {t.message} »</p>}
            <div className="mt-4 grid sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-start">
                <div>
                    <div className="text-[11px] uppercase tracking-wider text-white/50 mb-2">{pending ? 'Tu donnes' : 'Tu as donné'}</div>
                    <div className="flex flex-wrap gap-2.5">{t.give.length ? t.give.map((i) => <MiniCard key={i.card.id} item={i} warn={pending && i.have < i.qty} />) : <span className="text-sm text-white/40">Rien</span>}</div>
                </div>
                <ArrowLeftRight className="hidden sm:block w-6 h-6 text-[#e9c46a] mt-10" />
                <div>
                    <div className="text-[11px] uppercase tracking-wider text-white/50 mb-2">{pending ? 'Tu reçois' : 'Tu as reçu'}</div>
                    <div className="flex flex-wrap gap-2.5">{t.get.length ? t.get.map((i) => (
                        <div key={i.card.id} className="relative">
                            <MiniCard item={i} warn={pending && i.have < i.qty} />
                            {pending && !i.mineCount && <span className="absolute -top-1.5 left-0 px-1 rounded bg-[#4fd18b] text-[#05130d] text-[9px] font-bold">Nouvelle</span>}
                        </div>
                    )) : <span className="text-sm text-white/40">Rien (cadeau)</span>}</div>
                </div>
            </div>
            {missing && <p className="mt-3 text-xs font-semibold text-[#ffb4a2]">Une des cartes n'est plus disponible (vendue ou échangée entre-temps) : l'échange ne pourra pas se faire.</p>}
            {pending && (
                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                    {t.mine ? (
                        <button disabled={busy} onClick={() => onCancel(t)} className="px-4 py-2 rounded-full ring-1 ring-white/15 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50">Annuler la proposition</button>
                    ) : (
                        <>
                            <button disabled={busy} onClick={() => onRespond(t, false)} className="px-4 py-2 rounded-full ring-1 ring-white/15 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50">Refuser</button>
                            <button disabled={busy || missing} onClick={() => onRespond(t, true)} className="nd-cta-gold px-5 py-2 rounded-full text-sm font-bold disabled:opacity-50 flex items-center gap-1.5"><Check className="w-4 h-4" />Accepter l'échange</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function Friends() {
    const { user, setUser, catalog, refreshCollection } = useGame();
    const [params] = useSearchParams();
    const linkedTab = { demandes: 'requests', echanges: 'trades' }[params.get('onglet')];
    const [tab, setTab] = useState(linkedTab || 'friends');
    useEffect(() => { if (linkedTab) setTab(linkedTab); }, [linkedTab]); // from the « Pendant ton absence » pop-up
    const [friends, setFriends] = useState(null);
    const [trades, setTrades] = useState(null);
    const [trading, setTrading] = useState(null); // friend username in the trade builder
    const [gifting, setGifting] = useState(null); // friend username in the gift sheet
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const load = useCallback(() => {
        api('friends').then(setFriends).catch(() => {});
        api('trades').then(setTrades).catch(() => {});
        api('me').then((r) => setUser(r.user)).catch(() => {});
    }, [setUser]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const t = setInterval(load, 15_000);
        return () => clearInterval(t);
    }, [load]);

    async function act(action, body, success, after) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await api(action, body);
            if (res.user) setUser(res.user);
            after?.(res);
            setMessage(['ok', typeof success === 'function' ? success(res) : success]);
        } catch (err) {
            setMessage(['error', err.message]);
        } finally {
            setBusy(false);
            load();
        }
    }

    const requests = (friends?.incoming.length || 0);
    const offers = trades?.incoming.length || 0;
    const counts = { friends: 0, requests, trades: offers };
    const history = useMemo(() => trades?.history || [], [trades]);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Entre naturalistes</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Amis</h1>
            <p className="mt-3 text-ink-soft max-w-xl">Ajoute tes amis avec leur pseudo, puis échangez vos cartes. Ton pseudo : <b className="text-white">{user.username}</b></p>

            <div className="mt-6"><AddFriend onDone={load} /></div>
            <InviteBanner className="mt-4" />

            <div className="mt-8 grid grid-cols-3 sm:flex gap-1 p-1 rounded-full bg-white/5 ring-1 ring-white/10 sm:w-fit">
                {TABS.map(([key, label]) => (
                    <button key={key} onClick={() => { setTab(key); setMessage(null); }}
                        className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${tab === key ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75 hover:text-white'}`}>
                        {label}<Badge n={counts[key]} />
                    </button>
                ))}
            </div>

            {message && <p className={`mt-4 text-sm font-semibold ${message[0] === 'error' ? 'text-[#ffb4a2]' : 'text-[#a8f0c6]'}`}>{message[1]}</p>}

            <div className="mt-6">
                {tab === 'friends' && (!friends ? <div className="py-16 text-center text-ink-soft">Chargement…</div> : friends.friends.length === 0 ? (
                    <div className="py-14 text-center">
                        <Users className="w-10 h-10 mx-auto text-white/25" />
                        <p className="mt-3 text-ink-soft">Pas encore d'amis. Entre le pseudo d'un joueur ci-dessus pour lui envoyer une demande.</p>
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {friends.friends.map((f) => (
                            <li key={f.username} className="rounded-3xl nd-glass p-4 flex items-center gap-3">
                                <PlayerAvatar name={f.username} />
                                <div className="min-w-0 flex-1">
                                    <Link to={`/joueur/${encodeURIComponent(f.username)}`} className="flex items-center gap-1.5 font-display text-lg text-white hover:underline">
                                        <span className="truncate min-w-0">{f.username}</span><SeasonBadge badge={f.badge} compact />
                                    </Link>
                                    <div className="text-xs text-white/55">{f.discovered.toLocaleString('fr-FR')} espèces découvertes</div>
                                </div>
                                <Link to={`/messages/${encodeURIComponent(f.username)}`} className="grid place-items-center w-9 h-9 rounded-full ring-1 ring-white/15 text-white/80 hover:bg-white/10" aria-label={`Écrire à ${f.username}`} title="Message"><MessageCircle className="w-4 h-4" /></Link>
                                <button onClick={() => setGifting(f.username)} className="grid place-items-center w-9 h-9 rounded-full ring-1 ring-[#e9c46a]/40 text-[#e9c46a] hover:bg-[#e9c46a]/10" aria-label={`Offrir à ${f.username}`} title="Offrir des graines, pépites ou plantes"><Gift className="w-4 h-4" /></button>
                                <button onClick={() => setTrading(f.username)} className="nd-cta-gold px-3.5 py-2 rounded-full text-sm font-bold flex items-center gap-1.5"><ArrowLeftRight className="w-4 h-4" /><span className="hidden min-[400px]:inline">Échanger</span></button>
                                <button disabled={busy} onClick={() => window.confirm(`Retirer ${f.username} de tes amis ?`) && act('removeFriend', { username: f.username }, `${f.username} a été retiré de tes amis.`)}
                                    className="grid place-items-center w-9 h-9 rounded-full text-white/50 hover:text-[#ff8a80] hover:bg-white/5" aria-label={`Retirer ${f.username}`}><Trash2 className="w-4 h-4" /></button>
                            </li>
                        ))}
                    </ul>
                ))}

                {tab === 'requests' && (!friends ? <div className="py-16 text-center text-ink-soft">Chargement…</div> : (
                    <div className="space-y-8">
                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">Reçues</h2>
                            {friends.incoming.length === 0 ? <p className="mt-3 text-sm text-white/50">Aucune demande reçue.</p> : (
                                <ul className="mt-3 grid sm:grid-cols-2 gap-3">
                                    {friends.incoming.map((f) => (
                                        <li key={f.username} className="rounded-3xl nd-glass p-4 flex items-center gap-3">
                                            <PlayerAvatar name={f.username} />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-display text-lg text-white truncate">{f.username}</div>
                                                <div className="text-xs text-white/55">veut devenir ton ami</div>
                                            </div>
                                            <button disabled={busy} onClick={() => act('respondFriend', { username: f.username, accept: false }, 'Demande refusée.')} className="grid place-items-center w-9 h-9 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5" aria-label="Refuser"><X className="w-4 h-4" /></button>
                                            <button disabled={busy} onClick={() => act('respondFriend', { username: f.username, accept: true }, `Toi et ${f.username} êtes maintenant amis !`)} className="px-3.5 py-2 rounded-full text-sm font-bold bg-[#4fd18b] text-[#05130d] flex items-center gap-1"><Check className="w-4 h-4" />Accepter</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">Envoyées</h2>
                            {friends.outgoing.length === 0 ? <p className="mt-3 text-sm text-white/50">Aucune demande en attente.</p> : (
                                <ul className="mt-3 grid sm:grid-cols-2 gap-3">
                                    {friends.outgoing.map((f) => (
                                        <li key={f.username} className="rounded-3xl nd-glass p-4 flex items-center gap-3">
                                            <PlayerAvatar name={f.username} />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-display text-lg text-white truncate">{f.username}</div>
                                                <div className="text-xs text-white/55 flex items-center gap-1"><Clock className="w-3 h-3" />En attente de réponse</div>
                                            </div>
                                            <button disabled={busy} onClick={() => act('removeFriend', { username: f.username }, 'Demande annulée.')} className="px-3 py-1.5 rounded-full ring-1 ring-white/15 text-xs font-semibold text-white/75 hover:bg-white/5">Annuler</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                ))}

                {tab === 'trades' && (!trades ? <div className="py-16 text-center text-ink-soft">Chargement…</div> : (
                    <div className="space-y-8">
                        {[['Propositions reçues', trades.incoming, 'Aucune proposition reçue.'], ['Tes propositions', trades.outgoing, 'Aucune proposition en attente. Va dans « Mes amis » et clique sur Échanger.'], ['Historique', history, 'Aucun échange terminé.']].map(([title, list, empty]) => (
                            <section key={title}>
                                <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">{title}</h2>
                                {list.length === 0 ? <p className="mt-3 text-sm text-white/50">{empty}</p> : (
                                    <div className="mt-3 space-y-3">
                                        {list.map((t) => (
                                            <TradeRow key={t.id} t={t} busy={busy}
                                                onRespond={(x, accept) => act('respondTrade', { id: x.id, accept }, accept ? 'Échange réalisé ! Les cartes sont dans ta collection.' : 'Proposition refusée.', () => accept && refreshCollection())}
                                                onCancel={(x) => act('cancelTrade', { id: x.id }, 'Proposition annulée.')} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        ))}
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {trading && <TradeBuilder friend={trading} total={catalog?.total} onClose={() => setTrading(null)}
                    onSent={() => { setTrading(null); setTab('trades'); setMessage(['ok', `Proposition envoyée à ${trading} !`]); load(); }} />}
            </AnimatePresence>
            <AnimatePresence>
                {gifting && <GiftSheet friend={gifting} user={user} onClose={() => setGifting(null)}
                    onSent={(res, what) => { setUser(res.user); setGifting(null); setMessage(['ok', `Cadeau envoyé : ${what} pour ${gifting} !`]); }} />}
            </AnimatePresence>
        </div>
    );
}
