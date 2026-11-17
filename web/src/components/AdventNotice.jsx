import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Gift, Snowflake } from 'lucide-react';
import { useGame } from '../api.jsx';
import { hasNews } from '../news.js';
import { ADVENT_YEAR, adventDay } from '../advent.js';

const SEEN_KEY = `naturdex.advent${ADVENT_YEAR}`;

// From 1 December: the Calendrier de l'Avent is open. Shown once per device, after the news,
// gift and « Pendant ton absence » pop-ups.
export default function AdventNotice() {
    const { user, gifts, notices } = useGame();
    const [closed, setClosed] = useState(() => !!localStorage.getItem(SEEN_KEY));
    const day = adventDay();
    const open = !closed && !!day && !!user && !hasNews(user) && !gifts.length && !notices;

    function close() {
        localStorage.setItem(SEEN_KEY, '1');
        setClosed(true);
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div key="advent-notice" className="fixed inset-0 z-[110] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-[#05070f]/80 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="advent-notice-title"
                        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-[#0b1228] ring-1 ring-[#f7d774]/45 p-6 text-center shadow-[0_0_70px_rgba(214,54,54,0.35)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }}>
                        <div className="nd-advent-flakes opacity-60" aria-hidden />
                        <div className="relative">
                            <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl text-[#ffe9a6] shadow-[0_0_32px_rgba(247,215,116,0.5)]"
                                style={{ background: 'radial-gradient(120% 90% at 30% 20%, #e23a3a, #a8161f 55%, #5c0710)', boxShadow: 'inset 0 0 0 2px #f7d774' }}
                                initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: [-12, 10, -6, 0], scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
                                <span className="font-display font-bold text-3xl">{day}</span>
                            </motion.span>
                            <p className="mt-4 flex items-center justify-center gap-2 uppercase tracking-[0.3em] text-[0.65rem] font-bold text-[#f7d774]"><Snowflake className="w-3.5 h-3.5" />Du 1er au 24 décembre</p>
                            <h2 id="advent-notice-title" className="mt-1 font-display text-3xl text-white">Le calendrier de l'Avent est ouvert !</h2>
                            <p className="mt-3 text-sm leading-relaxed text-white/75">
                                Chaque jour, une case et une carte de Noël introuvable ailleurs : sapins, épices, animaux du Grand Nord, présents des Rois mages…
                                Le 23, un renne légendaire en full art. Le 24, le père Noël, avec une chance sur dix de l'avoir en version secrète.
                            </p>
                            <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">Attention : une case non ouverte le jour même est perdue.</p>
                            <Link to="/avent" onClick={close} className="mt-5 w-full nd-cta-gold py-3 rounded-full font-bold inline-flex items-center justify-center gap-2">
                                <Gift className="w-5 h-5" />{day === 1 ? 'Ouvrir la première case' : 'Ouvrir la case du jour'}
                            </Link>
                            <button type="button" onClick={close} className="mt-2 w-full py-2 text-sm text-white/60 hover:text-white">Plus tard</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
