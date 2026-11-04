import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Award, Brain, Crown, EyeOff, Gem, HeartHandshake, Layers, Medal, Users, Globe2, Swords } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.jsx';
import PlayerAvatar from '../components/PlayerAvatar.jsx';
import SeasonBadge from '../components/SeasonBadge.jsx';

const profile = (name) => `/joueur/${encodeURIComponent(name)}`;

const n = (v) => Number(v).toLocaleString('fr-FR');
const plural = (v, word) => `${n(v)} ${word}${v > 1 ? 's' : ''}`;
const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });
const score = (board, v) => (board.format ? board.format(v) : n(v));

// `unit` labels the score, `extra` the tie-breaker shown under the name.
const BOARDS = [
    { key: 'quiz', label: 'Quiz', Icon: Brain, unit: 'bonnes réponses', text: 'Total des bonnes réponses dans tous les modes du quiz (Classique, Défi du jour, Survie, Blitz). À égalité, le plus de quiz parfaits passe devant.', extra: (v) => v ? plural(v, 'quiz parfait') : null },
    { key: 'species', label: 'Espèces', Icon: Layers, unit: 'espèces', text: 'Nombre d\'espèces différentes découvertes dans le carnet.', extra: (v) => plural(v, 'carte') },
    { key: 'cards', label: 'Cartes', Icon: Gem, unit: 'cartes', text: 'Nombre total de cartes possédées, doublons compris.', extra: (v) => plural(v, 'espèce') },
    { key: 'prestige', label: 'Prestige', Icon: Crown, unit: 'points', text: 'Chaque espèce découverte rapporte des points selon sa rareté : Peu commune 1, Rare 3, Épique 8, Légendaire 25, Secrète 100.', extra: (v) => v ? plural(v, 'légendaire') : null },
    { key: 'arena', label: 'Arène', Icon: Swords, unit: 'points', text: 'Cote de l\'arène classée : +/− selon la force de l\'adversaire battu ou perdu (départ à 1000).', extra: (v) => plural(v, 'victoire') },
    { key: 'trophies', label: 'Trophées', Icon: Award, unit: 'trophées', text: 'Nombre de trophées récupérés.', extra: () => null },
    { key: 'donors', label: 'Donateurs', Icon: HeartHandshake, unit: 'donnés', format: euros, text: '20 % de chaque achat en boutique est reversé à l\'association choisie (LPO ou Wikipédia). Classement du mois par montant reversé, remis à zéro le 1er de chaque mois.', extra: (v, r) => [plural(v, 'achat'), r.assoc].filter(Boolean).join(' · ') },
];
const PODIUM = ['#e9c46a', '#c3ccd8', '#cd8a4a'];

function Pill({ active, onClick, children }) {
    return (
        <button onClick={onClick}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${active ? 'bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/30' : 'text-white/70 bg-white/5 hover:bg-white/10'}`}>
            {children}
        </button>
    );
}

const AVATAR_SIZES = { 'w-16': 64, 'w-12': 48, 'w-9': 36 };
function Avatar({ name, color, size = 'w-10' }) {
    return <PlayerAvatar name={name} size={AVATAR_SIZES[size.split(' ')[0]] || 40} ring={color} />;
}

// 2nd · 1st · 3rd, the winner standing tallest.
function Podium({ rows, board }) {
    const order = [rows[1], rows[0], rows[2]];
    const heights = ['h-20', 'h-28', 'h-14'];
    return (
        <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-xl mx-auto">
            {order.map((r, i) => r ? (
                <motion.div key={r.username} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: [0.15, 0, 0.3][i] }}
                    className="flex flex-col items-center min-w-0">
                    {r.rank === 1 && <Crown className="w-6 h-6 text-[#e9c46a] mb-1" />}
                    <Avatar name={r.username} color={PODIUM[r.rank - 1] || PODIUM[2]} size={r.rank === 1 ? 'w-16 h-16 text-2xl' : 'w-12 h-12 text-lg'} />
                    <Link to={profile(r.username)} className={`mt-2 max-w-full flex items-center gap-1 text-sm font-semibold hover:underline ${r.me ? 'text-[#a8f0c6]' : 'text-white'}`}>
                        <span className="truncate min-w-0">{r.username}{r.me && ' (toi)'}</span><SeasonBadge badge={r.badge} compact />
                    </Link>
                    <p className="text-xs text-ink-soft tabular-nums">{score(board, r.score)} {board.unit}</p>
                    <div className={`mt-2 w-full ${heights[i]} rounded-t-2xl grid place-items-start justify-center pt-2 font-display text-2xl font-semibold text-[#10261a]`}
                        style={{ background: `linear-gradient(to bottom, ${PODIUM[r.rank - 1] || PODIUM[2]}, color-mix(in oklab, ${PODIUM[r.rank - 1] || PODIUM[2]} 30%, transparent))` }}>
                        {r.rank}
                    </div>
                </motion.div>
            ) : <div key={i} />)}
        </div>
    );
}

