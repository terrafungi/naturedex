import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Recycle, Search } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card, MysteryCard } from '../components/Card.jsx';
import { RARITIES, TYPES } from '../game.jsx';

const PAGE = 60;

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

export default function Collection() {
    const { catalog, owned, user, setUser, refreshCollection } = useGame();
    const [type, setType] = useState(null);
    const [rarity, setRarity] = useState(null);
    const [onlyOwned, setOnlyOwned] = useState(false);
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(PAGE);
    const [message, setMessage] = useState('');

    // Stable card numbers: catalog order (type, then popularity).
    const numbered = useMemo(() => (catalog || []).map((c, i) => ({ ...c, number: i + 1 })), [catalog]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return numbered
            .filter((c) => (!type || c.type === type) && (!rarity || c.rarity === rarity) && (!onlyOwned || owned[c.id]))
            .filter((c) => !q || (owned[c.id] && (c.name.toLowerCase().includes(q) || c.sci_name?.toLowerCase().includes(q))))
            .sort((a, b) => !owned[a.id] - !owned[b.id] || RARITIES[b.rarity].order - RARITIES[a.rarity].order || a.number - b.number);
    }, [numbered, type, rarity, onlyOwned, query, owned]);

    const duplicates = useMemo(() => {
        let count = 0, coins = 0;
        for (const c of numbered) {
            const extra = (owned[c.id] || 0) - 1;
            if (extra > 0) { count += extra; coins += extra * (user.recycleValue?.[c.rarity] || 0); }
        }
        return { count, coins };
    }, [numbered, owned, user.recycleValue]);

    async function recycleAll() {
        const res = await api('recycle');
        setUser(res.user);
        await refreshCollection();
        setMessage(`${res.recycled} doublon${res.recycled > 1 ? 's' : ''} recyclé${res.recycled > 1 ? 's' : ''} : +${res.coins} pièces`);
    }

    if (!catalog) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Collection</p>
                    <h1 className="font-display text-4xl font-black text-white mt-1">
                        {Object.keys(owned).length} <span className="text-ink-soft font-medium text-2xl">/ {catalog.length}</span>
                    </h1>
                </div>
                {duplicates.count > 0 && (
                    <button onClick={recycleAll} className="flex items-center gap-2 px-4 py-2.5 rounded-full nd-btn text-sm font-semibold">
                        <Recycle className="w-4 h-4" /> Recycler {duplicates.count} doublon{duplicates.count > 1 ? 's' : ''} · +{duplicates.coins} pièces
                    </button>
                )}
            </div>
            {message && <p className="mt-3 text-sm font-semibold text-white">{message}</p>}

            <div className="mt-8 space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Chip active={!type} onClick={() => setType(null)}>Tous les types</Chip>
                    {Object.entries(TYPES).map(([key, t]) => (
                        <Chip key={key} active={type === key} color={t.color} onClick={() => setType(type === key ? null : key)}>
                            <t.Icon className="w-3.5 h-3.5" />{t.label}
                        </Chip>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Chip active={!rarity} onClick={() => setRarity(null)}>Toutes raretés</Chip>
                    {Object.entries(RARITIES).map(([key, r]) => (
                        <Chip key={key} active={rarity === key} color={r.color} onClick={() => setRarity(rarity === key ? null : key)}>
                            {r.symbol} {r.label}
                        </Chip>
                    ))}
                    <label className="ml-auto flex items-center gap-2 text-sm font-semibold cursor-pointer">
                        <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} className="accent-emerald-400 w-4 h-4" />
                        Seulement mes cartes
                    </label>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une carte…"
                            className="pl-9 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                {filtered.slice(0, limit).map((c) => (
                    <Link key={c.id} to={`/carte/${c.id}`} className="relative block transition-transform hover:-translate-y-1">
                        {owned[c.id] ? <Card card={c} number={c.number} total={catalog.length} /> : <MysteryCard card={c} number={c.number} />}
                        {owned[c.id] > 1 && (
                            <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[#04150d] text-xs font-bold shadow-lg shadow-emerald-500/30">×{owned[c.id]}</span>
                        )}
                    </Link>
                ))}
            </div>
            {filtered.length === 0 && <p className="py-20 text-center text-ink-soft">Aucune carte ne correspond à ces filtres.</p>}
            {filtered.length > limit && (
                <div className="mt-10 text-center">
                    <button onClick={() => setLimit(limit + PAGE)} className="px-6 py-3 rounded-full border border-white/10 text-white font-semibold hover:bg-white/10">
                        Afficher plus ({filtered.length - limit} restantes)
                    </button>
                </div>
            )}
        </div>
    );
}
