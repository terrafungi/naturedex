import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { hasNews, NEWS } from '../news.js';

// « Nouveautés » pop-up: shown once per account (the server remembers the last one closed),
// before the gift and contest pop-ups.
export default function NewsNotice() {
    const { user, refreshBadges } = useGame();
    const [closed, setClosed] = useState(false);
    const open = !closed && hasNews(user);

    function close() {
        setClosed(true);
        api('seenNews', { id: NEWS.id }).then(refreshBadges).catch(() => {});
    }

    const row = 'flex items-start gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 px-4 py-3 hover:bg-white/[0.09] transition-colors';
    return (
        <AnimatePresence>
            {open && (
                <motion.div key="news-notice" className="fixed inset-0 z-[110] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="news-notice-title"
                        className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-[2rem] bg-[#081a11] ring-1 ring-[#4fd18b]/30 p-6 shadow-[0_0_60px_rgba(79,209,139,0.15)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                        <div className="text-center">
                            <motion.span className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-[#4fd18b] text-[#03210f] shadow-[0_0_32px_rgba(79,209,139,0.5)]"
                                initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: [-12, 10, -6, 0], scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
                                <Sparkles className="w-7 h-7" />
                            </motion.span>
                            <p className="mt-3 uppercase tracking-[0.25em] text-[0.65rem] font-bold text-[#a8f0c6]">Nouveautés</p>
                            <h2 id="news-notice-title" className="mt-1 font-display text-2xl text-white">{NEWS.title}</h2>
                        </div>
                        <ul className="mt-4 space-y-2 overflow-y-auto min-h-0">
                            {NEWS.items.map(({ Icon, title, text, to, href }) => {
                                const body = (
                                    <>
                                        <Icon className="w-5 h-5 mt-0.5 shrink-0 text-[#e9c46a]" />
                                        <span className="min-w-0 flex-1">
                                            <b className="block text-sm text-white">{title}</b>
                                            <span className="block text-sm text-white/65">{text}</span>
                                        </span>
                                        <ChevronRight className="w-4 h-4 mt-1 shrink-0 text-white/35" />
                                    </>
                                );
                                return (
                                    <li key={title}>
                                        {href ? <a href={href} onClick={close} className={row}>{body}</a> : <Link to={to} onClick={close} className={row}>{body}</Link>}
                                    </li>
                                );
                            })}
                        </ul>
                        <button type="button" onClick={close} className="mt-5 nd-cta-gold py-3 rounded-full font-bold">C'est parti !</button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
