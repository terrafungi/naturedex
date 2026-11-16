import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Download, Mail, UserPlus, Users, X } from 'lucide-react';
import { api } from '../api.jsx';
import { isPlayApp } from '../play.js';

const DISMISS_KEY = 'naturdex.betaLater';
const INSTALL_KEY = 'naturdex.installLater'; // see InstallPrompt: the real app replaces the home-screen install
const DISMISS_DAYS = 14;
const DELAY_MS = 8_000;

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isAndroid = /android/i.test(ua);
// Already inside the app (Play Store TWA) or the installed web app: nothing to offer.
const inApp = () => isPlayApp() || window.matchMedia('(display-mode: standalone)').matches;
const later = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
const snooze = (key) => localStorage.setItem(key, String(Date.now() + DISMISS_DAYS * 86_400_000));

/** Closed beta of the Android app: leave an email, get the 3 links to install it. Android visitors only. */
export default function BetaPrompt() {
    const [show, setShow] = useState(false);
    const [email, setEmail] = useState('');
    const [links, setLinks] = useState(null); // set once signed up
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isAndroid || inApp() || later()) return;
        let t;
        api('betaInfo').then((b) => {
            if (!b.open) return;
            t = setTimeout(() => { setShow(true); snooze(INSTALL_KEY); }, DELAY_MS);
        }).catch(() => {});
        return () => clearTimeout(t);
    }, []);

    function dismiss() {
        snooze(DISMISS_KEY);
        setShow(false);
    }
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            setLinks(await api('betaSignup', { email }));
            snooze(DISMISS_KEY);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const step = 'flex items-center gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 px-3 py-2.5 hover:bg-white/[0.09] transition-colors';
    const num = 'grid place-items-center w-8 h-8 rounded-lg bg-[#4fd18b]/15 text-[#a8f0c6] shrink-0';
    return (
        <AnimatePresence>
            {show && (
                <motion.div key="beta" className="fixed inset-0 z-[112] grid place-items-end sm:place-items-center p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
                    <motion.div role="dialog" aria-labelledby="beta-title"
                        className="relative w-full max-w-md rounded-[2rem] bg-[#081a11] ring-1 ring-[#e9c46a]/40 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_50px_-20px_#e9c46a] p-5 mb-[env(safe-area-inset-bottom)]"
                        initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                        <button onClick={dismiss} aria-label="Fermer" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-3 pr-8">
                            <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-lg shadow-black/40 shrink-0" />
                            <div className="min-w-0">
                                <p className="uppercase tracking-[0.22em] text-[0.62rem] font-bold text-[#e9c46a]">Bêta fermée Android</p>
                                <h2 id="beta-title" className="font-display text-xl text-white leading-tight">Teste l'appli avant tout le monde</h2>
                            </div>
                        </div>

                        {!links ? (
                            <form onSubmit={submit} className="mt-4">
                                <p className="text-[13px] text-white/70 leading-snug">
                                    NatureDex arrive sur Google Play. Inscris-toi avec l'adresse <b className="text-white">Gmail de ton compte Play Store</b> et reçois le lien de téléchargement.
                                </p>
                                <label className="mt-3 flex items-center gap-2 rounded-full bg-white/[0.06] ring-1 ring-white/15 focus-within:ring-[#e9c46a]/70 px-4">
                                    <Mail className="w-4 h-4 text-white/45 shrink-0" />
                                    <input type="email" required autoComplete="email" inputMode="email" placeholder="toi@gmail.com" value={email}
                                        onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent py-3 text-sm text-white placeholder:text-white/35 outline-none" />
                                </label>
                                {error && <p className="mt-2 text-xs text-[#ff9b8a]">{error}</p>}
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={dismiss} className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white/75 ring-1 ring-white/15 hover:bg-white/5">Plus tard</button>
                                    <button disabled={busy} className="flex-[1.4] nd-cta-gold inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold disabled:opacity-60">
                                        <UserPlus className="w-4 h-4" />{busy ? 'Inscription…' : 'Je m\'inscris'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="mt-4">
                                <p className="flex items-center gap-2 text-sm font-semibold text-[#a8f0c6]"><Check className="w-4 h-4" />C'est noté ! Plus que 3 étapes :</p>
                                <ol className="mt-3 space-y-2 text-sm text-white/85">
                                    <li><a href={links.group} target="_blank" rel="noopener" className={step}>
                                        <span className={num}><Users className="w-4 h-4" /></span>
                                        <span><b className="text-white">Rejoins le groupe</b> des testeurs (bouton « Rejoindre le groupe »)</span>
                                    </a></li>
                                    <li><a href={links.optIn} target="_blank" rel="noopener" className={step}>
                                        <span className={num}><UserPlus className="w-4 h-4" /></span>
                                        <span><b className="text-white">Deviens testeur</b> : touche « Devenir testeur »</span>
                                    </a></li>
                                    <li><a href={links.store} target="_blank" rel="noopener" className={`${step} ring-[#e9c46a]/40`}>
                                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#e9c46a]/20 text-[#e9c46a] shrink-0"><Download className="w-4 h-4" /></span>
                                        <span><b className="text-white">Télécharge NatureDex</b> sur Google Play</span>
                                    </a></li>
                                </ol>
                                <p className="mt-3 text-[11px] text-white/50 leading-snug">Utilise le même compte Google partout. L'appli peut mettre quelques minutes à apparaître après l'étape 2.</p>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
