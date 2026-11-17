import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Bell, Gift, Lock, Snowflake, Sparkles, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { sfx } from '../sfx.js';

// Doors are scattered like on a real calendar; 23 (wide) and 24 (big) are the finale.
const ORDER = [7, 19, 2, 13, 22, 10, 4, 16, 1, 21, 9, 14, 24, 5, 18, 11, 3, 20, 8, 15, 23, 6, 12, 17];
const EASE = [0.22, 1, 0.36, 1];

function Door({ door, onOpen, onShow, busy, index }) {
    const { day, state, card } = door;
    const big = day === 24 ? 'col-span-2 row-span-2' : day === 23 ? 'col-span-2' : '';
    const open = state === 'opened' || state === 'missed';
    const click = state === 'today' ? () => onOpen(day) : card ? () => onShow(card, state) : undefined;
    return (
        <motion.button type="button" onClick={click} disabled={busy || !click}
            className={`nd-door ${big}`} data-state={state} data-big={day === 24 ? '' : undefined}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 + index * 0.03, ease: EASE }}
            aria-label={`Case ${day}${state === 'today' ? ', à ouvrir aujourd’hui' : state === 'opened' ? `, ${card?.name}` : state === 'missed' ? ', perdue' : ''}`}>
            {card && <img src={card.thumb_url} alt="" className="nd-door-card" draggable="false" loading="lazy" />}
            {state === 'missed' && <span className="nd-door-lost">Perdue</span>}
            {state === 'opened' && card && <span className="nd-door-name">{card.name}</span>}
            <span className="nd-door-leaf" data-open={open ? '' : undefined}>
                <span className="nd-door-num">{day}</span>
                {state === 'today' && <span className="nd-door-cta"><Gift className="w-3.5 h-3.5" />Ouvrir</span>}
                {state === 'future' && <Lock className="nd-door-lock" />}
            </span>
        </motion.button>
    );
}

