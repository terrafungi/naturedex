import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, Swords, Trophy } from 'lucide-react';
import { api } from '../api.jsx';
import { Amount } from '../components/Currency.jsx';
import { CardText, GameCard, biomeColor, biomeName } from '../components/TcgCard.jsx';
import { CAPTURES_TO_WIN } from '../tcg.js';
import { sfx } from '../sfx.js';

const RULES = [
    ['Ton tour', 'Pioche une carte, attache 1 Énergie à une créature, pose des créatures sur ton Banc (3 max), joue tes cartes Naturaliste, puis attaque : l\'attaque termine ton tour.'],
    ['Énergies', 'Chaque attaque a un coût en Énergies. Un rond de la couleur du biome = Énergie de ce biome ; un rond gris = n\'importe laquelle.'],
    ['Chaîne alimentaire', 'Un prédateur inflige ×2 à sa proie, et la proie résiste à son prédateur (−20).'],
    ['Captures', `Une créature à 0 PV est capturée. Les créatures rares ou menacées valent 2 captures. ${CAPTURES_TO_WIN} captures pour gagner, ou quand l'adversaire n'a plus de créature en jeu.`],
    ['Naturalistes', 'Objets : autant que tu veux. Supporters (de vrais naturalistes) : 1 par tour. Stade : 1 en jeu pour les deux joueurs. Outil : un équipement sur une créature.'],
];

