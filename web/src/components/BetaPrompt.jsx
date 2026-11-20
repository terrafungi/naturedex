import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Check, Clock, Download, Gift, Mail, UserPlus, Users, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { isPlayApp } from '../play.js';

const DISMISS_KEY = 'naturdex.betaLater3'; // new key: everyone who closed an earlier version sees this one once
const DONE_KEY = 'naturdex.betaDone'; // left an address (the 2 Google steps may still be missing)
const REWARDED_KEY = 'naturdex.betaRewarded'; // opened the Android app: really a tester, never ask again
const INSTALL_KEY = 'naturdex.installLater'; // see InstallPrompt: the real app replaces the home-screen install
const JOIN_DAYS = 5;
const FINISH_DAYS = 2; // signed up but not in the app yet: they are the closest to counting, remind them sooner
const DELAY_MS = 8_000;

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isAndroid = /android/i.test(ua);
const snoozed = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
const snooze = (key, days) => localStorage.setItem(key, String(Date.now() + days * 86_400_000));

/** Closed test of the Android app: Google needs 12 testers. Pitches the tester reward, brings back the players
 *  who left an address without finishing the Google steps, and gives the reward when the app is opened. */
export default function BetaPrompt() {
    const { user, setUser } = useGame();
    const [mode, setMode] = useState(null); // 'join' | 'finish' | 'thanks'
    const [info, setInfo] = useState(null);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const claimed = useRef(false);

    // In the Android app: the reward, once per account (the server ignores repeats).
    useEffect(() => {
        if (!isPlayApp() || !user?.id || claimed.current) return;
        claimed.current = true;
        api('betaReward').then((r) => {
            localStorage.setItem(REWARDED_KEY, '1');
            if (!r.granted) return;
            setUser(r.user);
            setInfo({ reward: r.granted });
            setMode('thanks');
        }).catch(() => {});
    }, [user?.id, setUser]);

    // On the Android web site: invite, or remind to finish.
    useEffect(() => {
        if (!isAndroid || isPlayApp() || localStorage.getItem(REWARDED_KEY) || snoozed()) return;
        let t;
        api('betaInfo').then((b) => {
            if (!b.open || b.rewarded) return;
            if (b.signedUp) localStorage.setItem(DONE_KEY, '1');
            setInfo(b);
            t = setTimeout(() => { setMode(localStorage.getItem(DONE_KEY) ? 'finish' : 'join'); snooze(INSTALL_KEY, 14); }, DELAY_MS);
        }).catch(() => {});
        return () => clearTimeout(t);
    }, []);

    function dismiss() {
        if (mode !== 'thanks') snooze(DISMISS_KEY, mode === 'finish' ? FINISH_DAYS : JOIN_DAYS);
        setMode(null);
    }
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api('betaSignup', { email });
            localStorage.setItem(DONE_KEY, '1');
            setMode('finish');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const reward = info?.reward || 5;
    return (
        <AnimatePresence>
            {mode && (
                <motion.div key="beta" className="fixed inset-0 z-[112] grid place-items-end sm:place-items-center p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
                    <motion.div role="dialog" aria-labelledby="beta-title"
                        className="relative w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[2rem] bg-[#081a11] ring-1 ring-[#e9c46a]/40 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_50px_-20px_#e9c46a] p-5 mb-[env(safe-area-inset-bottom)]"
                        initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                        <button onClick={dismiss} aria-label="Fermer" className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10">
                            <X className="w-4 h-4" />
                        </button>
                        {mode === 'thanks' ? <Thanks reward={reward} onClose={dismiss} />
                            : mode === 'finish' ? <Finish info={info} reward={reward} onLater={dismiss} />
                                : <Join info={info} reward={reward} email={email} setEmail={setEmail} busy={busy} error={error} onSubmit={submit} onLater={dismiss} />}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function Header({ eyebrow, title }) {
    return (
        <div className="flex items-center gap-3 pr-8">
            <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-lg shadow-black/40 shrink-0" />
            <div className="min-w-0">
                <p className="uppercase tracking-[0.22em] text-[0.62rem] font-bold text-[#e9c46a]">{eyebrow}</p>
                <h2 id="beta-title" className="font-display text-xl text-white leading-tight">{title}</h2>
            </div>
        </div>
    );
}

/** 12 slots, filled ones are the testers already in. */
function Gauge({ info }) {
    if (!info?.goal) return null;
    const { testers, goal } = info;
    const missing = Math.max(0, goal - testers);
    return (
        <div className="mt-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-white"><b className="font-display text-2xl text-[#e9c46a]">{Math.min(testers, goal)}</b><span className="text-white/50"> / {goal} testeurs</span></p>
                <p className="text-xs font-bold text-[#a8f0c6]">{missing ? `Plus que ${missing} !` : 'Objectif atteint, merci !'}</p>
            </div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` }}>
                {Array.from({ length: goal }, (_, i) => (
                    <motion.span key={i} className={`h-2 rounded-full ${i < testers ? 'bg-[#4fd18b]' : i === testers ? 'bg-[#e9c46a]/70' : 'bg-white/10'}`}
                        initial={{ scaleY: 0 }} animate={{ scaleY: 1, opacity: i === testers ? [1, 0.35, 1] : 1 }}
                        transition={{ delay: 0.15 + i * 0.04, opacity: { repeat: Infinity, duration: 1.4 } }} />
                ))}
            </div>
            {missing > 0 && <p className="mt-2 text-[11px] text-white/55 leading-snug">Google exige {goal} testeurs pendant 14 jours avant de publier l'appli. Ta place est la prochaine.</p>}
        </div>
    );
}

function RewardBadge({ reward, children }) {
    return (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#e9c46a]/20 to-[#e9c46a]/5 ring-1 ring-[#e9c46a]/45 px-3 py-2.5">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#e9c46a]/25 text-[#e9c46a] shrink-0"><Gift className="w-5 h-5" /></span>
            <p className="text-[13px] text-white/80 leading-snug"><b className="text-white">{reward} boosters offerts</b> {children}</p>
        </div>
    );
}

function Join({ info, reward, email, setEmail, busy, error, onSubmit, onLater }) {
    const missing = info?.goal ? Math.max(0, info.goal - info.testers) : 0;
    return (
        <form onSubmit={onSubmit}>
            <Header eyebrow={missing ? `Il manque ${missing} testeurs` : 'Test fermé Android'} title="Aide NatureDex à sortir sur le Play Store" />
            <Gauge info={info} />
            <RewardBadge reward={reward}>dès ta première ouverture de l'appli Android.</RewardBadge>
            <ul className="mt-3 space-y-1.5 text-[13px] text-white/70 leading-snug">
                <li className="flex gap-2.5"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#a8f0c6]" />
                    <span><b className="text-white">2 minutes</b>, gratuit, ton compte et ta collection te suivent.</span></li>
                <li className="flex gap-2.5"><Bell className="w-4 h-4 mt-0.5 shrink-0 text-[#a8f0c6]" />
                    <span><b className="text-white">Notifications push</b> : boosters rechargés, enchères, messages et cadeaux d'amis.</span></li>
            </ul>
            <p className="mt-3 text-[13px] text-white/70">Ton adresse <b className="text-white">Gmail du Play Store</b> :</p>
            <label className="mt-1.5 flex items-center gap-2 rounded-full bg-white/[0.06] ring-1 ring-white/15 focus-within:ring-[#e9c46a]/70 px-4">
                <Mail className="w-4 h-4 text-white/45 shrink-0" />
                <input type="email" required autoComplete="email" inputMode="email" placeholder="toi@gmail.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent py-3 text-sm text-white placeholder:text-white/35 outline-none" />
            </label>
            {error && <p className="mt-2 text-xs text-[#ff9b8a]">{error}</p>}
            <div className="mt-3 flex gap-2">
                <button type="button" onClick={onLater} className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white/75 ring-1 ring-white/15 hover:bg-white/5">Plus tard</button>
                <button disabled={busy} className="flex-[1.6] nd-cta-gold inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold disabled:opacity-60">
                    <UserPlus className="w-4 h-4" />{busy ? 'Inscription…' : 'Je deviens testeur'}
                </button>
            </div>
        </form>
    );
}

function Finish({ info, reward, onLater }) {
    const step = 'flex items-center gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 px-3 py-2.5 hover:bg-white/[0.09] transition-colors';
    const num = 'grid place-items-center w-8 h-8 rounded-lg bg-[#4fd18b]/15 text-[#a8f0c6] shrink-0 font-bold text-sm';
    return (
        <div>
            <Header eyebrow="Plus que 3 clics" title="Tu y es presque !" />
            <p className="mt-3 text-[13px] text-white/70 leading-snug">
                Ton adresse est notée, mais <b className="text-white">Google ne te compte comme testeur</b> qu'après ces étapes. Fais-les dans l'ordre, avec le même compte Google :
            </p>
            {info?.group && (
                <ol className="mt-3 space-y-2 text-sm text-white/85">
                    <li><a href={info.group} target="_blank" rel="noopener" className={step}>
                        <span className={num}>1</span>
                        <span className="flex-1"><b className="text-white">Rejoins le groupe</b> : « Rejoindre le groupe »</span><Users className="w-4 h-4 text-white/40" />
                    </a></li>
                    <li><a href={info.optIn} target="_blank" rel="noopener" className={step}>
                        <span className={num}>2</span>
                        <span className="flex-1"><b className="text-white">Deviens testeur</b> : « Devenir testeur »</span><UserPlus className="w-4 h-4 text-white/40" />
                    </a></li>
                    <li><a href={info.store} target="_blank" rel="noopener" className={`${step} ring-[#e9c46a]/40`}>
                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#e9c46a]/20 text-[#e9c46a] shrink-0 font-bold text-sm">3</span>
                        <span className="flex-1"><b className="text-white">Installe NatureDex</b> et ouvre-le</span><Download className="w-4 h-4 text-[#e9c46a]" />
                    </a></li>
                </ol>
            )}
            <RewardBadge reward={reward}>t'attendent à la première ouverture, connecté à ton compte.</RewardBadge>
            <Gauge info={info} />
            <p className="mt-3 text-[11px] text-white/50 leading-snug">Si NatureDex n'apparaît pas tout de suite sur Google Play après l'étape 2, attends quelques minutes. Garde l'appli installée 14 jours : c'est ce qui compte pour Google.</p>
            <button type="button" onClick={onLater} className="mt-3 w-full py-2.5 rounded-full text-sm font-semibold text-white/75 ring-1 ring-white/15 hover:bg-white/5">Je finis plus tard</button>
        </div>
    );
}

function Thanks({ reward, onClose }) {
    return (
        <div className="text-center pt-2">
            <motion.span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-[#e9c46a]/25 text-[#e9c46a]"
                initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
                <Gift className="w-8 h-8" />
            </motion.span>
            <p className="mt-3 uppercase tracking-[0.22em] text-[0.62rem] font-bold text-[#e9c46a]">Merci, testeur !</p>
            <h2 id="beta-title" className="font-display text-2xl text-white leading-tight">+{reward} boosters offerts</h2>
            <p className="mt-2 text-[13px] text-white/70 leading-snug">Ils sont déjà dans ton compte. Garde l'appli installée et ouvre-la de temps en temps pendant 14 jours : c'est ce qui permettra à NatureDex de sortir sur le Play Store.</p>
            <button type="button" onClick={onClose} className="mt-4 w-full nd-cta-gold inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold">
                <Check className="w-4 h-4" />Super !
            </button>
        </div>
    );
}
