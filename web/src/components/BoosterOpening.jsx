import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Card, CardBack } from './Card.jsx';
import { RARITIES } from '../game.jsx';
import { Pack } from './Pack.jsx';

const GLOW = { rare: '#ffb627', epic: '#c084fc', legendary: '#ffd84d' };

function Burst({ rarity }) {
    const color = GLOW[rarity];
    if (!color) return null;
    return (
        <motion.div
            key={rarity}
            className="absolute inset-[-40%] pointer-events-none"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1, rotate: rarity === 'legendary' ? 360 : 0 }}
            transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.5 }, rotate: { duration: 14, repeat: Infinity, ease: 'linear' } }}
            style={{
                background: rarity === 'legendary'
                    ? `repeating-conic-gradient(from 0deg, ${color}55 0deg 8deg, transparent 8deg 22deg), radial-gradient(circle, ${color}cc, transparent 60%)`
                    : `radial-gradient(circle, ${color}bb, transparent 62%)`,
                filter: 'blur(2px)',
            }}
        />
    );
}

function FlipCard({ card, revealed, onClick }) {
    return (
        <div className="relative w-[250px] sm:w-[290px] cursor-pointer" style={{ perspective: 1200 }} onClick={onClick}>
            {revealed && <Burst rarity={card.rarity} />}
            <motion.div
                className="relative"
                style={{ transformStyle: 'preserve-3d' }}
                initial={{ rotateY: 180 }}
                animate={{ rotateY: revealed ? 0 : 180 }}
                transition={{ duration: 0.6, ease: [0.3, 1.2, 0.5, 1] }}
            >
                <div style={{ backfaceVisibility: 'hidden' }}>
                    <Card card={card} tilt />
                </div>
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <CardBack />
                </div>
            </motion.div>
            {revealed && card.isNew && (
                <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -8 }} transition={{ delay: 0.35, type: 'spring' }}
                    className="absolute -top-3 -left-3 z-10 px-3 py-1 rounded-full bg-rust text-paper text-xs font-black uppercase tracking-wider shadow-lg">
                    Nouveau !
                </motion.span>
            )}
        </div>
    );
}

export default function BoosterOpening({ cards, onClose, onAgain, canOpenAgain, demo }) {
    const [stage, setStage] = useState('pack'); // pack → reveal → summary
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        if (stage !== 'reveal') return;
        setRevealed(false);
        const t = setTimeout(() => setRevealed(true), 250);
        return () => clearTimeout(t);
    }, [stage, index]);

    function next() {
        if (!revealed) return setRevealed(true);
        if (index + 1 < cards.length) setIndex(index + 1);
        else setStage('summary');
    }

    const current = cards[index];
    const rarityLabel = current && RARITIES[current.rarity];

    return (
        <motion.div className="fixed inset-0 z-50 bg-[#05070f]/95 backdrop-blur-sm overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full text-paper/70 hover:text-paper hover:bg-white/10" title="Fermer">
                <X className="w-6 h-6" />
            </button>

            <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
                <AnimatePresence mode="wait">
                    {stage === 'pack' && (
                        <motion.div key="pack" className="flex flex-col items-center gap-8"
                            exit={{ scale: 1.4, opacity: 0, filter: 'brightness(3)' }} transition={{ duration: 0.35 }}>
                            <motion.button
                                onClick={() => setStage('reveal')}
                                className="w-[220px] sm:w-[250px]"
                                animate={{ rotate: [0, -2, 2, -2, 0], y: [0, -4, 0] }}
                                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6 }}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <Pack />
                            </motion.button>
                            <p className="font-display text-paper text-xl italic">Touche le booster pour le déchirer</p>
                        </motion.div>
                    )}

                    {stage === 'reveal' && current && (
                        <motion.div key="reveal" className="flex flex-col items-center gap-6" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
                            <div className="flex gap-1.5">
                                {cards.map((c, i) => (
                                    <span key={i} className={`h-1.5 w-6 rounded-full transition-colors ${i < index ? 'bg-brass' : i === index ? 'bg-paper' : 'bg-paper/20'}`} />
                                ))}
                            </div>
                            <AnimatePresence mode="popLayout">
                                <motion.div key={index}
                                    initial={{ x: 0, y: 40, opacity: 0, scale: 0.9 }}
                                    animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                    exit={{ x: -260, y: -20, rotate: -14, opacity: 0, transition: { duration: 0.3 } }}>
                                    <FlipCard card={current} revealed={revealed} onClick={next} />
                                </motion.div>
                            </AnimatePresence>
                            <div className="h-14 text-center">
                                {revealed && (
                                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                                        <div className="font-display text-2xl font-bold" style={{ color: GLOW[current.rarity] || '#f3ecdc' }}>
                                            {rarityLabel.symbol} {rarityLabel.label}
                                        </div>
                                        <div className="text-paper/60 text-sm">Touche la carte pour continuer</div>
                                    </motion.div>
                                )}
                            </div>
                            <button onClick={() => setStage('summary')} className="text-paper/60 text-sm underline hover:text-paper">Tout révéler</button>
                        </motion.div>
                    )}

                    {stage === 'summary' && (
                        <motion.div key="summary" className="w-full max-w-5xl flex flex-col items-center gap-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h2 className="font-display text-paper text-3xl font-bold text-center">
                                {demo ? <>Joli tirage ! <span className="nd-grad-text">Garde-le pour de vrai.</span></> : <>{cards.filter((c) => c.isNew).length} nouvelle{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} espèce{cards.filter((c) => c.isNew).length > 1 ? 's' : ''} !</>}
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
                                {cards.map((card, i) => (
                                    <motion.div key={i} className="relative" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                                        {demo ? <Card card={card} /> : <Link to={`/carte/${card.id}`}><Card card={card} /></Link>}
                                        {card.isNew && <span className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-rust text-paper text-[10px] font-black uppercase">Nouveau</span>}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="flex flex-wrap justify-center gap-3">
                                {canOpenAgain && (
                                    <button onClick={onAgain} className={`px-6 py-3 rounded-full font-bold ${demo ? 'border border-paper/30 text-paper hover:bg-white/10' : 'nd-btn'}`}>
                                        {demo ? 'Rouvrir un booster' : 'Ouvrir un autre booster'}
                                    </button>
                                )}
                                {demo ? (
                                    <Link to="/connexion?mode=register" className="px-6 py-3 rounded-full nd-btn font-bold">
                                        Garder mes cartes — créer un compte
                                    </Link>
                                ) : (
                                    <Link to="/collection" className="px-6 py-3 rounded-full border border-paper/30 text-paper font-semibold hover:bg-white/10">
                                        Voir ma collection
                                    </Link>
                                )}
                                <button onClick={onClose} className="px-6 py-3 rounded-full text-paper/70 hover:text-paper">Fermer</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
