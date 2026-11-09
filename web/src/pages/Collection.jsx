import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigationType } from 'react-router-dom';
import { ChevronDown, Copy, FolderPlus, Frame, Pencil, Recycle, Search, Star, Trash2 } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { FavoriteStar } from '../components/Favorite.jsx';
import { IUCN, RARITIES, TYPES } from '../game.jsx';

const PAGE = 60;

// Filters, loaded cards and scroll position, so coming back from a card (« retour ») lands where you were.
let saved = null;

function Chip({ active, onClick, children, color }) {
    return (
        <button onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active ? 'text-paper border-transparent' : 'border-white/10 text-ink hover:bg-white/10'
            }`}
            style={active ? { background: color || 'linear-gradient(135deg,#10b981,#06b6d4)' } : {}}>
            {children}
        </button>
    );
}

// Most threatened first; « Non évaluée » = species never assessed by the IUCN.
const IUCN_ORDER = ['CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'EW', 'EX'];

function Select({ value, onChange, label, children, color }) {
    return (
        <label className="relative flex-1 min-w-[10rem] sm:flex-none">
            <span className="sr-only">{label}</span>
            <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
                className={`w-full appearance-none pl-4 pr-9 py-2 rounded-full bg-white/5 border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer [&>option]:bg-[#0b1f16] [&>option]:text-white ${value ? 'text-white' : 'text-ink'}`}
                style={{ borderColor: value ? color || '#4fd18b' : 'rgba(255,255,255,0.1)' }}>
                {children}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft" />
        </label>
    );
}

