import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Crown, Gavel, Search, Sparkles, Tag, X, Zap } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { Amount, Nugget } from '../components/Currency.jsx';
import { RARITIES, TYPES } from '../game.jsx';

const TABS = [
    ['market', 'Le marché'],
    ['bidding', 'Mes enchères'],
    ['selling', 'Mes ventes'],
    ['sell', 'Vendre une carte'],
];
const SORTS = [
    ['ending', 'Se termine bientôt'],
    ['new', 'Nouveautés'],
    ['cheap', 'Prix croissant'],
    ['rarity', 'Les plus rares'],
];

function useNow() {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    return now;
}

function timeLeft(iso, now) {
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) return 'Terminée';
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

// How an auction ended (or stands) from the current player's point of view.
function statusOf(a, now) {
    const ended = a.status !== 'open' || new Date(a.ends_at).getTime() <= now;
    if (a.mine) {
        if (a.status === 'sold') return ['Vendue', '#4fd18b'];
        if (a.status === 'expired') return ['Invendue · carte rendue', '#9ca3af'];
        if (a.status === 'cancelled') return ['Annulée', '#9ca3af'];
        return ended ? ['Clôture en cours…', '#e9c46a'] : ['En vente', '#e9c46a'];
    }
    if (a.status === 'sold') return a.leading ? ['Remportée !', '#4fd18b'] : ['Perdue', '#ff8a80'];
    if (a.status !== 'open') return ['Terminée', '#9ca3af'];
    if (a.leading) return ['Tu mènes', '#4fd18b'];
    if (a.my_bid) return ['Surenchérie', '#ff8a80'];
    return null;
}

function AuctionTile({ a, now, total, busy, onBid, onBuy, onCancel }) {
    const [amount, setAmount] = useState(a.minBid);
    useEffect(() => setAmount(a.minBid), [a.minBid]);
    const status = statusOf(a, now);
    const open = a.status === 'open' && new Date(a.ends_at).getTime() > now;
    const soon = open && new Date(a.ends_at).getTime() - now < 5 * 60_000;
    return (
        <motion.div layout className="rounded-3xl nd-glass p-3 flex flex-col gap-3">
            <div className="relative">
                <Link to={a.have ? `/carte/${a.card.id}` : '#'} onClick={(e) => !a.have && e.preventDefault()}><Card card={a.card} number={a.card.num} total={total} /></Link>
                {!a.have && !a.mine && (
                    <span className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full bg-[#4fd18b] text-[#05130d] text-[11px] font-bold shadow-lg flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />Nouvelle pour toi
                    </span>
                )}
            </div>
            <div className="px-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-white/60 truncate">par <b className="text-white/85">{a.mine ? 'toi' : a.seller}</b></span>
                <span className={`flex items-center gap-1 font-semibold tabular-nums ${soon ? 'text-[#ff8a80]' : 'text-white/70'}`}><Clock className="w-3.5 h-3.5" />{timeLeft(a.ends_at, now)}</span>
            </div>
            <div className="px-1 flex items-end justify-between gap-2">
                <div>
                    <div className="text-[11px] uppercase tracking-wider text-white/50">{a.bid ? `Offre · ${a.bids} enchère${a.bids > 1 ? 's' : ''}` : 'Mise de départ'}</div>
                    <Amount nuggets={a.bid ?? a.start_price} className="text-lg" />
                </div>
                {status && <span className="text-xs font-bold text-right" style={{ color: status[1] }}>{status[0]}</span>}
            </div>
            {open && !a.mine && (
                <div className="mt-auto space-y-2">
                    {!(a.buyout && a.minBid >= a.buyout) && (
                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onBid(a, Number(amount)); }}>
                            <label className="flex-1 min-w-0 flex items-center gap-1.5 px-3 rounded-full bg-black/30 ring-1 ring-white/15 focus-within:ring-[#e9c46a]/60">
                                <Nugget className="w-4 h-4 shrink-0" />
                                <input type="number" min={a.minBid} value={amount} onChange={(e) => setAmount(e.target.value)}
                                    className="w-full min-w-0 bg-transparent py-2 text-sm font-bold text-white outline-none tabular-nums" aria-label="Montant de l'offre" />
                            </label>
                            <button disabled={busy || Number(amount) < a.minBid} className="nd-btn px-3.5 rounded-full text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                                <Gavel className="w-4 h-4" />{a.leading ? 'Relancer' : 'Enchérir'}
                            </button>
                        </form>
                    )}
                    {a.buyout && (
                        <button disabled={busy} onClick={() => onBuy(a)} className="w-full py-2 rounded-full border border-[#e9c46a]/60 text-[#f4d88f] text-sm font-bold hover:bg-[#e9c46a]/10 disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <Zap className="w-4 h-4" />Acheter tout de suite · <Nugget className="w-4 h-4" />{a.buyout.toLocaleString('fr-FR')}
                        </button>
                    )}
                </div>
            )}
            {open && a.mine && (
                <div className="mt-auto px-1 text-xs text-white/60 flex items-center justify-between gap-2">
                    <span>{a.buyout ? <>Achat immédiat : <b className="text-[#f4c25b]">{a.buyout}</b></> : 'Sans achat immédiat'}</span>
                    {!a.bid && <button disabled={busy} onClick={() => onCancel(a)} className="font-semibold text-white/80 underline underline-offset-2 hover:text-white">Annuler</button>}
                </div>
            )}
        </motion.div>
    );
}

