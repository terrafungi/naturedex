import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, PlusSquare, Share, X } from 'lucide-react';

const DISMISS_KEY = 'naturdex.installLater';
const DISMISS_DAYS = 14;
const DELAY_MS = 15_000;
const OPEN_EVENT = 'nd:install';

// Chrome / Edge / Samsung fire `beforeinstallprompt` once, maybe before React mounts:
// keep it at module level so any component can use it later.
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
    window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// iOS has no install prompt: the player goes through the Share menu. In-app browsers
// (Instagram, Facebook…) cannot add to the home screen at all.
const isIOS = (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !/FBAN|FBAV|Instagram|Line\//.test(ua);

/** 'prompt' (native install dialog), 'ios' (Share → home screen) or null (installed / not possible). */
export function useInstall() {
    const ready = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => deferred);
    const mode = standalone() ? null : ready ? 'prompt' : isIOS ? 'ios' : null;
    return { mode, open: () => window.dispatchEvent(new Event(OPEN_EVENT)) };
}

const later = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();

/** Link for the footer: reopens the pop-up on demand. */
export function InstallLink() {
    const { mode, open } = useInstall();
    if (!mode) return null;
    return (
        <button onClick={open} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-[#a8f0c6] hover:text-white">
            <Download className="w-3.5 h-3.5" />Installer l'application
        </button>
    );
}

export default function InstallPrompt({ raised }) {
    const { mode } = useInstall();
    const [show, setShow] = useState(false);

    useEffect(() => {
        const open = () => setShow(true);
        window.addEventListener(OPEN_EVENT, open);
        return () => window.removeEventListener(OPEN_EVENT, open);
    }, []);
    // Offered once the visitor has had time to look around, then again after DISMISS_DAYS.
    useEffect(() => {
        if (!mode || later()) return;
        const t = setTimeout(() => { if (!later()) setShow(true); }, DELAY_MS); // the beta pop-up may have snoozed it meanwhile
        return () => clearTimeout(t);
    }, [mode]);

    function dismiss() {
        localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
        setShow(false);
    }
    async function install() {
        const e = deferred;
        if (!e) return;
        e.prompt();
        const { outcome } = await e.userChoice.catch(() => ({}));
        deferred = null;
        notify();
        if (outcome === 'accepted') setShow(false);
        else dismiss();
    }

    return (
        <AnimatePresence>
            {show && mode && (
                <motion.div role="dialog" aria-labelledby="install-title"
                    className={`fixed inset-x-3 sm:inset-x-auto sm:right-5 sm:w-[24rem] z-[105] rounded-3xl bg-[#081a11]/95 backdrop-blur-xl ring-1 ring-[#e9c46a]/40 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_50px_-20px_#e9c46a] p-4 ${raised ? 'bottom-28' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'}`}
                    initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                    <button onClick={dismiss} aria-label="Fermer" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10">
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 pr-8">
                        <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-lg shadow-black/40 shrink-0" />
                        <div className="min-w-0">
                            <h2 id="install-title" className="font-display text-xl text-white leading-tight">Installe NatureDex</h2>
                            <p className="text-[13px] text-white/65 leading-snug">L'appli sur ton écran d'accueil : en plein écran, ouverte en un geste.</p>
                        </div>
                    </div>
                    {mode === 'prompt' ? (
                        <div className="mt-4 flex gap-2">
                            <button onClick={dismiss} className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white/75 ring-1 ring-white/15 hover:bg-white/5">Plus tard</button>
                            <button onClick={install} className="flex-[1.4] nd-cta-gold inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold">
                                <Download className="w-4 h-4" />Installer
                            </button>
                        </div>
                    ) : (
                        <ol className="mt-4 space-y-2 text-sm text-white/85">
                            <li className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
                                <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#4fd18b]/15 text-[#7cc6ff] shrink-0"><Share className="w-4 h-4" /></span>
                                <span>Touche <b className="text-white">Partager</b> dans la barre du navigateur</span>
                            </li>
                            <li className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
                                <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#4fd18b]/15 text-[#a8f0c6] shrink-0"><PlusSquare className="w-4 h-4" /></span>
                                <span>Choisis <b className="text-white">Sur l'écran d'accueil</b></span>
                            </li>
                        </ol>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
