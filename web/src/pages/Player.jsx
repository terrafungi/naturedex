import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Frame, Lock, MessageCircle, Pencil, Star, UserPlus } from 'lucide-react';
import { api } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { LeafLogo } from '../components/Layout.jsx';
import ShowcaseCanvas, { VoteButton } from '../components/Showcase.jsx';
import PatronBadge from '../components/PatronBadge.jsx';
import SeasonBadge, { SeasonHistory } from '../components/SeasonBadge.jsx';
import { FieldGrid, FieldViewer } from './Terrain.jsx';

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
        ['Observations', n(player.observations)],
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
                    <div className="flex flex-wrap gap-2"><SeasonBadge badge={player.badge} className="mt-2" />{player.patron && <PatronBadge className="mt-2" />}</div>
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

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
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

            <Showcase player={player} />
            <FieldJournal player={player} />

            <Binders player={player} />

            <div className="mt-6"><SeasonHistory seasons={player.seasons} /></div>
        </div>
    );
}

// Latest field cards (« Sur le terrain ») of the player.
function FieldJournal({ player }) {
    const [cards, setCards] = useState(null);
    const [open, setOpen] = useState(null);
    useEffect(() => {
        if (player.observations) api('fieldJournal', { username: player.username }).then((r) => setCards(r.cards)).catch(() => {});
    }, [player.username, player.observations]);
    if (!player.observations || !cards) return null;
    return (
        <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-2xl text-white"><Camera className="w-5 h-5 text-[#7dffb0]" />Carnet de terrain · {n(player.observations)}</h2>
                {player.me && <Link to="/terrain" className="text-sm font-semibold text-white underline underline-offset-4">Tout voir</Link>}
            </div>
            <FieldGrid cards={cards.slice(0, 8)} onOpen={setOpen} />
            <FieldViewer obs={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); setCards((c) => c.filter((o) => o.id !== open.id)); }} />
        </section>
    );
}