export default function Duel() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [detail, setDetail] = useState(null);
    const [starter, setStarter] = useState(null);

    useEffect(() => {
        api('duelHome').then((d) => { setData(d); if (d.starter) setStarter(d.starter); }).catch((e) => setError(e.message));
    }, []);

    async function start(level) {
        setBusy(true); setError('');
        try {
            const { duel } = await api('duelStart', { level });
            sfx.swish();
            navigate(`/duel/${duel.id}`);
        } catch (e) { setError(e.message); setBusy(false); }
    }

    if (!data) return <div className="max-w-xl mx-auto px-4 py-16 text-ink-soft">{error || 'Chargement…'}</div>;

    const creatures = data.deck.filter((c) => c.kind === 'creature');
    const energies = data.deck.filter((c) => c.kind === 'energy');
    const trainers = data.deck.filter((c) => c.kind !== 'creature' && c.kind !== 'energy');
    const energyCount = energies.reduce((m, c) => ({ ...m, [c.biome]: (m[c.biome] || 0) + 1 }), {});
    const enough = data.creatures >= data.minCreatures;

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-3">
                <Link to="/combat" className="p-2 rounded-full nd-glass" title="Retour au combat"><ArrowLeft className="w-4 h-4" /></Link>
                <div>
                    <h1 className="font-display text-3xl font-semibold flex items-center gap-2">Duel de cartes <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f4d88f] text-[#2a1c00] align-middle">BÊTA</span></h1>
                    <p className="text-sm text-ink-soft">Créatures, Énergies et Naturalistes : affronte les rangers et gagne de nouvelles cartes.</p>
                </div>
            </div>

            {error && <p className="p-3 rounded-xl bg-rust/20 text-sm font-bold">{error}</p>}

            {data.activeId && (
                <button onClick={() => navigate(`/duel/${data.activeId}`)} className="w-full p-4 rounded-2xl nd-cta-gold font-bold flex items-center justify-center gap-2">
                    <Play className="w-5 h-5" /> Reprendre le duel en cours
                </button>
            )}

            {!enough ? (
                <div className="p-5 rounded-2xl nd-glass text-center space-y-2">
                    <p className="font-bold">Il te faut au moins {data.minCreatures} cartes dans ta collection pour composer un deck.</p>
                    <Link to="/boosters" className="inline-block px-4 py-2 rounded-full nd-cta-gold font-bold text-sm">Ouvrir des boosters</Link>
                </div>
            ) : (
                <section className="space-y-3">
                    <div className="flex items-baseline justify-between">
                        <h2 className="font-display text-xl font-semibold">Choisis ton adversaire</h2>
                        <span className="text-xs text-ink-soft">{data.rewardsLeft > 0 ? `${data.rewardsLeft} victoire${data.rewardsLeft > 1 ? 's' : ''} récompensée${data.rewardsLeft > 1 ? 's' : ''} restante${data.rewardsLeft > 1 ? 's' : ''} aujourd'hui` : 'Récompenses du jour toutes gagnées'}</span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                        {data.levels.map((l) => (
                            <button key={l.n} disabled={busy || !!data.activeId} onClick={() => start(l.n)}
                                className="p-4 rounded-2xl nd-glass text-left space-y-2 hover:ring-2 hover:ring-[#f4d88f]/60 transition disabled:opacity-50">
                                <p className="flex items-center gap-2 font-display text-lg font-semibold"><Swords className="w-4 h-4 text-brass-deep" />{l.name}</p>
                                <p className="text-xs text-ink-soft">{l.text}</p>
                                <p className="text-xs text-ink-soft">Deck adverse : {l.size} cartes</p>
                                <p className="flex items-center gap-2 text-sm">Victoire : <Amount seeds={l.coins} sign /> + {l.cards} carte{l.cards > 1 ? 's' : ''}</p>
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-ink-soft flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> {data.won} victoire{data.won > 1 ? 's' : ''} · {data.lost} défaite{data.lost > 1 ? 's' : ''}</p>
                </section>
            )}

            {data.deck.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-baseline justify-between">
                        <h2 className="font-display text-xl font-semibold">Ton deck ({data.deck.length} cartes)</h2>
                        <span className="text-xs text-ink-soft">Composé automatiquement à partir de ta collection</span>
                    </div>
                    <p className="text-sm text-ink-soft flex flex-wrap gap-x-3 gap-y-1">
                        <span>{creatures.length} créatures</span>
                        {Object.entries(energyCount).map(([b, n]) => <span key={b} className="font-bold" style={{ color: biomeColor(b) }}>{n} {biomeName(b)}</span>)}
                        <span>{trainers.length} Naturalistes</span>
                    </p>
                    <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-[#10241a]">
                        {data.deck.map((c, i) => <GameCard key={i} card={c} size="hand" onClick={() => setDetail(c)} />)}
                    </div>
                    <p className="text-xs text-ink-soft">Gagne des duels pour obtenir plus d'Énergies et de Naturalistes : ton deck grandira jusqu'à 40 cartes.</p>
                </section>
            )}

            <section className="space-y-2">
                <h2 className="font-display text-xl font-semibold">Comment jouer</h2>
                {RULES.map(([t, d]) => (
                    <div key={t} className="p-3 rounded-xl nd-glass text-sm"><span className="font-bold">{t} · </span><span className="text-ink-soft">{d}</span></div>
                ))}
            </section>

            <AnimatePresence>
                {(detail || starter) && (
                    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { setDetail(null); setStarter(null); }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-3xl p-5 bg-[#13261d] text-white border border-white/10">
                            {starter ? (
                                <div className="text-center space-y-3">
                                    <p className="font-display text-2xl font-semibold text-[#f4d88f]">Ton kit de départ !</p>
                                    <p className="text-sm text-white/70">Des Énergies des biomes de tes créatures et tes premiers Naturalistes, pour commencer à jouer.</p>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {starter.map((c, i) => (
                                            <motion.div key={i} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                                                <GameCard card={c} size="hand" />
                                            </motion.div>
                                        ))}
                                    </div>
                                    <button onClick={() => setStarter(null)} className="px-5 py-2.5 rounded-full nd-cta-gold font-bold">Super !</button>
                                </div>
                            ) : (
                                <div className="flex gap-4 items-start">
                                    <GameCard card={detail} size="active" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-display text-xl font-semibold mb-2">{detail.name}</p>
                                        <CardText card={detail} />
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
