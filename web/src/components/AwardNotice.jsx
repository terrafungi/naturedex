import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { Crown, Frame } from 'lucide-react';
import { Nugget, NUGGET_COLOR } from './Currency.jsx';
import { api, useGame } from '../api.jsx';

const MEDALS = ['#e9c46a', '#c3ccd8', '#cd8a4a'];
const PLACES = ['1re', '2e', '3e'];

// "Monday" date of the contest week → « du 5 au 11 octobre »
function weekLabel(week) {
    const start = new Date(`${week}T12:00:00Z`);
    const end = new Date(start.getTime() + 6 * 86400_000);
    const day = (d, month) => d.toLocaleDateString('fr-FR', { day: 'numeric', ...(month ? { month: 'long' } : {}), timeZone: 'UTC' });
    return `du ${day(start, start.getUTCMonth() !== end.getUTCMonth())} au ${day(end, true)}`;
}

// Pop-up for the winners of the weekly showcase contest: one prize at a time, collected here.
// Shown after the gift pop-up; « Plus tard » keeps the prize (and the Vitrines badge) until the
// next visit of the Vitrines page.
export default function AwardNotice() {
    const { awards, setAwards, gifts, setUser } = useGame();
    const [later, setLater] = useState([]);
    const { pathname } = useLocation();
    useEffect(() => { if (pathname === '/vitrines') setLater([]); }, [pathname]);
    const [done, setDone] = useState(null); // prize just collected
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const award = done || (gifts.length ? null : awards.find((a) => !later.includes(a.week)));

    async function claim() {
        setBusy(true);
        setError('');
        try {
            const r = await api('claimShowcaseAward', { week: award.week });
            setDone(award);
            setAwards((list) => list.filter((a) => a.week !== award.week));
            setUser(r.user);
        } catch (e) {
            setError(e.message);
        } finally { setBusy(false); }
    }
    function close() {
        if (done) setDone(null);
        else setLater((l) => [...l, award.week]);
        setError('');
    }

    const medal = award && MEDALS[award.rank - 1];
    return (
        <AnimatePresence>
            {award && (
                <motion.div key="award-notice" className="fixed inset-0 z-[110] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="award-notice-title"
                        className="relative w-full max-w-sm rounded-[2rem] bg-[#081a11] ring-1 ring-[#e9c46a]/35 p-6 text-center shadow-[0_0_60px_rgba(233,196,106,0.18)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                        <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-full text-[#2a1c00] font-display text-2xl font-semibold"
                            style={{ background: medal, boxShadow: `0 0 32px ${medal}88` }}
                            initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: [-12, 10, -6, 0], scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
                            {award.rank === 1 ? <Crown className="w-8 h-8" /> : award.rank}
                        </motion.span>
                        <h2 id="award-notice-title" className="mt-4 font-display text-2xl text-white">
                            {done ? 'Récompense récupérée !' : award.rank === 1 ? 'Ta vitrine est n°1 !' : 'Ta vitrine est sur le podium !'}
                        </h2>
                        <p className="mt-2 text-sm text-white/75">
                            {PLACES[award.rank - 1]} place du concours des vitrines de la semaine {weekLabel(award.week)}, avec {award.votes} ♥.
                        </p>
                        <p className="mt-4 flex items-center justify-center gap-1.5 font-display text-3xl font-semibold tabular-nums" style={{ color: NUGGET_COLOR }}>
                            {done ? '+' : ''}{award.nuggets.toLocaleString('fr-FR')}<Nugget className="w-7 h-7" />
                        </p>
                        {error && <p className="mt-3 text-sm font-semibold text-[#ffc2ae]">{error}</p>}
                        <div className="mt-5 flex flex-col gap-2">
                            {done ? (
                                <>
                                    <Link to="/vitrines" onClick={close} className="nd-cta-gold py-3 rounded-full font-bold flex items-center justify-center gap-2">
                                        <Frame className="w-4 h-4" />Voir les vitrines
                                    </Link>
                                    <button type="button" onClick={close} className="py-3 rounded-full font-bold ring-1 ring-white/15 text-white/85 hover:bg-white/5">Fermer</button>
                                </>
                            ) : (
                                <>
                                    <button type="button" onClick={claim} disabled={busy} className="nd-cta-gold py-3 rounded-full font-bold disabled:opacity-60">
                                        {busy ? 'Un instant…' : `Récupérer ${award.nuggets} pépites`}
                                    </button>
                                    <button type="button" onClick={close} className="py-2 text-sm text-white/60 hover:text-white">Plus tard</button>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
