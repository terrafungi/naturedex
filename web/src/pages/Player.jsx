import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, UserPlus } from 'lucide-react';
import { api } from '../api.jsx';
import { LeafLogo } from '../components/Layout.jsx';
import SeasonBadge, { SeasonHistory } from '../components/SeasonBadge.jsx';

const n = (v) => Number(v || 0).toLocaleString('fr-FR');

export default function Player() {
    const { username } = useParams();
    const [player, setPlayer] = useState(null);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        let live = true;
        setPlayer(null); setError(''); setNote('');
        api('player', { username }).then((r) => live && setPlayer(r.player)).catch((e) => live && setError(e.message));
        return () => { live = false; };
    }, [username]);

    async function addFriend() {
        try {
            const r = await api('friendRequest', { username: player.username });
            setPlayer((p) => ({ ...p, friendship: r.status }));
            setNote(r.status === 'accepted' ? `Toi et ${r.username} êtes maintenant amis !` : `Demande envoyée à ${r.username}.`);
        } catch (e) { setNote(e.message); }
    }

    if (error) return <div className="max-w-3xl mx-auto px-5 py-16 text-center text-rust font-semibold">{error}</div>;
    if (!player) return <div className="max-w-3xl mx-auto px-5 py-16 text-center text-ink-soft">Chargement…</div>;

    const games = (player.wins || 0) + (player.losses || 0);
    const stats = [
        ['Espèces', n(player.discovered)],
        ['Cartes', n(player.owned)],
        ['Trophées', n(player.trophies)],
        ['Cote d\'arène', games ? n(player.rating) : '—'],
    ];
    return (
        <div className="max-w-3xl mx-auto px-5 py-10">
            <button onClick={() => history.back()} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"><ArrowLeft className="w-4 h-4" />Retour</button>
            <div className="mt-4 flex items-center gap-4">
                <span className="grid place-items-center w-16 h-16 shrink-0 rounded-full nd-glass"><LeafLogo className="w-9 h-9" /></span>
                <div className="min-w-0">
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Naturaliste depuis {new Date(player.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                    <h1 className="font-display text-4xl font-medium text-white truncate">{player.username}</h1>
                    <SeasonBadge badge={player.badge} className="mt-2" />
                </div>
            </div>

            {!player.me && (
                <div className="mt-6 flex flex-wrap gap-3">
                    {player.friendship === 'accepted'
                        ? <Link to={`/messages/${encodeURIComponent(player.username)}`} className="nd-cta-glass inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-white"><MessageCircle className="w-5 h-5 text-[#a8f0c6]" />Écrire</Link>
                        : player.friendship === 'pending'
                            ? <span className="px-5 py-2.5 rounded-full text-sm font-semibold text-white/60 ring-1 ring-white/15">Demande d'ami en attente</span>
                            : <button onClick={addFriend} className="nd-cta-glass inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-white"><UserPlus className="w-5 h-5 text-[#a8f0c6]" />Ajouter en ami</button>}
                </div>
            )}
            {note && <p className="mt-3 text-sm font-semibold text-[#a8f0c6]">{note}</p>}

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map(([label, value]) => (
                    <div key={label} className="rounded-2xl nd-glass p-4">
                        <div className="font-display text-3xl text-white">{value}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/50 mt-1">{label}</div>
                    </div>
                ))}
            </div>
            <p className="mt-3 text-sm text-ink-soft">
                {n(player.battleWins)} combat{player.battleWins > 1 ? 's' : ''} gagné{player.battleWins > 1 ? 's' : ''}
                {games > 0 && <> · saison en cours : {player.wins} V / {player.losses} D</>}
                {player.campaign > 0 && <> · campagne : étape {player.campaign}</>}
            </p>

            <div className="mt-6"><SeasonHistory seasons={player.seasons} /></div>
        </div>
    );
}