function Reveal({ shown, onClose }) {
    const { card, state, fresh, secret } = shown;
    return (
        <motion.div className="fixed inset-0 z-[120] grid place-items-center p-4 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[#05070f]/85 backdrop-blur-md" onClick={onClose} />
            {fresh && <div className="nd-advent-flakes" aria-hidden />}
            <motion.div className="relative w-full max-w-[19rem] text-center" initial={{ scale: 0.6, rotateY: 180, opacity: 0 }}
                animate={{ scale: 1, rotateY: 0, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: 0.9, ease: EASE }}>
                <button type="button" onClick={onClose} className="absolute -top-2 -right-2 z-10 grid place-items-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fermer">
                    <X className="w-5 h-5" />
                </button>
                <p className="uppercase tracking-[0.3em] text-[0.65rem] font-bold text-[#f7d774]">
                    {state === 'missed' ? `Case n°${card.day} · perdue` : fresh ? `Case n°${card.day} · nouvelle carte !` : `Case n°${card.day}`}
                </p>
                {secret && <div className="nd-art-banner mt-2">✦ Secrète · une chance sur dix ✦</div>}
                <div className={`mt-3 ${state === 'missed' ? 'grayscale-[0.7] opacity-70' : ''}`}>
                    <Card card={card} tilt />
                </div>
                {card.note && <p className="mt-4 text-sm leading-relaxed text-white/80 italic">« {card.note} »</p>}
                {state === 'missed' && <p className="mt-2 text-sm text-[#ffb4a2]">Cette case n'a pas été ouverte le {card.day} décembre : la carte est perdue.</p>}
                <div className="mt-5 flex justify-center gap-2">
                    {state !== 'missed' && <Link to={`/carte/${card.id}`} className="nd-cta-glass px-4 py-2.5 rounded-full text-sm font-semibold text-white">Voir la fiche</Link>}
                    <button type="button" onClick={onClose} className="nd-cta-gold px-5 py-2.5 rounded-full text-sm font-bold">{fresh ? 'Joyeux Noël !' : 'Fermer'}</button>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function Advent() {
    const { setUser, addCards } = useGame();
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [shown, setShown] = useState(null);

    useEffect(() => { api('advent').then(setData).catch((e) => setError(e.message)); }, []);

    async function open(day) {
        setBusy(true);
        setError('');
        sfx.tear();
        try {
            const r = await api('adventOpen', { day });
            setData(r.calendar);
            setUser(r.user);
            addCards([r.card]);
            setTimeout(() => (r.secret ? sfx.reveal() : sfx.newCard()), 250);
            setShown({ card: r.card, state: 'opened', fresh: true, secret: r.secret });
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }

    const doors = data && ORDER.map((d) => data.doors[d - 1]);
    const missed = data?.doors.filter((d) => d.state === 'missed').length || 0;
    return (
        <div className="nd-advent relative isolate overflow-hidden">
            <div className="nd-advent-sky" aria-hidden />
            <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-24">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }}>
                    <p className="flex items-center gap-2 uppercase tracking-[0.3em] text-[0.7rem] font-bold text-[#f7d774]">
                        <Snowflake className="w-4 h-4" />Du 1er au 24 décembre {data?.year || ''}
                    </p>
                    <h1 className="mt-2 font-display font-medium leading-[0.95] text-[clamp(2.6rem,9vw,5.2rem)] text-white">
                        Calendrier<br /><span className="italic text-[#ff8f8f]">de l'Avent</span>
                    </h1>
                    <p className="mt-4 max-w-xl text-white/75">
                        Une carte de Noël derrière chaque case : sapins, épices, animaux du Grand Nord et présents des Rois mages.
                        Elles ne sortent jamais dans les boosters. <b className="text-white">Une case non ouverte le jour même est perdue.</b>
                        Le 23, le renne en full art légendaire ; le 24, le père Noël… avec une chance sur dix de le recevoir en version secrète.
                    </p>
                </motion.div>

                {error && <p className="mt-5 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                {data && (
                    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                        <span className="nd-advent-pill"><Gift className="w-4 h-4 text-[#f7d774]" />{data.opened} / 24 cartes</span>
                        {missed > 0 && <span className="nd-advent-pill text-white/70">{missed} perdue{missed > 1 ? 's' : ''}</span>}
                        {data.phase === 'before' && <span className="nd-advent-pill text-[#f7d774]">Ouverture le 1er décembre</span>}
                        {data.phase === 'after' && <span className="nd-advent-pill text-white/70">Le calendrier est terminé, joyeuses fêtes !</span>}
                        {data.phase === 'open' && (
                            <Link to="/profil" className="nd-advent-pill text-white/80 hover:text-white"><Bell className="w-4 h-4" />Rappel chaque matin</Link>
                        )}
                    </div>
                )}

                {!data ? (
                    !error && <div className="py-24 text-center font-display text-lg text-white/60">Chargement…</div>
                ) : (
                    <div className="nd-advent-board mt-6 grid grid-cols-4 sm:grid-cols-7 gap-2.5 sm:gap-3 [grid-auto-flow:dense]">
                        {doors.map((door, i) => (
                            <Door key={door.day} door={door} index={i} busy={busy} onOpen={open}
                                onShow={(card, state) => setShown({ card, state })} />
                        ))}
                    </div>
                )}

                {data?.secret && (
                    <div className="mt-10 flex items-center gap-4 rounded-3xl bg-white/[0.05] ring-1 ring-white/10 p-4">
                        <Sparkles className="w-6 h-6 shrink-0 text-[#ff5fd2]" />
                        <p className="text-sm text-white/80">
                            {data.phase === 'before' ? 'Aperçu administrateur : ' : 'Tu as reçu '}
                            <button type="button" className="font-bold text-white underline underline-offset-4" onClick={() => setShown({ card: data.secret, state: 'opened', secret: true })}>
                                le père Noël secret
                            </button>.
                        </p>
                    </div>
                )}
            </div>
            <AnimatePresence>{shown && <Reveal key="reveal" shown={shown} onClose={() => setShown(null)} />}</AnimatePresence>
        </div>
    );
}