// The player's showcase picture; on one's own profile, a way to create or edit it.
function Showcase({ player }) {
    const { showcase } = player;
    const [error, setError] = useState('');
    if (!showcase) {
        if (!player.me) return null;
        return (
            <Link to="/vitrine" className="mt-10 flex items-center gap-3 p-4 rounded-2xl nd-glass text-sm text-white/75 hover:ring-1 hover:ring-[#e9c46a]/50">
                <Frame className="w-5 h-5 shrink-0 text-[#e9c46a]" />
                <span>Crée ta <b className="text-white">vitrine</b> : tes 10 plus belles cartes sur un fond, à afficher ici et à partager en image.</span>
            </Link>
        );
    }
    return (
        <section className="mt-10">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-2xl text-white"><Frame className="w-5 h-5 text-[#e9c46a]" />Vitrine</h2>
                {player.me && (
                    <Link to="/vitrine" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-white/85 hover:bg-white/10">
                        <Pencil className="w-3.5 h-3.5" />Modifier
                    </Link>
                )}
            </div>
            <div className="mt-4 mx-auto rounded-[1.4rem] overflow-hidden ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
                style={{ maxWidth: showcase.format === 'story' ? 'min(100%, 24rem, calc(75vh * 9 / 16))' : 'min(100%, 34rem, 75vh)' }}>
                <ShowcaseCanvas showcase={showcase} username={player.username} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <VoteButton username={player.username} votes={showcase.votes || 0} voted={!!showcase.voted} mine={player.me} onError={setError} />
                <span className="text-xs text-ink-soft">{player.me ? 'Les ♥ reçus par ta vitrine' : 'Tu aimes cette vitrine ? Vote pour elle !'}</span>
                <Link to="/vitrines" className="text-xs font-semibold text-[#a8f0c6] hover:underline">Toutes les vitrines</Link>
            </div>
            {error && <p className="mt-2 text-center text-xs text-[#ffc2ae]">{error}</p>}
        </section>
    );
}

const PAGE = 60;

// Favourite binders: tiles to pick one (?classeur=id, so "back" closes it), then its cards.
function Binders({ player }) {
    const [params, setParams] = useSearchParams();
    const open = player.binders?.find((b) => String(b.id) === params.get('classeur'));

    if (!player.binders) {
        if (!player.binderCount) return null;
        return (
            <section className="mt-10 flex items-center gap-3 p-4 rounded-2xl nd-glass text-sm text-white/75">
                <Lock className="w-5 h-5 shrink-0 text-[#e9c46a]" />
                <span>{player.username} a {player.binderCount} classeur{player.binderCount > 1 ? 's' : ''} de favoris. Deviens son ami pour {player.binderCount > 1 ? 'les' : 'le'} parcourir.</span>
            </section>
        );
    }
    if (!player.binders.length) {
        return player.me ? (
            <section className="mt-10 p-4 rounded-2xl nd-glass text-sm text-white/75">
                Tes classeurs de favoris s'afficheront ici pour tes amis. Touche l'étoile <Star className="inline w-4 h-4 -mt-1 text-[#e9c46a]" /> d'une carte pour en créer un.
            </section>
        ) : null;
    }
    return (
        <section className="mt-10">
            <h2 className="flex items-center gap-2 font-display text-2xl text-white"><Star className="w-5 h-5 text-[#e9c46a] fill-current" />Classeurs</h2>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {player.binders.map((b) => {
                    const active = open?.id === b.id;
                    return (
                        <button key={b.id} onClick={() => setParams(active ? {} : { classeur: b.id }, { replace: !!open })}
                            className={`group text-left rounded-2xl p-3 ring-1 transition-colors ${active ? 'bg-[#e9c46a]/15 ring-[#e9c46a]/70' : 'nd-glass ring-white/10 hover:ring-white/30'}`}>
                            <div className="relative h-24 mx-auto w-28">
                                {b.thumbs.map((src, i) => (
                                    <img key={i} src={src} alt="" loading="lazy" draggable="false"
                                        className="absolute top-1 left-1/2 w-16 h-[5.6rem] object-cover rounded-lg ring-2 ring-[#f8f2e2] shadow-lg transition-transform group-hover:-translate-y-0.5"
                                        style={{ transform: `translateX(calc(-50% + ${(i - (b.thumbs.length - 1) / 2) * 22}px)) rotate(${(i - (b.thumbs.length - 1) / 2) * 9}deg)`, zIndex: i === 1 ? 2 : 1 }} />
                                ))}
                            </div>
                            <div className="mt-2 font-semibold text-white truncate">{b.name}</div>
                            <div className="text-xs text-white/55">{b.count} carte{b.count > 1 ? 's' : ''}</div>
                        </button>
                    );
                })}
            </div>
            {open && <BinderCards key={open.id} player={player} binder={open} />}
        </section>
    );
}

function BinderCards({ player, binder }) {
    const [page, setPage] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function load(offset) {
        setLoading(true);
        try {
            const res = await api('playerBinder', { username: player.username, id: binder.id, offset, limit: PAGE });
            setPage((prev) => ({ matches: res.matches, cards: [...(offset ? prev.cards : []), ...res.cards] }));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (error) return <p className="mt-6 text-rust font-semibold">{error}</p>;
    if (!page) return <p className="mt-6 text-ink-soft">Chargement…</p>;
    const missing = player.me ? 0 : page.cards.filter((c) => !c.mine).length;
    return (
        <div className="mt-6">
            <p className="text-sm text-white/70">
                <b className="text-white">{binder.name}</b> · {page.matches} carte{page.matches > 1 ? 's' : ''}
                {missing > 0 && <> · <span className="text-[#ffb4a2]">{missing} te manque{missing > 1 ? 'nt' : ''}</span></>}
            </p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {page.cards.map((c) => (
                    <div key={c.id} className="relative">
                        <Card card={c} number={c.num} />
                        {!player.me && !c.mine && (
                            <span className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-[#e76f51] text-white text-[10px] font-black uppercase shadow-lg">Il te manque</span>
                        )}
                        {c.count > 1 && (
                            <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[#04150d] text-xs font-bold">×{c.count}</span>
                        )}
                    </div>
                ))}
            </div>
            {page.matches > page.cards.length && (
                <div className="mt-8 text-center">
                    <button onClick={() => load(page.cards.length)} disabled={loading} className="px-6 py-3 rounded-full border border-white/10 text-white font-semibold hover:bg-white/10 disabled:opacity-60">
                        {loading ? 'Chargement…' : `Afficher plus (${page.matches - page.cards.length} restantes)`}
                    </button>
                </div>
            )}
        </div>
    );
}
