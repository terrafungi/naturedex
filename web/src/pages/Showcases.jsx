import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Crown, Flame, Frame, Globe2, Trophy, Users } from 'lucide-react';
import { api } from '../api.jsx';
import { ShowcaseThumb, VoteButton } from '../components/Showcase.jsx';
import SeasonBadge from '../components/SeasonBadge.jsx';

const profile = (name) => `/joueur/${encodeURIComponent(name)}`;

const SORTS = [
    { key: 'recent', label: 'Récentes', Icon: Clock, text: 'Les dernières vitrines créées ou modifiées par les joueurs.' },
    { key: 'week', label: 'Top semaine', Icon: Flame, text: 'Les vitrines qui ont reçu le plus de ♥ ces 7 derniers jours.' },
    { key: 'all', label: 'Top de tous les temps', short: 'Top absolu', Icon: Trophy, text: 'Les vitrines les plus aimées depuis toujours.' },
];
const MEDALS = ['#e9c46a', '#c3ccd8', '#cd8a4a'];

function Pill({ active, onClick, children }) {
    return (
        <button onClick={onClick}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${active ? 'bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/30' : 'text-white/70 bg-white/5 hover:bg-white/10'}`}>
            {children}
        </button>
    );
}

function Tile({ s, rank, onError }) {
    const medal = rank && rank <= 3 ? MEDALS[rank - 1] : null;
    return (
        <li className="min-w-0 flex flex-col">
            <Link to={profile(s.username)} className="relative block rounded-2xl overflow-hidden shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] transition hover:-translate-y-0.5"
                style={{ boxShadow: medal ? `0 0 0 3px ${medal}` : undefined }}>
                <ShowcaseThumb showcase={s} username={s.username} />
                {rank && (
                    <span className="absolute top-2 left-2 grid place-items-center min-w-8 h-8 px-1.5 rounded-full font-display text-base font-semibold shadow"
                        style={medal ? { background: medal, color: '#2a1c00' } : { background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
                        {rank === 1 ? <Crown className="w-4 h-4" /> : rank}
                    </span>
                )}
            </Link>
            <div className="mt-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <Link to={profile(s.username)} className={`flex items-center gap-1 text-sm font-semibold hover:underline ${s.me ? 'text-[#a8f0c6]' : 'text-white'}`}>
                        <span className="truncate min-w-0">{s.username}{s.me && ' (toi)'}</span><SeasonBadge badge={s.badge} compact />
                    </Link>
                    {s.title && <p className="text-xs text-ink-soft truncate">{s.title}</p>}
                </div>
                <VoteButton username={s.username} votes={s.votes} voted={s.voted} mine={s.me} onError={onError} className="shrink-0 !px-2.5 !py-1 !text-xs" />
            </div>
        </li>
    );
}

export default function Showcases() {
    const [sort, setSort] = useState('recent');
    const [scope, setScope] = useState('all');
    const [data, setData] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const current = SORTS.find((s) => s.key === sort);

    useEffect(() => {
        let live = true;
        setError('');
        api('showcases', { sort, scope })
            .then((r) => live && setData(r))
            .catch((e) => live && setError(e.message));
        return () => { live = false; };
    }, [sort, scope]);

    useEffect(() => {
        if (!note) return undefined;
        const t = setTimeout(() => setNote(''), 5000);
        return () => clearTimeout(t);
    }, [note]);

    async function more() {
        setLoadingMore(true);
        try {
            const r = await api('showcases', { sort, scope, offset: data.showcases.length });
            setData((d) => ({ ...r, showcases: [...d.showcases, ...r.showcases] }));
        } catch (e) { setNote(e.message); } finally { setLoadingMore(false); }
    }

    const fresh = data && data.sort === sort && data.scope === scope;
    const list = fresh ? data.showcases : [];
    const ranked = sort !== 'recent';

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Vitrines</p>
                    <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Les vitrines des joueurs</h1>
                </div>
                <Link to="/vitrine" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold bg-[#e9c46a] text-[#2a1c00] hover:brightness-110">
                    <Frame className="w-4 h-4" />Ma vitrine
                </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
                {SORTS.map(({ key, label, short, Icon }) => (
                    <Pill key={key} active={sort === key} onClick={() => setSort(key)}>
                        <Icon className="w-4 h-4" />{short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
                    </Pill>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <Pill active={scope === 'all'} onClick={() => setScope('all')}><Globe2 className="w-4 h-4" />Tous les joueurs</Pill>
                <Pill active={scope === 'friends'} onClick={() => setScope('friends')}><Users className="w-4 h-4" />Mes amis</Pill>
            </div>
            <p className="mt-4 text-sm text-ink-soft">{current.text} Touche ♥ pour voter pour tes préférées (30 votes par jour, un par vitrine).</p>

            {note && <p role="status" className="mt-4 p-3 rounded-2xl bg-[#e07a5f]/15 ring-1 ring-[#e07a5f]/30 text-sm text-[#ffc2ae]">{note}</p>}
            {error && <p className="mt-6 text-sm font-semibold text-rust">{error}</p>}
            {!fresh && !error && <p className="mt-10 text-center text-ink-soft">Chargement…</p>}

            {fresh && list.length === 0 && (
                <div className="mt-10 text-center text-ink-soft">
                    <p>{scope === 'friends' ? 'Aucun de tes amis n\'a encore de vitrine.' : 'Aucune vitrine pour l\'instant.'}</p>
                    <Link to="/vitrine" className="mt-3 inline-block font-semibold text-[#a8f0c6] hover:underline">Crée la première !</Link>
                </div>
            )}

            {list.length > 0 && (
                <ul className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 items-start">
                    {list.map((s, i) => <Tile key={s.username} s={s} rank={ranked && s.votes > 0 ? i + 1 : null} onError={setNote} />)}
                </ul>
            )}

            {fresh && data.more && (
                <div className="mt-10 text-center">
                    <button onClick={more} disabled={loadingMore}
                        className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/15 text-white/85 hover:bg-white/10 disabled:opacity-60">
                        {loadingMore ? 'Chargement…' : 'Afficher plus'}
                    </button>
                </div>
            )}
        </div>
    );
}
