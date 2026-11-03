import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ExternalLink, Sparkles, X } from 'lucide-react';
import { api } from '../api.jsx';
import { Card } from './Card.jsx';
import { IUCN, RARITIES, TYPES } from '../game.jsx';

/**
 * Big card sheet over the page (auctions): the card turns in 3D under the finger, with its
 * species text. `card` is the light auction card, shown at once while the full one loads.
 */
export default function CardSheet({ card: light, total, onClose }) {
    const [card, setCard] = useState(light);
    const [error, setError] = useState('');
    useEffect(() => {
        api('auctionCard', { id: light.id }).then((r) => setCard(r.card)).catch((e) => setError(e.message));
    }, [light.id]);
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        addEventListener('keydown', onKey);
        return () => removeEventListener('keydown', onKey);
    }, [onClose]);

    const t = TYPES[card.type] || TYPES.plant;
    const r = RARITIES[card.rarity] || RARITIES.common;
    const iucn = card.iucn && IUCN[card.iucn];

    return (
        <motion.div className="fixed inset-0 z-[60] overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
            <button type="button" onClick={onClose} className="fixed top-4 right-4 z-10 grid place-items-center w-10 h-10 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-5 h-5" /></button>
            <motion.div className="relative min-h-full max-w-4xl mx-auto px-4 py-14 grid md:grid-cols-[minmax(0,360px)_1fr] gap-8 items-center pointer-events-none"
                initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.96 }}>
                <div className="w-full max-w-[360px] mx-auto pointer-events-auto">
                    <Card card={card} number={card.num} total={total} tilt />
                    <p className="mt-3 text-center text-xs text-white/50">Touche la carte et fais-la pivoter pour faire briller le holo</p>
                </div>
                <div className="pointer-events-auto rounded-3xl bg-[#081a11]/90 ring-1 ring-white/10 p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
                        <span className="px-2.5 py-1 rounded-full text-paper" style={{ background: t.color }}>{t.label}</span>
                        <span className="px-2.5 py-1 rounded-full border" style={{ color: r.color, borderColor: r.color }}>{r.symbol} {r.label}</span>
                        {iucn && <span className="px-2.5 py-1 rounded-full text-paper" style={{ background: iucn.color }} title="Statut UICN">UICN · {iucn.label}</span>}
                    </div>
                    <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold text-white leading-none break-words">{card.name}</h2>
                    {card.sci_name && card.sci_name !== card.name && <p className="mt-1.5 font-display italic text-lg text-ink-soft">{card.sci_name}</p>}
                    {card.extract ? <p className="mt-4 leading-relaxed text-white/85 line-clamp-[10]">{card.extract}</p>
                        : <p className="mt-4 text-sm text-ink-soft">{error || 'Chargement…'}</p>}
                    {card.wiki_url && (
                        <a href={card.wiki_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white underline underline-offset-4">
                            Lire l'article sur Wikipédia{card.wiki_url.includes('://en.') ? ' (en anglais)' : ''} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                    {card.count != null && (
                        <p className="mt-5 text-sm font-semibold">
                            {card.count > 0
                                ? <Link to={`/carte/${card.id}`} className="text-[#a8f0c6] hover:underline">Tu l'as déjà ({card.count} exemplaire{card.count > 1 ? 's' : ''}) · voir ta fiche →</Link>
                                : <span className="inline-flex items-center gap-1.5 text-[#a8f0c6]"><Sparkles className="w-4 h-4" />Nouvelle pour toi</span>}
                        </p>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
