import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Gift, MessageCircle } from 'lucide-react';
import { Nugget, NUGGET_COLOR, Plant, PLANT_COLOR, Seed, SEED_COLOR } from './Currency.jsx';
import { api, useGame } from '../api.jsx';

const KINDS = {
    coins: { Icon: Seed, color: SEED_COLOR, one: 'graine', many: 'graines' },
    nuggets: { Icon: Nugget, color: NUGGET_COLOR, one: 'pépite', many: 'pépites' },
    plants: { Icon: Plant, color: PLANT_COLOR, one: 'plante', many: 'plantes' },
};

// Pop-up shown at the next visit after a friend sent graines, pépites or plantes.
// Closing it (or answering) marks those gifts as seen, which also clears the Amis badge.
export default function GiftNotice() {
    const { gifts, setGifts, refreshBadges } = useGame();
    const senders = [...new Set(gifts.map((g) => g.from))];

    function close() {
        const upTo = Math.max(...gifts.map((g) => g.id));
        setGifts([]);
        api('seenGifts', { upTo }).then(refreshBadges).catch(() => {});
    }

    return (
        <AnimatePresence>
            {gifts.length > 0 && (
                <motion.div key="gift-notice" className="fixed inset-0 z-[110] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="gift-notice-title"
                        className="relative w-full max-w-sm rounded-[2rem] bg-[#081a11] ring-1 ring-[#e9c46a]/35 p-6 text-center shadow-[0_0_60px_rgba(233,196,106,0.18)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                        <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-[#e9c46a] text-[#2a1c00] shadow-[0_0_32px_rgba(233,196,106,0.55)]"
                            initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: [-12, 10, -6, 0], scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
                            <Gift className="w-8 h-8" />
                        </motion.span>
                        <h2 id="gift-notice-title" className="mt-4 font-display text-2xl text-white">
                            {gifts.length > 1 ? `${gifts.length} cadeaux pour toi !` : 'Un cadeau pour toi !'}
                        </h2>
                        <ul className="mt-4 space-y-2 text-left max-h-[45vh] overflow-y-auto">
                            {gifts.map((g) => {
                                const k = KINDS[g.currency];
                                if (!k) return null;
                                return (
                                    <li key={g.id} className="rounded-2xl bg-white/[0.05] ring-1 ring-white/10 px-4 py-3">
                                        <div className="flex items-center gap-2 text-sm text-white/80">
                                            <b className="text-white truncate min-w-0">{g.from}</b>
                                            <span className="shrink-0">t'offre</span>
                                            <span className="ml-auto flex items-center gap-1 font-bold tabular-nums shrink-0" style={{ color: k.color }}>
                                                <k.Icon className="w-4 h-4" />{g.amount.toLocaleString('fr-FR')} {g.amount > 1 ? k.many : k.one}
                                            </span>
                                        </div>
                                        {g.note && <p className="mt-1 text-sm italic text-white/60 break-words">« {g.note} »</p>}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="mt-5 flex flex-col gap-2">
                            {senders.length === 1 && (
                                <Link to={`/messages/${encodeURIComponent(senders[0])}`} onClick={close}
                                    className="nd-cta-gold py-3 rounded-full font-bold flex items-center justify-center gap-2">
                                    <MessageCircle className="w-4 h-4" />Dire merci à {senders[0]}
                                </Link>
                            )}
                            <button type="button" onClick={close}
                                className={`py-3 rounded-full font-bold ${senders.length === 1 ? 'ring-1 ring-white/15 text-white/85 hover:bg-white/5' : 'nd-cta-gold'}`}>
                                Super, merci !
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
