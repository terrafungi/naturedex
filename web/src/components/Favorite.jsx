import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, FolderPlus, Star, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';

/** Star on a card's corner: filled when the card sits in at least one binder; opens the binder picker. */
export function FavoriteStar({ card, className = '' }) {
    const { user, favs } = useGame();
    const [open, setOpen] = useState(false);
    if (!user) return null;
    const on = !!favs.cards[card.id]?.length;
    // The star often sits on a link or a swipeable card: keep taps and drags to itself.
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    return (
        <>
            <button type="button" aria-label={on ? 'Dans tes favoris' : 'Ajouter aux favoris'} title={on ? 'Dans tes favoris' : 'Ajouter aux favoris'}
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { stop(e); setOpen(true); }}
                className={`grid place-items-center w-10 h-10 rounded-full shadow-lg ring-1 transition-colors ${on ? 'bg-[#e9c46a] ring-[#f4d88f] text-[#3b2a05]' : 'bg-[#0b2117]/90 ring-white/20 text-white/85 hover:text-[#f4d88f]'} ${className}`}>
                <Star className={`w-5 h-5 ${on ? 'fill-current' : ''}`} />
            </button>
            {createPortal(<AnimatePresence>{open && <BinderPicker card={card} onClose={() => setOpen(false)} />}</AnimatePresence>, document.body)}
        </>
    );
}

function BinderPicker({ card, onClose }) {
    const { favs, setFavs } = useGame();
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const inBinders = favs.cards[card.id] || [];

    async function run(action, params) {
        setBusy(true);
        setError('');
        try {
            const { id, ...state } = await api(action, params);
            setFavs(state);
            return true;
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }
    const toggle = (b) => run('binderCard', { binderId: b.id, cardId: card.id, on: !inBinders.includes(b.id) });
    async function create(e) {
        e.preventDefault();
        if (name.trim() && await run('createBinder', { name, cardId: card.id })) setName('');
    }

    return (
        <motion.div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            // React bubbles portal events to the star's ancestors (card link, swipe): stop them here
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="relative w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] bg-[#081a11] ring-1 ring-white/10 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                <h2 className="font-display text-2xl text-white pr-10 flex items-center gap-2"><Star className="w-5 h-5 text-[#e9c46a] fill-current" />Ajouter aux favoris</h2>
                <p className="mt-1 text-sm text-ink-soft">Dans quel classeur ranger <b className="text-white">{card.name}</b> ?</p>

                {favs.binders.length > 0 ? (
                    <ul className="mt-5 space-y-2">
                        {favs.binders.map((b) => {
                            const on = inBinders.includes(b.id);
                            return (
                                <li key={b.id}>
                                    <button type="button" disabled={busy} onClick={() => toggle(b)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left ring-1 transition-colors disabled:opacity-70 ${on ? 'bg-[#e9c46a]/15 ring-[#e9c46a]/60' : 'bg-white/[0.04] ring-white/10 hover:bg-white/10'}`}>
                                        <span className={`grid place-items-center w-6 h-6 rounded-md ring-1 ${on ? 'bg-[#e9c46a] ring-[#e9c46a] text-[#3b2a05]' : 'ring-white/30'}`}>{on && <Check className="w-4 h-4" />}</span>
                                        <span className="flex-1 font-semibold text-white truncate">{b.name}</span>
                                        <span className="text-xs text-ink-soft tabular-nums">{b.count} carte{b.count > 1 ? 's' : ''}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="mt-5 text-sm text-white/70">Tu n'as pas encore de classeur. Crée le premier, par exemple « Plantes » ou « Mes requins ».</p>
                )}

                <form onSubmit={create} className="mt-4 flex gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nouveau classeur…"
                        className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-black/30 ring-1 ring-white/15 text-white text-base outline-none focus:ring-[#e9c46a]/60 placeholder:text-white/35" />
                    <button disabled={busy || !name.trim()} className="flex items-center gap-1.5 px-4 rounded-2xl nd-btn font-bold text-sm disabled:opacity-50"><FolderPlus className="w-4 h-4" />Créer</button>
                </form>
                {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                <button type="button" onClick={onClose} className="mt-5 w-full py-3 rounded-full bg-white/10 text-white font-semibold hover:bg-white/15">Terminé</button>
            </motion.div>
        </motion.div>
    );
}
