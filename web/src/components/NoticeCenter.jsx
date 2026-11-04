import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Bell, Gift, UserPlus } from 'lucide-react';
import { Amount } from './Currency.jsx';
import { api, useGame } from '../api.jsx';
import { sfx } from '../sfx.js';
import { hasNews } from '../news.js';

const names = (list) => (list.length <= 2 ? list.join(' et ') : `${list.slice(0, -1).join(', ')} et ${list.at(-1)}`);

function Item({ Icon, color, children, to, action, onClose }) {
    return (
        <li className="rounded-2xl bg-white/[0.05] ring-1 ring-white/10 px-4 py-3 flex gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-full shrink-0" style={{ background: `${color}22`, color }}><Icon className="w-4.5 h-4.5" /></span>
            <div className="min-w-0 flex-1 text-sm text-white/80">
                {children}
                {(to || action) && (
                    <div className="mt-2">
                        {action || <Link to={to} onClick={onClose} className="text-[#e9c46a] font-semibold hover:underline">Voir →</Link>}
                    </div>
                )}
            </div>
        </li>
    );
}

// « Pendant ton absence »: referrals, friend requests and trade offers that arrived since the last visit.
// Shown once, after the news, gift and prize pop-ups; closing it marks those events as seen.
export default function NoticeCenter() {
    const { user, setUser, notices, setNotices, gifts, awards, awardsLater, refreshBadges } = useGame();
    const [claimed, setClaimed] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const prizeWaiting = awards.some((a) => !awardsLater.includes(`${a.kind}:${a.week}`));
    const open = !!notices && !hasNews(user) && !gifts.length && !prizeWaiting;

    function close() {
        const invitesReady = claimed ? 0 : notices.invitesReady; // once collected, the next ones must show again
        setNotices(null);
        setClaimed(null);
        setError('');
        api('seenNotices', { invitesReady }).then(refreshBadges).catch(() => {});
    }
    async function claim() {
        setBusy(true);
        setError('');
        try {
            const r = await api('claimInvites');
            sfx.coin();
            setClaimed(r);
            setUser(r.user);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    const n = notices;
    const reward = n && n.inviteReward;
    return (
        <AnimatePresence>
            {open && (
                <motion.div key="notice-center" className="fixed inset-0 z-[110] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />
                    <motion.div role="dialog" aria-labelledby="notice-center-title"
                        className="relative w-full max-w-sm rounded-[2rem] bg-[#081a11] ring-1 ring-[#e9c46a]/35 p-6 text-center shadow-[0_0_60px_rgba(233,196,106,0.18)]"
                        initial={{ y: 30, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                        <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-[#e9c46a] text-[#2a1c00] shadow-[0_0_32px_rgba(233,196,106,0.55)]"
                            initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: [-12, 10, -6, 0], scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
                            <Bell className="w-8 h-8" />
                        </motion.span>
                        <h2 id="notice-center-title" className="mt-4 font-display text-2xl text-white">Pendant ton absence</h2>
                        <ul className="mt-4 space-y-2 text-left max-h-[50vh] overflow-y-auto">
                            {n.invitesReady > 0 && (
                                <Item Icon={Gift} color="#e9c46a" action={claimed ? (
                                    <span className="flex items-center gap-1.5 font-bold text-[#4fd18b]">Récupéré : <Amount seeds={claimed.coins} sign /><Amount nuggets={claimed.nuggets} sign /></span>
                                ) : (
                                    <button type="button" onClick={claim} disabled={busy} className="nd-cta-gold px-4 py-1.5 rounded-full text-sm font-bold disabled:opacity-60">
                                        {busy ? 'Un instant…' : 'Récupérer'}
                                    </button>
                                )}>
                                    <b className="text-white">Parrainage</b> : {n.invitesReady > 1 ? `${n.invitesReady} personnes invitées ont` : 'une personne invitée a'} assez joué,
                                    ta récompense est prête{n.invitesReady > 1 ? ` (×${n.invitesReady})` : ''} :
                                    <span className="ml-1 inline-flex gap-2"><Amount seeds={reward.coins * n.invitesReady} /><Amount nuggets={reward.nuggets * n.invitesReady} /></span>
                                    {error && <span className="block mt-1 font-semibold text-[#ffc2ae]">{error}</span>}
                                </Item>
                            )}
                            {n.invitees.length > 0 && (
                                <Item Icon={UserPlus} color="#4fd18b" to="/inviter" onClose={close}>
                                    <b className="text-white">{names(n.invitees)}</b> {n.invitees.length > 1 ? 'ont' : 'a'} rejoint NatureDex grâce à ton lien de parrainage.
                                    Ta récompense arrive après 2 jours de jeu de {n.invitees.length > 1 ? 'leur' : 'sa'} part.
                                </Item>
                            )}
                            {n.friendRequests.length > 0 && (
                                <Item Icon={UserPlus} color="#4ea8ff" to="/amis?onglet=demandes" onClose={close}>
                                    <b className="text-white">{names(n.friendRequests)}</b> {n.friendRequests.length > 1 ? "t'ont envoyé une demande d'amitié." : "t'envoie une demande d'amitié."}
                                </Item>
                            )}
                            {n.trades.map((t, i) => (
                                <Item key={i} Icon={ArrowLeftRight} color="#c39bff" to="/amis?onglet=echanges" onClose={close}>
                                    <b className="text-white">{t.from}</b> te propose un échange de cartes.
                                    {t.message && <span className="block mt-1 italic text-white/60 break-words">« {t.message} »</span>}
                                </Item>
                            ))}
                        </ul>
                        <button type="button" onClick={close} className="mt-5 w-full nd-cta-gold py-3 rounded-full font-bold">Compris !</button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
