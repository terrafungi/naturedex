import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Crop, Gavel, KeyRound, Layers, LogOut, Package, Pencil } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import PatronBadge from '../components/PatronBadge.jsx';
import SeasonBadge, { SeasonHistory } from '../components/SeasonBadge.jsx';
import { defaultAvatar } from '../components/PlayerAvatar.jsx';
import AvatarStage, { StageTitle } from '../components/AvatarStage.jsx';
import { RARITIES } from '../game.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';

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

            {user.admin && (
                <Link to="/admin/cartes" className="mt-6 flex items-center gap-3 rounded-2xl nd-glass p-4 text-white font-semibold hover:bg-white/10">
                    <Crop className="w-5 h-5 text-[#e9c46a]" />Admin · cadrage des cartes
                    {user.framingReports > 0 && <span className="ml-auto px-2.5 py-0.5 rounded-full bg-[#ff6b6b] text-white text-xs font-bold">{user.framingReports} signalée{user.framingReports > 1 ? 's' : ''}</span>}
                </Link>
            )}

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

            <NotificationSettings />

            <PasswordForm />

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

const INPUT = 'mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400';

function PasswordForm() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    async function submit(e) {
        e.preventDefault();
        if (newPassword !== confirm) return setNote({ error: true, text: 'Les deux nouveaux mots de passe ne sont pas identiques.' });
        setBusy(true);
        setNote(null);
        try {
            await api('changePassword', { password, newPassword });
            setPassword(''); setNewPassword(''); setConfirm('');
            setNote({ text: 'Mot de passe changé. Tes autres appareils sont déconnectés.' });
        } catch (err) {
            setNote({ error: true, text: err.message });
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-white/70 hover:text-white hover:bg-white/5">
                <KeyRound className="w-5 h-5" />Changer de mot de passe
            </button>
        );
    }
    return (
        <form onSubmit={submit} className="mt-6 rounded-3xl nd-glass p-5 max-w-md">
            <h2 className="font-display text-xl text-white flex items-center gap-2"><KeyRound className="w-5 h-5 text-[#f4d88f]" />Changer de mot de passe</h2>
            <label className="block mt-4 text-sm text-white/70">Mot de passe actuel
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={INPUT} />
            </label>
            <label className="block mt-3 text-sm text-white/70">Nouveau mot de passe
                <input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className={INPUT} />
            </label>
            <label className="block mt-3 text-sm text-white/70">Nouveau mot de passe, encore une fois
                <input type="password" autoComplete="new-password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={INPUT} />
            </label>
            {note && <p className={`mt-3 text-sm ${note.error ? 'text-red-300' : 'text-emerald-300'}`}>{note.text}</p>}
            <div className="mt-4 flex gap-3">
                <button disabled={busy} className="nd-cta-glass px-5 py-3 rounded-full font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
                <button type="button" onClick={() => { setOpen(false); setNote(null); }} className="px-5 py-3 rounded-full font-semibold text-white/70 hover:text-white hover:bg-white/5">Annuler</button>
            </div>
        </form>
    );
}
