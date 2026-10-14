import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { RARITIES, TYPES } from '../game.jsx';

function pickShowcase(catalog) {
    if (!catalog?.length) return [];
    const want = ['legendary', 'epic', 'rare', 'legendary', 'epic'];
    const used = new Set();
    return want.map((rarity, i) => {
        const pool = catalog.filter((c) => c.rarity === rarity && !used.has(c.type));
        const c = pool[(i * 13) % Math.max(pool.length, 1)];
        if (c) used.add(c.type);
        return c;
    }).filter(Boolean);
}

export default function Landing() {
    const { catalog } = useGame();
    const showcase = pickShowcase(catalog);

    return (
        <div className="overflow-hidden">
            <section className="max-w-6xl mx-auto px-4 pt-14 pb-20 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep mb-5">Cabinet de curiosités · {catalog?.length || '…'} espèces réelles</p>
                    <h1 className="font-display text-5xl sm:text-7xl font-black leading-[0.95] text-forest">
                        Collectionne<br />
                        <span className="italic font-medium text-brass-deep">tout</span> le vivant.
                    </h1>
                    <p className="mt-6 text-lg text-ink-soft max-w-md leading-relaxed">
                        Ouvre des boosters et découvre des animaux, des arbres, des algues, des champignons, des bactéries, des virus et des fossiles.
                        Chaque carte est une vraie espèce tirée de Wikipédia. <b className="text-ink">Plus elle est célèbre, plus elle est rare.</b>
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link to="/connexion?mode=register" className="px-6 py-3.5 rounded-full bg-forest text-paper font-semibold shadow-lg shadow-forest/25 hover:bg-forest-deep transition-colors">
                            Commencer — 3 boosters offerts
                        </Link>
                        <Link to="/connexion" className="px-6 py-3.5 rounded-full border border-forest/30 text-forest font-semibold hover:bg-forest/5">
                            J'ai déjà un compte
                        </Link>
                    </div>
                </motion.div>

                <div className="relative h-[420px] sm:h-[480px]">
                    {showcase.map((card, i) => {
                        const offset = i - (showcase.length - 1) / 2;
                        return (
                            <motion.div
                                key={card.id}
                                className="absolute left-1/2 top-6 w-[200px] sm:w-[230px] origin-bottom"
                                initial={{ opacity: 0, y: 80, rotate: 0, x: '-50%' }}
                                animate={{ opacity: 1, y: Math.abs(offset) * 18, rotate: offset * 9, x: `calc(-50% + ${offset * 70}px)` }}
                                transition={{ delay: 0.25 + i * 0.1, type: 'spring', stiffness: 90, damping: 14 }}
                                style={{ zIndex: 10 - Math.abs(offset) }}
                            >
                                <Card card={card} />
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            <section className="bg-forest text-paper">
                <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-3 gap-10">
                    <div>
                        <h2 className="font-display text-3xl font-bold">14 types</h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {Object.entries(TYPES).map(([key, t]) => (
                                <span key={key} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `${t.color}55`, boxShadow: `0 0 0 1px ${t.color} inset` }}>
                                    <t.Icon className="w-3.5 h-3.5" />{t.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h2 className="font-display text-3xl font-bold">5 raretés</h2>
                        <ul className="mt-4 space-y-1.5 text-sm">
                            {Object.values(RARITIES).map((r) => (
                                <li key={r.label} className="flex gap-3"><span className="w-10 text-brass">{r.symbol}</span>{r.label}</li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className="font-display text-3xl font-bold">La célébrité fait la rareté</h2>
                        <p className="mt-4 text-sm leading-relaxed text-paper/80">
                            La rareté d'une carte dépend du nombre de lectures de sa page Wikipédia sur les 12 derniers mois,
                            comparé aux autres espèces du même type. Le lion, le chêne, l'amanite tue-mouches ou le Tyrannosaurus sont légendaires,
                            et chaque type, même les bactéries, a ses propres stars.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
