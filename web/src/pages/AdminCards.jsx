import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Crop, Search, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { RARITIES, TYPES } from '../game.jsx';
import { FramingEditor } from './CardPage.jsx';

const PAGE = 60;
const ARTS = { plain: 'Photo classique', holo: 'Holographique', full: 'Full art', illus: 'Illustration', gold: 'Gold' };
const SELECT = 'appearance-none px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#e9c46a] [&>option]:bg-[#0b1f16]';

// Staff only: every card of the game, owned or not, to fix badly framed pictures. Nothing here touches the collection.
export default function AdminCards() {
    const { user, catalog } = useGame();
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [type, setType] = useState('');
    const [rarity, setRarity] = useState('');
    const [art, setArt] = useState('');
    const [framed, setFramed] = useState('');
    const [page, setPage] = useState(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // { card, draft }

    useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(t); }, [query]);
    const filters = { query: debounced, type: type || null, rarity: rarity || null, art: art || null, framed: framed || null };
    useEffect(() => {
        if (!user?.admin) return;
        setPage(null);
        api('adminCards', { ...filters, limit: PAGE }).then(setPage).catch((err) => setError(err.message));
    }, [user?.admin, debounced, type, rarity, art, framed]);

    if (!user?.admin) return <Navigate to="/" replace />;

    async function more() {
        const next = await api('adminCards', { ...filters, limit: PAGE, offset: page.cards.length });
        setPage({ matches: page.matches, cards: [...page.cards, ...next.cards] });
    }
    function open(card) {
        setEditing({ card, draft: { x: card.focus?.[0] ?? 50, y: card.focus?.[1] ?? 50, zoom: Number(card.zoom) || 1 } });
    }
    function saved(stats) {
        if (stats) {
            const id = editing.card.id;
            setPage({ ...page, cards: page.cards.map((c) => (c.id === id ? { ...c, focus: stats.focus || null, zoom: stats.zoom || null } : c)) });
        }
        setEditing(null);
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-10">
            <h1 className="flex items-center gap-3 font-display text-4xl text-white"><Crop className="w-8 h-8 text-[#e9c46a]" />Admin · cadrage des cartes</h1>
            <p className="mt-2 text-ink-soft">Toutes les cartes du jeu, même celles que tu ne possèdes pas. Clique sur une carte pour retoucher son image : rien n'est ajouté à ta collection.</p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 px-4 rounded-full bg-white/5 border border-white/10 focus-within:ring-2 focus-within:ring-[#e9c46a] flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-ink-soft" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom de la carte…" className="flex-1 bg-transparent py-2 text-sm text-white outline-none" />
                </label>
                <select value={art} onChange={(e) => setArt(e.target.value)} className={SELECT}>
                    <option value="">Toutes les finitions</option>
                    {Object.entries(ARTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={rarity} onChange={(e) => setRarity(e.target.value)} className={SELECT}>
                    <option value="">Toutes les raretés</option>
                    {Object.entries(RARITIES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                </select>
                <select value={type} onChange={(e) => setType(e.target.value)} className={SELECT}>
                    <option value="">Tous les types</option>
                    {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                </select>
                <select value={framed} onChange={(e) => setFramed(e.target.value)} className={SELECT}>
                    <option value="">Cadrées ou non</option>
                    <option value="no">Jamais recadrées</option>
                    <option value="yes">Déjà recadrées</option>
                </select>
            </div>

            {error && <p className="mt-6 text-rust font-semibold">{error}</p>}
            {!page ? <p className="py-20 text-center font-display text-xl text-ink-soft">Chargement…</p> : (
                <>
                    <p className="mt-5 text-sm text-ink-soft">{page.matches.toLocaleString('fr-FR')} carte{page.matches > 1 ? 's' : ''}</p>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {page.cards.map((c) => (
                            <button key={c.id} onClick={() => open(c)} className="relative text-left rounded-[4%] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a]">
                                <Card card={c} number={c.num} total={catalog?.total} />
                                {c.focus && <span className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded-full bg-[#e9c46a] text-[#2a1d05] text-[10px] font-black uppercase">Recadrée</span>}
                            </button>
                        ))}
                    </div>
                    {page.cards.length < page.matches && (
                        <button onClick={more} className="mt-8 mx-auto block nd-btn px-6 py-2.5 rounded-full text-sm font-semibold">Voir plus</button>
                    )}
                </>
            )}

            {editing && (
                <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                    <div className="relative w-full max-w-sm rounded-3xl nd-glass p-5 my-8">
                        <button onClick={() => setEditing(null)} aria-label="Fermer" className="absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full text-white/70 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
                        <h2 className="mb-4 pr-10 font-display text-xl text-white">{editing.card.name}</h2>
                        <FramingEditor card={editing.card} number={editing.card.num} total={catalog?.total} draft={editing.draft}
                            setDraft={(draft) => setEditing((e) => ({ ...e, draft }))} onDone={saved} />
                    </div>
                </div>
            )}
        </div>
    );
}