function Filters({ filters, setFilters }) {
    const [query, setQuery] = useState(filters.query);
    useEffect(() => {
        const t = setTimeout(() => setFilters((f) => (f.query === query ? f : { ...f, query })), 300);
        return () => clearTimeout(t);
    }, [query, setFilters]);
    const select = 'px-3.5 py-2 rounded-full bg-white/5 ring-1 ring-white/10 text-sm font-semibold text-white outline-none [&>option]:bg-[#081a11]';
    return (
        <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 px-3.5 rounded-full bg-white/5 ring-1 ring-white/10 focus-within:ring-[#4fd18b]/50 flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-white/50" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une espèce…" className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40" />
            </label>
            <select value={filters.rarity || ''} onChange={(e) => setFilters({ ...filters, rarity: e.target.value || null })} className={select} aria-label="Rareté">
                <option value="">Toutes raretés</option>
                {Object.entries(RARITIES).reverse().map(([key, r]) => <option key={key} value={key}>{r.symbol} {r.label}</option>)}
            </select>
            <select value={filters.type || ''} onChange={(e) => setFilters({ ...filters, type: e.target.value || null })} className={select} aria-label="Type">
                <option value="">Tous les types</option>
                {Object.entries(TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
            </select>
            <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className={select} aria-label="Tri">
                {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
        </div>
    );
}

function SellForm({ card, info, total, busy, onSubmit, onClose }) {
    const suggested = Math.max(1, (info.recycleValue[card.rarity] || 5) * 2);
    const [start, setStart] = useState(suggested);
    const [buyout, setBuyout] = useState('');
    const [hours, setHours] = useState(24);
    const valid = Number(start) >= 1 && (!buyout || Number(buyout) > Number(start));
    const input = 'w-full bg-transparent py-2.5 text-base font-bold text-white outline-none tabular-nums';
    return (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.form onSubmit={(e) => { e.preventDefault(); onSubmit({ cardId: card.id, startPrice: Number(start), buyout: buyout ? Number(buyout) : null, hours }); }}
                className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[2rem] bg-[#081a11] ring-1 ring-white/10 p-5 sm:p-7 grid sm:grid-cols-[200px_1fr] gap-6"
                initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.97 }}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                <div className="w-44 sm:w-full mx-auto"><Card card={card} number={card.num} total={total} /></div>
                <div>
                    <h2 className="font-display text-2xl text-white pr-10">Mettre en vente</h2>
                    <p className="mt-1 text-sm text-ink-soft">Tu en as {card.count} : un exemplaire part en vente, les autres restent dans ta collection.</p>
                    <div className="mt-5 space-y-4">
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wider text-white/60">Mise de départ</span>
                            <span className="mt-1.5 flex items-center gap-2 px-4 rounded-2xl bg-black/30 ring-1 ring-white/15 focus-within:ring-[#e9c46a]/60">
                                <Nugget className="w-5 h-5" /><input type="number" min={1} value={start} onChange={(e) => setStart(e.target.value)} className={input} required />
                            </span>
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wider text-white/60">Achat immédiat <span className="normal-case tracking-normal font-normal">(facultatif)</span></span>
                            <span className="mt-1.5 flex items-center gap-2 px-4 rounded-2xl bg-black/30 ring-1 ring-white/15 focus-within:ring-[#e9c46a]/60">
                                <Zap className="w-5 h-5 text-[#f4d88f]" /><input type="number" min={Number(start) + 1} value={buyout} onChange={(e) => setBuyout(e.target.value)} placeholder="Aucun" className={`${input} placeholder:text-white/30 placeholder:font-normal`} />
                            </span>
                        </label>
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-white/60">Durée</span>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                {info.hours.map((h) => (
                                    <button type="button" key={h} onClick={() => setHours(h)}
                                        className={`px-4 py-2 rounded-full text-sm font-bold ${hours === h ? 'bg-[#e9c46a] text-[#05130d]' : 'bg-white/5 text-white/80 ring-1 ring-white/10'}`}>{h} h</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <p className="mt-4 text-xs text-white/55">Les pépites de l'acheteur sont bloquées dès son offre. À la fin, tu reçois l'offre gagnante moins {Math.round(info.fee * 100)} % de commission. Sans offre, la carte te revient.</p>
                    <button disabled={busy || !valid} className="mt-5 w-full nd-btn py-3 rounded-full font-bold disabled:opacity-50 flex items-center justify-center gap-2"><Tag className="w-5 h-5" />Mettre en vente</button>
                </div>
            </motion.form>
        </motion.div>
    );
}

function SellTab({ total, preselect, onListed }) {
    const [info, setInfo] = useState(null);
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api('sellable').then((res) => {
            setInfo(res);
            if (preselect) setPicked(res.cards.find((c) => c.id === preselect) || null);
        }).catch((e) => setError(e.message));
    }, [preselect]);

    async function submit(params) {
        setBusy(true);
        setError('');
        try {
            await api('createAuction', params);
            setPicked(null);
            onListed();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    if (!info) return <div className="py-20 text-center font-display text-lg text-ink-soft">{error || 'Chargement…'}</div>;
    return (
        <>
            <p className="text-ink-soft max-w-2xl">Seuls les <b className="text-white">doublons</b> se vendent : ta collection garde toujours au moins un exemplaire de chaque espèce. Choisis une carte :</p>
            {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
            {info.cards.length === 0 ? (
                <p className="py-16 text-center text-ink-soft">Aucun doublon pour l'instant. Ouvre des boosters !</p>
            ) : (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                    {info.cards.map((c) => (
                        <button key={c.id} onClick={() => setPicked(c)} className="relative text-left transition-transform hover:-translate-y-1">
                            <Card card={c} number={c.num} total={total} />
                            <span className="absolute -top-2 -right-2 min-w-8 h-8 px-1.5 grid place-items-center rounded-full bg-rust text-paper font-display font-black text-sm shadow-lg">×{c.count}</span>
                        </button>
                    ))}
                </div>
            )}
            <AnimatePresence>
                {picked && <SellForm card={picked} info={info} total={total} busy={busy} onSubmit={submit} onClose={() => setPicked(null)} />}
            </AnimatePresence>
        </>
    );
}

export default function Auctions() {
    const { user, setUser, catalog, refreshCollection } = useGame();
    const [params, setParams] = useSearchParams();
    const preselect = Number(params.get('vendre')) || null;
    const [tab, setTab] = useState(preselect ? 'sell' : 'market');
    const [filters, setFilters] = useState({ query: '', rarity: null, type: null, sort: 'ending' });
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const now = useNow();

    const load = useCallback(() => {
        if (tab === 'sell') return;
        api('auctions', { view: tab, ...filters }).then((res) => setData({ tab, ...res })).catch((e) => setMessage(['error', e.message]));
    }, [tab, filters]);
    useEffect(() => { load(); }, [load]);
    // Keep bids fresh while the page is open.
    useEffect(() => {
        const t = setInterval(load, 20_000);
        return () => clearInterval(t);
    }, [load]);

    function switchTab(key) {
        setTab(key);
        setData(null);
        setMessage(null);
        if (params.has('vendre')) setParams({}, { replace: true });
    }

    async function act(action, body, success) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await api(action, body);
            if (res.user) setUser(res.user);
            if (res.sold) refreshCollection();
            setMessage(['ok', typeof success === 'function' ? success(res) : success]);
        } catch (err) {
            setMessage(['error', err.message]);
        } finally {
            setBusy(false);
            load();
        }
    }
    const onBid = (a, amount) => act('bid', { id: a.id, amount }, (res) => (res.sold ? `${a.card.name} est à toi !` : `Offre de ${amount} pépites placée sur ${a.card.name}.`));
    const onBuy = (a) => act('bid', { id: a.id, buyNow: true }, `${a.card.name} est à toi ! Elle a rejoint ta collection.`);
    const onCancel = (a) => act('cancelAuction', { id: a.id }, () => { refreshCollection(); return 'Vente annulée, la carte est revenue dans ta collection.'; });

    const list = data?.tab === tab ? data.auctions : null;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Hôtel des ventes</p>
                    <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Enchères</h1>
                    <p className="mt-3 text-ink-soft max-w-xl">Vends tes doublons et trouve les espèces qui te manquent auprès des autres joueurs. Ici, on paie en pépites.</p>
                </div>
                <div className="rounded-2xl nd-glass px-5 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-white/50">Tes pépites</div>
                    <Amount nuggets={user.nuggets} className="text-2xl" />
                </div>
            </div>

            <div className="mt-8 flex gap-1 p-1 rounded-full bg-white/5 ring-1 ring-white/10 overflow-x-auto w-fit max-w-full">
                {TABS.map(([key, label]) => (
                    <button key={key} onClick={() => switchTab(key)}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === key ? 'bg-[#e9c46a] text-[#05130d]' : 'text-white/75 hover:text-white'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {message && <p className={`mt-4 text-sm font-semibold ${message[0] === 'error' ? 'text-[#ffb4a2]' : 'text-[#a8f0c6]'}`}>{message[1]}</p>}

            <div className="mt-6">
                {tab === 'sell' ? (
                    <SellTab total={catalog?.total} preselect={preselect} onListed={() => { refreshCollection(); switchTab('selling'); setMessage(['ok', 'Ta carte est en vente !']); }} />
                ) : (
                    <>
                        {tab === 'market' && <Filters filters={filters} setFilters={setFilters} />}
                        {!list ? (
                            <div className="py-20 text-center font-display text-lg text-ink-soft">Chargement…</div>
                        ) : list.length === 0 ? (
                            <div className="py-16 text-center">
                                <Crown className="w-10 h-10 mx-auto text-white/25" />
                                <p className="mt-3 text-ink-soft">
                                    {tab === 'market' ? 'Aucune carte en vente pour le moment.' : tab === 'selling' ? 'Tu n\'as encore rien mis en vente.' : 'Tu n\'as encore fait aucune offre.'}
                                </p>
                                {tab !== 'bidding' && <button onClick={() => switchTab('sell')} className="mt-5 nd-cta-gold px-5 py-2.5 rounded-full font-bold">Vendre un doublon</button>}
                            </div>
                        ) : (
                            <>
                                {tab === 'market' && <p className="mt-4 text-sm text-white/50">{data.matches} carte{data.matches > 1 ? 's' : ''} en vente</p>}
                                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                    {list.map((a) => <AuctionTile key={a.id} a={a} now={now} total={catalog?.total} busy={busy} onBid={onBid} onBuy={onBuy} onCancel={onCancel} />)}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
