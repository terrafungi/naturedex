import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock, Crown, Gavel, Radio, Users, X, Zap } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from './Card.jsx';
import { Amount, Nugget } from './Currency.jsx';

export function timeLeft(iso, now) {
    const ms = new Date(iso).getTime() - now;
    if (ms <= 0) return 'Terminée';
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function useNow() {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    return now;
}

function ago(iso, now) {
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    if (s < 5) return 'à l\'instant';
    if (s < 60) return `il y a ${s} s`;
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// What the outcome means for the current player, once the server has settled the auction.
function Outcome({ a }) {
    if (a.status === 'open') return null;
    const box = 'rounded-2xl p-4 text-sm font-semibold flex items-start gap-3';
    if (a.status === 'sold' && a.leading) {
        return (
            <div className={`${box} bg-[#4fd18b]/15 ring-1 ring-[#4fd18b]/40 text-[#a8f0c6]`}>
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Tu as remporté l'enchère pour {a.bid} pépites. La carte est dans ta collection. <Link to={`/carte/${a.card.id}`} className="underline underline-offset-2 text-white">Voir la carte</Link></span>
            </div>
        );
    }
    if (a.status === 'sold' && a.mine) {
        return <div className={`${box} bg-[#4fd18b]/15 ring-1 ring-[#4fd18b]/40 text-[#a8f0c6]`}><CheckCircle2 className="w-5 h-5 shrink-0" />Vendue à {a.leader} pour {a.bid} pépites. Tes pépites ont été créditées (commission déduite).</div>;
    }
    if (a.status === 'sold') {
        return <div className={`${box} bg-white/5 ring-1 ring-white/10 text-white/75`}><Crown className="w-5 h-5 shrink-0" />Remportée par {a.leader} pour {a.bid} pépites.{a.my_bid ? ' Tes pépites t\'ont été rendues.' : ''}</div>;
    }
    return <div className={`${box} bg-white/5 ring-1 ring-white/10 text-white/75`}><Clock className="w-5 h-5 shrink-0" />{a.status === 'cancelled' ? 'Vente annulée par le vendeur.' : 'Terminée sans offre : la carte est rendue au vendeur.'}</div>;
}

// Live view of one auction: refreshed every 2 seconds with the full bid history.
export default function LiveAuction({ id, total, onClose, onChange }) {
    const { setUser, refreshCollection } = useGame();
    const [data, setData] = useState(null);
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [flash, setFlash] = useState(false);
    const lastTop = useRef(null);
    const skew = useRef(0); // server clock minus browser clock
    const localNow = useNow();
    const now = localNow + skew.current;

    const load = useCallback(async () => {
        try {
            const res = await api('auction', { id });
            skew.current = new Date(res.serverNow).getTime() - Date.now();
            const top = res.bids[0];
            const key = top ? `${top.user}-${top.amount}` : null;
            // Someone else just bid: flash the price and move the suggested amount up.
            if (lastTop.current && key !== lastTop.current && top && !top.me) {
                setFlash(true);
                setTimeout(() => setFlash(false), 900);
            }
            if (key !== lastTop.current) setAmount(res.auction.minBid);
            if (res.auction.status !== 'open' && data?.auction.status === 'open') {
                if (res.auction.leading) refreshCollection();
                onChange?.();
            }
            lastTop.current = key;
            setData(res);
        } catch (err) {
            setMessage(['error', err.message]);
        }
    }, [id, data?.auction.status, refreshCollection, onChange]);

    useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const t = setInterval(load, 2000);
        return () => clearInterval(t);
    }, [load]);

    async function place(body, success) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await api('bid', { id, ...body });
            if (res.user) setUser(res.user);
            if (res.sold) refreshCollection();
            setMessage(['ok', res.sold ? 'Elle est à toi ! La carte a rejoint ta collection.' : success]);
            onChange?.();
        } catch (err) {
            setMessage(['error', err.message]);
        } finally {
            setBusy(false);
            load();
        }
    }

    const a = data?.auction;
    const ended = a && (a.status !== 'open' || new Date(a.ends_at).getTime() <= now);
    const soon = a && !ended && new Date(a.ends_at).getTime() - now < 2 * 60_000;
    const base = a ? a.bid ?? a.start_price : 0;
    const quick = a ? [['Minimum', a.minBid], ['+10 %', Math.ceil(base * 1.1)], ['+25 %', Math.ceil(base * 1.25)]]
        .filter(([, v], i, all) => v >= a.minBid && (!a.buyout || v < a.buyout) && all.findIndex(([, w]) => w === v) === i) : [];

    return (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-[2rem] bg-[#081a11] ring-1 ring-white/10 p-4 sm:p-7"
                initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.97 }}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 z-10 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                {!a ? (
                    <div className="py-24 text-center font-display text-lg text-ink-soft">{message?.[1] || 'Chargement…'}</div>
                ) : (
                    <div className="grid md:grid-cols-[240px_1fr] gap-5 sm:gap-7">
                        <div className="w-40 sm:w-52 md:w-full mx-auto">
                            <Card card={a.card} number={a.card.num} total={total} />
                            <p className="mt-3 text-center text-xs text-white/55">Mise en vente par <b className="text-white/85">{a.mine ? 'toi' : a.seller}</b></p>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                                {ended ? (
                                    <span className="text-white/50">Enchère terminée</span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[#ff8a80]"><Radio className="w-4 h-4 animate-pulse" />En direct</span>
                                )}
                                <span className="text-white/30">·</span>
                                <span className="flex items-center gap-1 text-white/60 normal-case tracking-normal font-semibold"><Users className="w-3.5 h-3.5" />{data.bidders} enchérisseur{data.bidders > 1 ? 's' : ''}</span>
                            </div>
                            <h2 className="mt-2 font-display text-2xl sm:text-3xl text-white pr-10 leading-tight">{a.card.name}</h2>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <motion.div animate={flash ? { scale: [1, 1.06, 1] } : {}} className={`rounded-2xl p-3.5 ring-1 transition-colors ${flash ? 'bg-[#e9c46a]/20 ring-[#e9c46a]/60' : 'bg-white/5 ring-white/10'}`}>
                                    <div className="text-[11px] uppercase tracking-wider text-white/50">{a.bid ? 'Meilleure offre' : 'Mise de départ'}</div>
                                    <Amount nuggets={a.bid ?? a.start_price} className="text-2xl" />
                                    <div className="mt-1 text-xs text-white/70 truncate">
                                        {a.leader ? <>par <b className={a.leading ? 'text-[#8ee6a8]' : 'text-white'}>{a.leading ? 'toi' : a.leader}</b></> : 'Aucune offre'}
                                    </div>
                                </motion.div>
                                <div className={`rounded-2xl p-3.5 ring-1 ${soon ? 'bg-[#ff8a80]/10 ring-[#ff8a80]/40' : 'bg-white/5 ring-white/10'}`}>
                                    <div className="text-[11px] uppercase tracking-wider text-white/50">Temps restant</div>
                                    <div className={`font-display text-2xl font-bold tabular-nums ${soon ? 'text-[#ff8a80]' : 'text-white'}`}>{ended ? (a.status === 'open' ? 'Clôture…' : 'Fini') : timeLeft(a.ends_at, now)}</div>
                                    <div className="mt-1 text-xs text-white/55">{soon ? 'Une offre maintenant rallonge de 2 min' : `${a.bids} offre${a.bids > 1 ? 's' : ''}`}</div>
                                </div>
                            </div>

                            <div className="mt-4">
                                {ended ? <Outcome a={a} /> : a.mine ? (
                                    <p className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/70">C'est ta vente : suis les offres en direct ci-dessous.</p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {a.leading ? (
                                            <p className="text-sm font-bold text-[#8ee6a8] flex items-center gap-1.5"><Crown className="w-4 h-4" />Tu mènes ! Si personne ne relance, la carte sera à toi.</p>
                                        ) : a.my_bid ? (
                                            <p className="text-sm font-bold text-[#ff8a80]">Quelqu'un t'a dépassé, tes {a.my_bid} pépites t'ont été rendues. Relance !</p>
                                        ) : null}
                                        {!(a.buyout && a.minBid >= a.buyout) && (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {quick.map(([label, v]) => (
                                                        <button key={label} type="button" onClick={() => setAmount(v)}
                                                            className={`px-3 py-1.5 rounded-full text-xs font-bold ring-1 ${Number(amount) === v ? 'bg-[#e9c46a] text-[#05130d] ring-[#e9c46a]' : 'bg-white/5 text-white/80 ring-white/10'}`}>
                                                            {label} · {v}
                                                        </button>
                                                    ))}
                                                </div>
                                                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); place({ amount: Number(amount) }, `Offre de ${amount} pépites placée !`); }}>
                                                    <label className="flex-1 min-w-0 flex items-center gap-1.5 px-4 rounded-full bg-black/30 ring-1 ring-white/15 focus-within:ring-[#e9c46a]/60">
                                                        <Nugget className="w-4 h-4 shrink-0" />
                                                        <input type="number" min={a.minBid} value={amount} onChange={(e) => setAmount(e.target.value)}
                                                            className="w-full min-w-0 bg-transparent py-2.5 text-base font-bold text-white outline-none tabular-nums" aria-label="Montant de l'offre" />
                                                    </label>
                                                    <button disabled={busy || Number(amount) < a.minBid} className="nd-btn px-5 py-2.5 rounded-full font-bold disabled:opacity-50 flex items-center gap-1.5">
                                                        <Gavel className="w-4 h-4" />{a.leading ? 'Relancer' : 'Enchérir'}
                                                    </button>
                                                </form>
                                            </>
                                        )}
                                        {a.buyout && (
                                            <button disabled={busy} onClick={() => place({ buyNow: true })}
                                                className="w-full py-2.5 rounded-full border border-[#e9c46a]/60 text-[#f4d88f] font-bold hover:bg-[#e9c46a]/10 disabled:opacity-50 flex items-center justify-center gap-1.5">
                                                <Zap className="w-4 h-4" />Achat immédiat · <Nugget className="w-4 h-4" />{a.buyout.toLocaleString('fr-FR')}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {message && <p className={`mt-2 text-sm font-semibold ${message[0] === 'error' ? 'text-[#ffb4a2]' : 'text-[#a8f0c6]'}`}>{message[1]}</p>}
                            </div>

                            <div className="mt-6">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">Historique des offres</h3>
                                {data.bids.length === 0 ? (
                                    <p className="mt-3 text-sm text-white/50">Personne n'a encore enchéri. Sois le premier !</p>
                                ) : (
                                    <ol className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                        <AnimatePresence initial={false}>
                                            {data.bids.map((b, i) => (
                                                <motion.li key={`${b.user}-${b.amount}-${b.at}`} layout initial={{ opacity: 0, x: -16, backgroundColor: 'rgba(233,196,106,0.25)' }}
                                                    animate={{ opacity: 1, x: 0, backgroundColor: i === 0 ? 'rgba(233,196,106,0.10)' : 'rgba(255,255,255,0.03)' }}
                                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${i === 0 ? 'ring-1 ring-[#e9c46a]/40' : ''}`}>
                                                    <span className={`grid place-items-center w-7 h-7 rounded-full text-xs font-black shrink-0 ${b.me ? 'bg-[#4fd18b] text-[#05130d]' : 'bg-white/10 text-white'}`}>{b.user.slice(0, 1).toUpperCase()}</span>
                                                    <span className="flex-1 min-w-0 truncate">
                                                        <b className={b.me ? 'text-[#8ee6a8]' : 'text-white'}>{b.me ? 'Toi' : b.user}</b>
                                                        {i === 0 && <Crown className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-[#e9c46a]" />}
                                                        <span className="block text-[11px] text-white/45">{ago(b.at, now)}</span>
                                                    </span>
                                                    <Amount nuggets={b.amount} className={i === 0 ? 'text-base' : 'text-sm opacity-70'} />
                                                </motion.li>
                                            ))}
                                        </AnimatePresence>
                                    </ol>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
