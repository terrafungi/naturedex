import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { HeartHandshake, X } from 'lucide-react';
import { useGame } from '../api.jsx';
import { hasNews } from '../news.js';

const NEXT_KEY = 'naturdex.donateAt';
const EVERY_DAYS = 15;
const FIRST_DAYS = 3; // a new player first gets to enjoy the game
const DELAY_MS = 25_000;

// A gentle reminder, once every EVERY_DAYS days, that a purchase supports the creator and the
// nature associations. Never shown to Pass subscribers, in the shop, or over another pop-up.
export default function DonatePrompt() {
    const { user, gifts, notices } = useGame();
    const { pathname } = useLocation();
    const [show, setShow] = useState(false);
    const blocked = !user || user.pass || pathname.startsWith('/boutique') || hasNews(user) || gifts.length > 0 || !!notices;

    useEffect(() => {
        if (blocked) return;
        const at = Number(localStorage.getItem(NEXT_KEY) || 0);
        if (!at) { localStorage.setItem(NEXT_KEY, String(Date.now() + FIRST_DAYS * 86_400_000)); return; }
        if (at > Date.now()) return;
        const t = setTimeout(() => {
            localStorage.setItem(NEXT_KEY, String(Date.now() + EVERY_DAYS * 86_400_000));
            setShow(true);
        }, DELAY_MS);
        return () => clearTimeout(t);
    }, [blocked]);

    const close = () => setShow(false);
    return (
        <AnimatePresence>
            {show && (
                <motion.div key="donate" className="fixed inset-0 z-[108] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="donate-title"
                        className="relative w-full max-w-sm rounded-[2rem] bg-[#081a11] ring-1 ring-[#4fd18b]/35 p-6 text-center shadow-[0_0_60px_rgba(79,209,139,0.16)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                        <button type="button" onClick={close} aria-label="Fermer" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10">
                            <X className="w-4 h-4" />
                        </button>
                        <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-[#4fd18b] text-[#06281a] shadow-[0_0_32px_rgba(79,209,139,0.5)]"
                            initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.12, 1] }} transition={{ duration: 0.6, delay: 0.1 }}>
                            <HeartHandshake className="w-8 h-8" />
                        </motion.span>
                        <h2 id="donate-title" className="mt-4 font-display text-2xl text-white">Tu aimes NatureDex ?</h2>
                        <p className="mt-2 text-sm text-white/75 leading-relaxed">
                            Le jeu est gratuit et le restera. Si tu veux nous aider, un petit achat en boutique soutient
                            {' '}<b className="text-white">le créateur du jeu</b> et <b className="text-[#a8f0c6]">les associations nature</b> :
                            20 % de chaque paiement est reversé à la LPO ou à Wikipédia.
                        </p>
                        <div className="mt-5 flex gap-2">
                            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white/75 ring-1 ring-white/15 hover:bg-white/5">Plus tard</button>
                            <Link to="/boutique" onClick={close} className="flex-[1.4] nd-cta-gold inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold">
                                <HeartHandshake className="w-4 h-4" />Faire un don
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