function Row({ r, board }) {
    const extra = board.extra(r.extra, r);
    return (
        <li className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 rounded-2xl ${r.me ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/30' : 'bg-white/[0.03]'}`}>
            <span className="w-8 text-center font-display text-lg font-semibold tabular-nums text-white/60">{r.rank}</span>
            <Avatar name={r.username} color={r.me ? '#4fd18b' : '#8fb8a0'} size="w-9 h-9 text-sm" />
            <div className="min-w-0 flex-1">
                <Link to={profile(r.username)} className={`flex items-center gap-1.5 font-semibold hover:underline ${r.me ? 'text-[#a8f0c6]' : 'text-white'}`}>
                    <span className="truncate min-w-0">{r.username}{r.me && ' (toi)'}</span><SeasonBadge badge={r.badge} compact />
                </Link>
                {extra && <p className="text-xs text-ink-soft">{extra}</p>}
            </div>
            <span className="text-right">
                <span className="block font-bold tabular-nums text-white">{score(board, r.score)}</span>
                <span className="block text-[11px] text-ink-soft">{board.unit}</span>
            </span>
        </li>
    );
}

// Donors can choose not to show their amount publicly.
function DonorPrivacy({ hidden, onChange, reload }) {
    const [busy, setBusy] = useState(false);
    async function toggle() {
        setBusy(true);
        try {
            const r = await api('setDonationPrivacy', { hidden: !hidden });
            onChange(r.hidden);
            reload();
        } finally { setBusy(false); }
    }
    return (
        <label className="mt-6 flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={hidden} disabled={busy} onChange={toggle} className="w-4 h-4 accent-[#4fd18b]" />
            <EyeOff className="w-4 h-4 text-ink-soft" />
            Ne pas apparaître dans le classement des donateurs
        </label>
    );
}

// « Novembre 2026 »
const monthName = () => {
    const m = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    return m[0].toUpperCase() + m.slice(1);
};

export default function Leaderboard() {
    const [params] = useSearchParams();
    // /classement?tableau=donors opens a board directly (the home page links to the donors)
    const [boardKey, setBoardKey] = useState(() => (BOARDS.some((b) => b.key === params.get('tableau')) ? params.get('tableau') : 'quiz'));
    const [period, setPeriod] = useState('all');
    const [donorPeriod, setDonorPeriod] = useState('month');
    const [scope, setScope] = useState('all');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const board = BOARDS.find((b) => b.key === boardKey);
    const asked = boardKey === 'quiz' ? period : boardKey === 'donors' ? donorPeriod : 'all';

    useEffect(() => {
        let live = true;
        setError('');
        api('leaderboard', { board: boardKey, period: asked, scope })
            .then((res) => live && setData(res))
            .catch((e) => live && setError(e.message));
        return () => { live = false; };
    }, [boardKey, asked, scope, reload]);

    const fresh = data && data.board === boardKey && data.scope === scope && data.period === asked;
    const top = fresh ? data.top : [];
    const me = fresh ? data.me : null;
    const meShown = me && top.some((r) => r.me);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Classement</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Les meilleurs naturalistes</h1>

            <div className="mt-6 flex flex-wrap gap-2">
                {BOARDS.map(({ key, label, Icon }) => (
                    <Pill key={key} active={boardKey === key} onClick={() => setBoardKey(key)}><Icon className="w-4 h-4" />{label}</Pill>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <Pill active={scope === 'all'} onClick={() => setScope('all')}><Globe2 className="w-4 h-4" />Tous les joueurs</Pill>
                <Pill active={scope === 'friends'} onClick={() => setScope('friends')}><Users className="w-4 h-4" />Mes amis</Pill>
            </div>
            {boardKey === 'quiz' && (
                <div className="mt-2 flex flex-wrap gap-2">
                    <Pill active={period === 'all'} onClick={() => setPeriod('all')}>Depuis toujours</Pill>
                    <Pill active={period === 'week'} onClick={() => setPeriod('week')}>7 derniers jours</Pill>
                </div>
            )}
            {boardKey === 'donors' && (
                <div className="mt-2 flex flex-wrap gap-2">
                    <Pill active={donorPeriod === 'month'} onClick={() => setDonorPeriod('month')}>{monthName()}</Pill>
                    <Pill active={donorPeriod === 'all'} onClick={() => setDonorPeriod('all')}>Depuis toujours</Pill>
                </div>
            )}
            <p className="mt-4 text-sm text-ink-soft">{board.text}</p>
            {boardKey === 'quiz' && (
                <p className="mt-2 text-sm"><Link to="/quiz" className="inline-flex items-center gap-1.5 font-semibold text-[#a8f0c6] hover:underline"><Brain className="w-4 h-4" />Classements par mode et niveaux de naturaliste dans Quiz Arena</Link></p>
            )}
            {boardKey === 'donors' && (
                <p className="mt-2 text-sm"><Link to="/boutique" className="inline-flex items-center gap-1.5 font-semibold text-[#a8f0c6] hover:underline"><HeartHandshake className="w-4 h-4" />Soutenir une association depuis la boutique</Link></p>
            )}

            {error && <p className="mt-6 text-sm font-semibold text-rust">{error}</p>}
            {!fresh && !error && <p className="mt-10 text-center text-ink-soft">Chargement…</p>}

            {fresh && (
                <>
                    <div className="mt-6 flex items-center gap-3 rounded-2xl p-3.5 nd-glass">
                        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-[#4fd18b]/15 text-[#a8f0c6]"><Medal className="w-5 h-5" /></span>
                        <p className="text-sm text-white/85">
                            {me
                                ? <>Ta position : <strong className="text-white">{me.rank}<sup>{me.rank === 1 ? 'er' : 'e'}</sup></strong> sur {plural(data.players, 'joueur')}, avec {score(board, me.score)} {board.unit}.</>
                                : <>Tu n'es pas encore classé{boardKey === 'quiz' ? ' : termine une partie de quiz pour entrer dans la course' : boardKey === 'donors' ? (data.donor?.hidden ? ' : tu as choisi de ne pas apparaître ici' : ' : chaque achat en boutique soutient une association') : ''}.{data.players > 0 && <> {plural(data.players, 'joueur')} classé{data.players > 1 ? 's' : ''}.</>}</>}
                        </p>
                    </div>

                    {top.length === 0 ? (
                        <p className="mt-10 text-center text-ink-soft">
                            {scope === 'friends' ? 'Personne parmi tes amis pour l\'instant. Ajoute des amis pour vous comparer.' : 'Personne n\'est encore classé ici. Sois le premier !'}
                        </p>
                    ) : (
                        <>
                            <Podium rows={top.slice(0, 3)} board={board} />
                            {top.length > 3 && (
                                <ul className="mt-6 space-y-1.5">
                                    {top.slice(3).map((r) => <Row key={r.username} r={r} board={board} />)}
                                </ul>
                            )}
                            {me && !meShown && (
                                <ul className="mt-3 pt-3 border-t border-white/10"><Row r={me} board={board} /></ul>
                            )}
                        </>
                    )}
                    {boardKey === 'donors' && data.donor?.donated && <DonorPrivacy hidden={data.donor.hidden} onChange={(hidden) => setData((d) => ({ ...d, donor: { ...d.donor, hidden } }))} reload={() => setReload((k) => k + 1)} />}
                </>
            )}
        </div>
    );
}
