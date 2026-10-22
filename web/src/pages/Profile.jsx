import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Gavel, Layers, LogOut, Package, Pencil } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import PatronBadge from '../components/PatronBadge.jsx';
import SeasonBadge, { SeasonHistory } from '../components/SeasonBadge.jsx';
import { defaultAvatar } from '../components/PlayerAvatar.jsx';
import AvatarStage, { StageTitle } from '../components/AvatarStage.jsx';
import { RARITIES } from '../game.jsx';

export default function Profile() {
    const { user, catalog, owned, ownedInfo, logout } = useGame();
    const [me, setMe] = useState(null);
    useEffect(() => { api('player', { username: user.username }).then((r) => setMe(r.player)).catch(() => {}); }, [user.username]);
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
        ['Graines', user.coins.toLocaleString('fr-FR')],
        ['Pépites', user.nuggets.toLocaleString('fr-FR')],
    ];

    return (
        <div className="max-w-3xl mx-auto px-5 py-10">
            <AvatarStage avatar={user.avatar || defaultAvatar(user.username)} height={400} className="shadow-2xl shadow-black/40">
                <StageTitle kicker="Naturaliste" name={user.username}>
                    <SeasonBadge badge={me?.badge} className="mt-2" />{user.pass && <PatronBadge className="mt-2" />}
                </StageTitle>
                <Link to="/avatar" aria-label="Personnaliser mon avatar" className="absolute top-4 right-4 grid place-items-center w-11 h-11 rounded-full bg-[#4fd18b] text-[#05130d] shadow-lg shadow-black/30">
                    <Pencil className="w-5 h-5" />
                </Link>
            </AvatarStage>

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

            {me && <div className="mt-6"><SeasonHistory seasons={me.seasons} /></div>}

            <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/collection" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Layers className="w-5 h-5 text-[#a8f0c6]" />Ma collection</Link>
                <Link to="/booster" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Package className="w-5 h-5 text-[#f4d88f]" />Boosters</Link>
                <Link to="/trophees" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Award className="w-5 h-5 text-[#f4d88f]" />Trophées</Link>
                <Link to="/encheres" className="nd-cta-glass inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white"><Gavel className="w-5 h-5 text-[#f4d88f]" />Enchères</Link>
                <button onClick={logout} className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white/70 hover:text-white hover:bg-white/5"><LogOut className="w-5 h-5" />Se déconnecter</button>
            </div>
        </div>
    );
}
