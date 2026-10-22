import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, ExternalLink, Eye, Gavel, Recycle, Ruler, Weight } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card, MysteryCard } from '../components/Card.jsx';
import { IUCN, RARITIES, TYPES, formatViews } from '../game.jsx';
import ShareButton from '../components/ShareButton.jsx';
import { FavoriteStar } from '../components/Favorite.jsx';
import { FieldGrid, FieldViewer } from './Terrain.jsx';

function formatMeasure(value, unit) {
    if (value == null) return null;
    if (unit === 'kg') return value >= 1000 ? `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} t` : value >= 1 ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg` : `${(value * 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
    return value >= 1 ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} cm`;
}

export default function CardPage() {
    const { id } = useParams();
    const { user, setUser, refreshCollection, catalog } = useGame();
    const [card, setCard] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setCard(null);
        api('card', { id }).then(({ card }) => setCard(card)).catch((err) => setError(err.message));
    }, [id]);

    async function recycle() {
        const res = await api('recycle', { cardId: card.id });
        setUser(res.user);
        setCard({ ...card, count: 1 });
        refreshCollection();
    }

    if (error) return <p className="py-32 text-center text-rust font-semibold">{error}</p>;
    if (!card) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;

    const t = TYPES[card.type];
    const r = RARITIES[card.rarity];
    const number = card.num;

    if (!card.count) {
        return (
            <div className="max-w-md mx-auto px-4 py-12 text-center">
                <Link to="/collection" className="inline-flex items-center gap-2 text-sm font-semibold text-white mb-8"><ArrowLeft className="w-4 h-4" />Collection</Link>
                <div className="w-64 mx-auto"><MysteryCard card={card} number={number} /></div>
                <h1 className="mt-8 font-display text-3xl font-bold">Espèce inconnue</h1>
                <p className="mt-2 text-ink-soft">Une carte <b style={{ color: r.color }}>{r.label}</b> de type <b style={{ color: t.color }}>{t.label}</b>. Ouvre des boosters pour la découvrir !</p>
            </div>
        );
    }

    const stats = card.stats || {};
    const facts = [
        { Icon: Eye, label: 'Lectures Wikipédia par an (estimation)', value: Number(card.views).toLocaleString('fr-FR') },
        stats.mass_kg && { Icon: Weight, label: 'Masse', value: formatMeasure(stats.mass_kg, 'kg') },
        stats.length_m && { Icon: Ruler, label: 'Longueur', value: formatMeasure(stats.length_m, 'm') },
        stats.height_m && { Icon: Ruler, label: 'Hauteur', value: formatMeasure(stats.height_m, 'm') },
    ].filter(Boolean);
    const iucn = card.iucn && IUCN[card.iucn];
    const recycleCoins = (card.count - 1) * (user.recycleValue?.[card.rarity] || 0);

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <Link to="/collection" className="inline-flex items-center gap-2 text-sm font-semibold text-white"><ArrowLeft className="w-4 h-4" />Collection</Link>
            <div className="mt-6 grid md:grid-cols-[minmax(0,380px)_1fr] gap-10 lg:gap-16 items-start">
                <div className="relative w-full max-w-[380px] mx-auto">
                    <Card card={card} number={number} total={catalog?.total} tilt />
                    <FavoriteStar card={card} className="absolute -bottom-3 -left-3 z-10 !w-12 !h-12" />
                </div>
                <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
                        <span className="px-2.5 py-1 rounded-full text-paper" style={{ background: t.color }}>{t.label}</span>
                        <span className="px-2.5 py-1 rounded-full border" style={{ color: r.color, borderColor: r.color }}>{r.symbol} {r.label}</span>
                        {iucn && <span className="px-2.5 py-1 rounded-full text-paper" style={{ background: iucn.color }} title="Statut UICN">UICN · {iucn.label}</span>}
                    </div>
                    <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-white leading-none break-words">{card.name}</h1>
                    {card.sci_name && card.sci_name !== card.name && <p className="mt-2 font-display italic text-xl text-ink-soft">{card.sci_name}</p>}
                    <p className="mt-6 text-lg leading-relaxed max-w-prose">{card.extract}</p>
                    <a href={card.wiki_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white underline underline-offset-4">
                        Lire l'article sur Wikipédia <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <dl className="mt-8 grid sm:grid-cols-2 gap-3">
                        {facts.map(({ Icon, label, value }) => (
                            <div key={label} className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.04] backdrop-blur border border-white/10">
                                <Icon className="w-5 h-5 text-brass-deep" />
                                <div>
                                    <dt className="text-xs text-ink-soft">{label}</dt>
                                    <dd className="font-display text-lg font-bold">{value}</dd>
                                </div>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-4 text-sm text-ink-soft">
                        Sa rareté vient de sa popularité : {formatViews(Number(card.views))} lectures par an (moyenne des 3 derniers mois), comparées aux autres espèces de type {t.label.toLowerCase()}.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <span className="font-display text-lg">Tu possèdes <b>{card.count}</b> exemplaire{card.count > 1 ? 's' : ''}</span>
                        {card.count > 1 && (
                            <button onClick={recycle} className="flex items-center gap-2 px-4 py-2 rounded-full nd-btn text-sm font-semibold">
                                <Recycle className="w-4 h-4" />Recycler {card.count - 1} doublon{card.count > 2 ? 's' : ''} · +{recycleCoins} pépites
                            </button>
                        )}
                        <Link to={`/encheres?vendre=${card.id}`} className="nd-cta-gold flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold">
                            <Gavel className="w-4 h-4" />Mettre aux enchères
                        </Link>
                        <ShareButton card={card} />
                    </div>
                </div>
            </div>
            <FieldSection cardId={card.id} />
        </div>
    );
}

// « Observée sur le terrain »: the players' photos of this species.
function FieldSection({ cardId }) {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(null);
    useEffect(() => { api('cardObservations', { cardId }).then(setData).catch(() => {}); }, [cardId]);
    if (!data) return null;
    return (
        <section className="mt-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-2xl text-white">
                    <Camera className="w-5 h-5 text-[#7dffb0]" />Observée sur le terrain{data.total ? ` · ${data.total}` : ''}
                </h2>
                {data.mine
                    ? <span className="px-3 py-1 rounded-full bg-gradient-to-r from-[#7dffb0] to-[#6ec8ff] text-[#05261a] text-xs font-black uppercase">Tu l'as photographiée</span>
                    : <Link to="/terrain" className="nd-btn inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"><Camera className="w-4 h-4" />La photographier</Link>}
            </div>
            {data.total
                ? <FieldGrid cards={data.cards} onOpen={setOpen} />
                : <p className="mt-3 text-white/60">Aucun joueur ne l'a encore photographiée : la première observation rapporte +50 graines.</p>}
            <FieldViewer obs={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); api('cardObservations', { cardId }).then(setData); }} />
        </section>
    );
}
