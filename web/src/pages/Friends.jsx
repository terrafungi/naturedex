import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, Clock, Minus, Plus, Search, Send, Sparkles, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { RARITIES } from '../game.jsx';

const TABS = [
    ['friends', 'Mes amis'],
    ['requests', 'Demandes'],
    ['trades', 'Échanges'],
];

function Avatar({ name, me = false, className = 'w-10 h-10 text-base' }) {
    const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return (
        <span className={`grid place-items-center rounded-full font-display font-bold shrink-0 ${className}`}
            style={{ background: me ? '#4fd18b' : `hsl(${hue} 45% 32%)`, color: me ? '#05130d' : 'white' }}>
            {name.slice(0, 1).toUpperCase()}
        </span>
    );
}

function Badge({ n }) {
    if (!n) return null;
    return <span className="ml-1.5 min-w-5 h-5 px-1.5 inline-grid place-items-center rounded-full bg-[#ff6b6b] text-white text-[11px] font-bold">{n}</span>;
}

// Small card used in trade summaries.
function MiniCard({ item, warn }) {
    const r = RARITIES[item.card.rarity] || RARITIES.common;
    return (
        <Link to={`/carte/${item.card.id}`} className="relative w-[4.5rem] shrink-0 group" title={item.card.name}>
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
                            <Avatar name={p.username} className="w-8 h-8 text-sm" />
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

// Grid of cards to pick from, for one side of the trade.
function Picker({ username, selected, onToggle, onQty, total }) {
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(null);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);
    useEffect(() => {
        let alive = true;
        setPage(null);
        api('tradeCards', { username, query: debounced, missing: true }).then((r) => alive && setPage(r)).catch(() => alive && setPage({ cards: [], matches: 0 }));
        return () => { alive = false; };
    }, [username, debounced]);

    async function more() {
        const r = await api('tradeCards', { username, query: debounced, missing: true, offset: page.cards.length });
        setPage({ matches: r.matches, cards: [...page.cards, ...r.cards] });
    }

    return (
        <div>
            <label className="flex items-center gap-2 px-3.5 rounded-full bg-white/5 ring-1 ring-white/10 focus-within:ring-[#4fd18b]/50">
                <Search className="w-4 h-4 text-white/50" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une carte…" className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40" />
            </label>
            {!page ? <div className="py-12 text-center text-ink-soft">Chargement…</div> : page.cards.length === 0 ? (
                <p className="py-12 text-center text-ink-soft">{debounced ? 'Aucune carte trouvée.' : 'Aucune carte dans cette collection.'}</p>
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
                                    {username && !c.have && <span className="absolute top-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded-full bg-[#4fd18b] text-[#05130d] text-[9px] font-bold flex items-center gap-0.5 pointer-events-none"><Sparkles className="w-2.5 h-2.5" />Nouvelle</span>}
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
        if (next.has(c.id)) next.delete(c.id); else if (next.size < 10) next.set(c.id, { card: c, qty: 1 });
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
        <motion.div className="fixed inset-0 z-50 grid place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full max-w-4xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col sm:rounded-[2rem] bg-[#081a11] ring-1 ring-white/10"
                initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}>
                <div className="flex items-center gap-3 p-4 sm:p-6 pb-3 border-b border-white/5">
                    <ArrowLeftRight className="w-6 h-6 text-[#e9c46a] shrink-0" />
                    <div className="min-w-0">
                        <h2 className="font-display text-xl sm:text-2xl text-white truncate">Échange avec {friend}</h2>
                        <p className="text-xs text-white/55">Choisis ce que tu donnes et ce que tu demandes. Rien ne bouge tant que {friend} n'a pas accepté.</p>
                    </div>
                    <button type="button" onClick={onClose} className="ml-auto grid place-items-center w-9 h-9 rounded-full nd-cta-glass shrink-0" aria-label="Fermer"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 sm:px-6 pt-3">
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-white/5 ring-1 ring-white/10">
                        <button type="button" onClick={() => setSide('get')} className={`py-2 rounded-full text-sm font-bold ${side === 'get' ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75'}`}>Tu demandes{get.size ? ` (${sum(get)})` : ''}</button>
                        <button type="button" onClick={() => setSide('give')} className={`py-2 rounded-full text-sm font-bold ${side === 'give' ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75'}`}>Tu donnes{give.size ? ` (${sum(give)})` : ''}</button>
                    </div>
                    <p className="mt-2 text-xs text-white/50">{side === 'get' ? `La collection de ${friend} : celles qui te manquent apparaissent en premier.` : 'Ta collection. Donner ton dernier exemplaire retire la carte de ta collection.'}</p>
                </div>
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
                    {side === 'get'
                        ? <Picker key="get" username={friend} selected={get} onToggle={toggler(setGet)} onQty={qtyer(setGet)} total={total} />
                        : <Picker key="give" selected={give} onToggle={toggler(setGive)} onQty={qtyer(setGive)} total={total} />}
                </div>
                <div className="border-t border-white/10 p-4 sm:p-5 space-y-3 bg-black/20 sm:rounded-b-[2rem]">
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
                <Avatar name={t.other} className="w-9 h-9 text-sm" />
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
    const [tab, setTab] = useState('friends');
    const [friends, setFriends] = useState(null);
    const [trades, setTrades] = useState(null);
    const [trading, setTrading] = useState(null); // friend username in the trade builder
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
                    <ul className="grid sm:grid-cols-2 gap-3">
                        {friends.friends.map((f) => (
                            <li key={f.username} className="rounded-3xl nd-glass p-4 flex items-center gap-3">
                                <Avatar name={f.username} />
                                <div className="min-w-0 flex-1">
                                    <div className="font-display text-lg text-white truncate">{f.username}</div>
                                    <div className="text-xs text-white/55">{f.discovered.toLocaleString('fr-FR')} espèces découvertes</div>
                                </div>
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
                                            <Avatar name={f.username} />
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
                                            <Avatar name={f.username} />
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
        </div>
    );
}
