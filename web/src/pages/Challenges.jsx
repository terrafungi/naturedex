import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { ChallengeCard } from '../components/Challenge.jsx';
import { sfx } from '../sfx.js';
import { Amount } from '../components/Currency.jsx';

export default function Challenges() {
    const { setUser } = useGame();
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { api('challenges').then(setData).catch((e) => setError(e.message)); }, []);

    async function claim(key) {
        setBusy(true);
        setError('');
        try {
            const res = await api('claimChallenge', { key });
            sfx.coin();
            setUser(res.user);
            setData(res);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const left = data?.challenges.filter((c) => !c.claimed).reduce((sum, c) => sum + c.reward, 0) || 0;
    const date = data && new Date(`${data.day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div className="max-w-4xl mx-auto px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">{date || 'Aujourd\'hui'}</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Défis du jour</h1>
            <p className="mt-3 text-ink-soft max-w-xl">
                Quatre nouveaux défis chaque jour à minuit. Ils avancent avec les cartes que tu tires dans tes boosters.
                {left > 0 && <> Encore <Amount seeds={left} /> graines à gagner aujourd'hui.</>}
            </p>
            {error && <p className="mt-4 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
            {!data ? (
                <div className="py-20 text-center font-display text-lg text-ink-soft">Chargement…</div>
            ) : (
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.challenges.map((c) => <ChallengeCard key={c.key} challenge={c} onClaim={claim} busy={busy} />)}
                </div>
            )}
            <Link to="/booster" className="nd-cta-gold mt-10 inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold">
                <Package className="w-5 h-5" />Ouvrir un booster
            </Link>
        </div>
    );
}
