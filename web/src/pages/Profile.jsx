import { Link } from 'react-router-dom';
import { Coins, Layers, LogOut, Package } from 'lucide-react';
import { useGame } from '../api.jsx';
import { LeafLogo } from '../components/Layout.jsx';
import { RARITIES } from '../game.jsx';

export default function Profile() {
    const { user, catalog, owned, ownedInfo, logout } = useGame();
    const total = catalog?.total || user.total;
    const discovered = Object.keys(owned).length;
    const copies = Object.values(owned).reduce((a, n) => a + n, 0);
    const byRarity = Object.entries(RARITIES).reverse().map(([key, r]) => ({
        key, r,
        have: Object.values(ownedInfo).filter(([, rarity]) => rarity === key).length,
        total: Object.values(catalog?.types || {}).reduce((a, t) => a + (t[key] || 0), 0),
    }));
    const stats = [
        ['Espèces', discovered.toLocaleString('fr-FR')],
        ['Cartes', copies.toLocaleString('fr-FR')],
        ['Pièces', user.coins.toLocaleString('fr-FR')],
        ['Boosters', user.boosters],
    ];

    return (
        <div className="max-w-3xl mx-auto px-5 py-10">
            <div className="flex items-center gap-4">
                <span className="grid place-items-center w-16 h-16 rounded-full nd-glass"><LeafLogo className="w-9 h-9" /></span>
                <div className="min-w-0">
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Naturaliste</p>
                    <h1 className="font-display text-4xl font-medium text-white truncate">{user.username}</h1>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map(([label, value]) => (
                    <div key={label} className="rounded-2xl nd-glass p-4">
                        <div className="font-display text-3xl text-white">{value}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/50 mt-1">{label}</div>
                    </div>
                ))}
            </div>

            <div className="mt-6 rounded-3xl nd-glass p-5">
                <h2 className="font-display text-xl text-white">Collection : {discovered.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')}</h2>
                <ul className="mt-4 space-y-3">
                    {byRarity.map(({ key, r, have, total }) => (
                        <li key={key} className="flex items-center gap-3 text-sm">
                            <span className="w-28 font-semibold" style={{ color: r.color }}>{r.label}</span>
                            <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <span className="block h-full rounded-full" style={{ width: `${Math.max((have / Math.max(total, 1)) * 100, have ? 1 : 0)}%`, background: r.color }} />
                            </span>
                            <span className="w-24 text-right tabular-nums text-ink-soft">{have}/{total.toLocaleString('fr-FR')}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/collection" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Layers className="w-5 h-5 text-[#a8f0c6]" />Ma collection</Link>
                <Link to="/booster" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Package className="w-5 h-5 text-[#f4d88f]" />Boosters<Coins className="w-4 h-4 text-[#f4d88f]" /></Link>
                <button onClick={logout} className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white/70 hover:text-white hover:bg-white/5"><LogOut className="w-5 h-5" />Se déconnecter</button>
            </div>
        </div>
    );
}