export default function Collection() {
    const { catalog, owned, ownedInfo, user, setUser, favs, setFavs, refreshCollection } = useGame();
    const restore = useRef(useNavigationType() === 'POP' ? saved : null).current;
    const [binder, setBinder] = useState(restore?.binder ?? null); // null = whole collection, 'all' = every favourite, or a binder id
    const [dupes, setDupes] = useState(restore?.dupes ?? false); // only the cards owned more than once
    const [type, setType] = useState(restore?.type ?? null);
    const [rarity, setRarity] = useState(restore?.rarity ?? null);
    const [iucn, setIucn] = useState(restore?.iucn ?? null);
    const [query, setQuery] = useState(restore?.query ?? '');
    const [debounced, setDebounced] = useState(restore?.query ?? '');
    const [page, setPage] = useState(restore?.page ?? null); // { cards, matches } for the current filters
    const skipFetch = useRef(!!restore?.page);
    const [loadingMore, setLoadingMore] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // The catalogue is far too big for the browser: the server sorts and filters, we fetch pages.
    // Only the player's own cards are listed; undiscovered ones stay hidden.
    const filters = useMemo(() => ({ binder, type, rarity, iucn, onlyOwned: true, duplicates: dupes, query: debounced }), [binder, dupes, type, rarity, iucn, debounced]);
    // inside a binder, starring or unstarring a card changes the list
    const favKey = binder ? favs.cards : null;
    useEffect(() => {
        if (skipFetch.current) { skipFetch.current = false; return undefined; }
        let alive = true;
        setPage(null);
        api('browse', { ...filters, offset: 0, limit: PAGE })
            .then((res) => alive && setPage(res))
            .catch(() => alive && setPage({ cards: [], matches: 0 }));
        return () => { alive = false; };
    }, [filters, owned, favKey]);

    useEffect(() => { saved = { ...saved, binder, dupes, type, rarity, iucn, query, page }; }, [binder, dupes, type, rarity, iucn, query, page]);
    // back from a card: return to the same spot, retrying for a moment while the grid grows tall enough
    // (and after the layout's scroll-to-top)
    useEffect(() => {
        if (!restore?.scrollY) return undefined;
        const until = Date.now() + 1500;
        let id;
        const tick = () => {
            window.scrollTo(0, restore.scrollY);
            if (Math.abs(window.scrollY - restore.scrollY) > 2 && Date.now() < until) id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(() => { id = requestAnimationFrame(tick); });
        const stop = () => cancelAnimationFrame(id); // the user scrolls on their own: let them
        window.addEventListener('wheel', stop, { once: true, passive: true });
        window.addEventListener('touchstart', stop, { once: true, passive: true });
        return () => { stop(); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); };
    }, [restore]);
    const remember = () => { saved = { ...saved, scrollY: window.scrollY }; };
    const showAll = () => { setBinder(null); setDupes(false); };

    async function loadMore() {
        setLoadingMore(true);
        try {
            const res = await api('browse', { ...filters, offset: page.cards.length, limit: PAGE });
            setPage({ matches: res.matches, cards: [...page.cards, ...res.cards] });
        } finally {
            setLoadingMore(false);
        }
    }

    const duplicates = useMemo(() => {
        let count = 0, coins = 0, cards = 0;
        for (const [id, n] of Object.entries(owned)) {
            const extra = n - 1;
            const [type, rarity] = ownedInfo[id] || [];
            // Naturalistes are kept for the Duel deck (up to 4 copies): recycled one by one only
            if (extra > 0 && type !== 'naturalist') { count += extra; cards += 1; coins += extra * (user.recycleValue?.[rarity] || 0); }
        }
        return { count, coins, cards };
    }, [owned, ownedInfo, user.recycleValue]);

    const favCount = useMemo(() => Object.keys(favs.cards).filter((id) => owned[id]).length, [favs.cards, owned]);
    const current = favs.binders.find((b) => b.id === binder);
    useEffect(() => { if (typeof binder === 'number' && !current) setBinder(null); }, [binder, current]);

    async function binderAction(action, params) {
        try {
            const { id, ...state } = await api(action, params);
            setFavs(state);
            return id;
        } catch (err) {
            setMessage(err.message);
        }
    }
    async function newBinder() {
        const name = window.prompt('Nom du nouveau classeur (ex. Plantes, Mes requins…)');
        if (name?.trim()) { const id = await binderAction('createBinder', { name }); if (id) setBinder(id); }
    }
    async function renameBinder() {
        const name = window.prompt('Nouveau nom du classeur', current.name);
        if (name?.trim() && name.trim() !== current.name) await binderAction('renameBinder', { id: current.id, name });
    }
    async function deleteBinder() {
        if (window.confirm(`Supprimer le classeur « ${current.name} » ? Les cartes restent dans ta collection.`)) await binderAction('deleteBinder', { id: current.id });
    }

    async function recycleAll() {
        const n = duplicates.count;
        if (!window.confirm(`Recycler ${n} doublon${n > 1 ? 's' : ''} (${duplicates.cards} carte${duplicates.cards > 1 ? 's' : ''}) contre ${duplicates.coins} pépites ? Tu gardes un exemplaire de chaque carte. Cette action est irréversible.`)) return;
        const res = await api('recycle');
        setUser(res.user);
        await refreshCollection();
        setMessage(`${res.recycled} doublon${res.recycled > 1 ? 's' : ''} recyclé${res.recycled > 1 ? 's' : ''} : +${res.nuggets} pépites`);
    }

    if (!catalog) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Collection</p>
                    <h1 className="font-display text-4xl font-semibold text-white mt-1">
                        {Object.keys(owned).length} <span className="text-ink-soft font-medium text-2xl">/ {catalog.total.toLocaleString('fr-FR')}</span>
                    </h1>
                </div>
                {duplicates.count > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {!dupes && (
                            <button onClick={() => { setBinder(null); setDupes(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/15 text-white text-sm font-semibold hover:bg-white/10">
                                <Copy className="w-4 h-4" /> Voir les doublons
                            </button>
                        )}
                        <button onClick={recycleAll} className="flex items-center gap-2 px-4 py-2.5 rounded-full nd-btn text-sm font-semibold">
                            <Recycle className="w-4 h-4" /> Recycler {duplicates.count} doublon{duplicates.count > 1 ? 's' : ''} · +{duplicates.coins} pépites
                        </button>
                    </div>
                )}
            </div>
            {message && <p className="mt-3 text-sm font-semibold text-white">{message}</p>}

            <div className="mt-8 space-y-3">
                <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-white/10">
                    <Chip active={binder === null && !dupes} onClick={showAll}>Toute la collection</Chip>
                    {(duplicates.count > 0 || dupes) && (
                        <Chip active={dupes} onClick={() => (dupes ? showAll() : (setBinder(null), setDupes(true)))}><Copy className="w-3.5 h-3.5" />Doublons · {duplicates.cards}</Chip>
                    )}
                    <Chip active={binder === 'all'} color="#c9a227" onClick={() => { setDupes(false); setBinder('all'); }}><Star className="w-3.5 h-3.5 fill-current" />Favoris · {favCount}</Chip>
                    {favs.binders.map((b) => (
                        <Chip key={b.id} active={binder === b.id} color="#c9a227" onClick={() => { setDupes(false); setBinder(binder === b.id ? null : b.id); }}>{b.name} · {b.count}</Chip>
                    ))}
                    <button onClick={newBinder} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-white/25 text-white/80 hover:bg-white/10">
                        <FolderPlus className="w-3.5 h-3.5" />Nouveau classeur
                    </button>
                    {binder && (
                        <span className="ml-auto flex items-center gap-1">
                            <Link to={`/vitrine?classeur=${binder}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold nd-cta-gold">
                                <Frame className="w-3.5 h-3.5" />Créer une vitrine
                            </Link>
                            {current && <>
                                <button onClick={renameBinder} className="grid place-items-center w-8 h-8 rounded-full hover:bg-white/10 text-white/80" title="Renommer le classeur" aria-label="Renommer le classeur"><Pencil className="w-4 h-4" /></button>
                                <button onClick={deleteBinder} className="grid place-items-center w-8 h-8 rounded-full hover:bg-white/10 text-white/80" title="Supprimer le classeur" aria-label="Supprimer le classeur"><Trash2 className="w-4 h-4" /></button>
                            </>}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full lg:w-auto lg:flex-1 lg:max-w-sm">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, ou mot de la description…" type="search"
                            className="w-full pl-9 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <Select label="Type" value={type} onChange={setType} color={TYPES[type]?.color}>
                        <option value="">Tous les types</option>
                        {Object.entries(TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
                    </Select>
                    <Select label="Rareté" value={rarity} onChange={setRarity} color={RARITIES[rarity]?.color}>
                        <option value="">Toutes les raretés</option>
                        {Object.entries(RARITIES).map(([key, r]) => <option key={key} value={key}>{r.symbol} {r.label}</option>)}
                    </Select>
                    <Select label="Statut de conservation" value={iucn} onChange={setIucn} color={IUCN[iucn]?.color}>
                        <option value="">Tous les statuts (UICN)</option>
                        {IUCN_ORDER.map((key) => <option key={key} value={key}>{IUCN[key].label}</option>)}
                        <option value="NE">Non évaluée</option>
                    </Select>
                    {(type || rarity || iucn || query) && (
                        <button onClick={() => { setType(null); setRarity(null); setIucn(null); setQuery(''); }} className="px-3 py-2 text-xs font-semibold text-ink-soft hover:text-white underline">Effacer les filtres</button>
                    )}
                </div>
            </div>

            {!page && <div className="py-20 text-center font-display text-lg text-ink-soft">Chargement…</div>}
            {page && (
                <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                    {page.cards.map((c) => (
                        <Link key={c.id} to={`/carte/${c.id}`} state={{ fromCollection: true }} onClick={remember} className="relative block transition-transform hover:-translate-y-1">
                            <Card card={c} number={c.num} total={catalog.total} frame={user?.avatar?.frame} />
                            {c.count > 1 && (
                                <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[#04150d] text-xs font-bold shadow-lg shadow-emerald-500/30">×{c.count}</span>
                            )}
                            <FavoriteStar card={c} className="absolute -bottom-2 -left-2 z-10 !w-8 !h-8" />
                        </Link>
                    ))}
                </div>
            )}
            {page?.matches === 0 && (binder ? (
                <p className="py-20 text-center text-ink-soft">{binder === 'all' && !favs.binders.length
                    ? <>Aucun favori pour l'instant. Touche l'étoile <Star className="inline w-4 h-4 -mt-1" /> d'une carte pour la ranger dans un classeur.</>
                    : <>Aucune carte ici{type || rarity || iucn || debounced ? ' avec ces filtres' : ''}. Touche l'étoile <Star className="inline w-4 h-4 -mt-1" /> d'une carte pour l'ajouter.</>}</p>
            ) : dupes ? (
                <p className="py-20 text-center text-ink-soft">Aucun doublon{type || rarity || iucn || debounced ? ' avec ces filtres' : ''}.</p>
            ) : Object.keys(owned).length ? (
                <p className="py-20 text-center text-ink-soft">Aucune de tes cartes ne correspond à ces filtres.</p>
            ) : (
                <div className="py-20 text-center">
                    <p className="text-ink-soft">Ta collection est vide pour l'instant.</p>
                    <Link to="/booster" className="mt-4 inline-block nd-cta-gold px-5 py-2.5 rounded-full text-sm font-bold">Ouvrir un booster</Link>
                </div>
            ))}
            {page && page.matches > page.cards.length && (
                <div className="mt-10 text-center">
                    <button onClick={loadMore} disabled={loadingMore} className="px-6 py-3 rounded-full border border-white/10 text-white font-semibold hover:bg-white/10 disabled:opacity-60">
                        {loadingMore ? 'Chargement…' : `Afficher plus (${(page.matches - page.cards.length).toLocaleString('fr-FR')} restantes)`}
                    </button>
                </div>
            )}
        </div>
    );
}
