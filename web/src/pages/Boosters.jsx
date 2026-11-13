import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Clapperboard, Gift, Sprout, Zap } from 'lucide-react';
import { Amount, Plant, Seed } from '../components/Currency.jsx';
import { api, useGame } from '../api.jsx';
import { Pack } from '../components/Pack.jsx';
import BoosterOpening, { pendingBooster } from '../components/BoosterOpening.jsx';
import { TYPES } from '../game.jsx';
import { adsEnabled, loadAds, showRewardedAd } from '../ads.js';

export function useCountdown(iso, onDone) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!iso) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [iso]);
    const ms = iso ? Math.max(0, new Date(iso).getTime() - now) : 0;
    useEffect(() => { if (iso && ms === 0) onDone?.(); }, [iso, ms === 0]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!iso || ms === 0) return null;
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
    return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
}

// Ten free openings, refilled one by one every 30 min (15 with the pass).
function ChargeGauge({ user }) {
    return (
        <div className="relative w-full max-w-xs mt-6">
            <div className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-1.5 text-white"><Zap className="w-4 h-4 text-[#f4d88f] fill-[#f4d88f]/40" />Charges gratuites</span>
                <span className="tabular-nums text-white">{user.charges}<span className="text-white/50">/{user.maxCharges}</span></span>
            </div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${user.maxCharges}, 1fr)` }}>
                {Array.from({ length: user.maxCharges }, (_, i) => (
                    <motion.span key={i} className="h-2.5 rounded-full"
                        initial={false}
                        animate={{ background: i < user.charges ? '#f4d88f' : 'rgba(255,255,255,0.12)', boxShadow: i < user.charges ? '0 0 10px -2px #e9c46a' : '0 0 0 0 transparent' }} />
                ))}
            </div>
        </div>
    );
}

export default function Boosters() {
    const { user, setUser, catalog, owned, ownedInfo, addCards } = useGame();
    const [opening, setOpening] = useState(() => pendingBooster(user.username)?.cards || null);
    const [bonus, setBonus] = useState(null);
    const [godPack, setGodPack] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const countdown = useCountdown(user.nextDailyAt);
    const refresh = () => api('me').then((res) => setUser(res.user)).catch(() => {});
    const nextCharge = useCountdown(user.nextChargeAt, refresh);
    // What the next opening costs: a free charge, a bonus booster, garden plants, or graines.
    const payWith = user.charges > 0 ? 'charge' : user.boosters > 0 ? 'booster' : user.plants >= user.boosterPlants ? 'plants' : 'coins';
    const canOpen = payWith !== 'coins' || user.coins >= user.boosterPrice;

    // A ref, not the busy state: a fast double tap fires twice before React re-renders.
    const inFlight = useRef(false);
    async function run(action, after, params) {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
            const res = await api(action, params);
            setUser(res.user);
            after?.(res);
        } catch (err) {
            setError(err.message);
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    }

    const open = () => run('openBooster', (res) => { addCards(res.cards); setBonus(res.bonus || null); setGodPack(!!res.godPack); setOpening(res.cards); }, { pay: payWith === 'plants' ? 'plants' : payWith === 'coins' });
    const daily = () => run('claimDaily');

    // Rewarded ad: the server hands out a token, the reward is claimable once the ad was watched
    // (with AppLixir, once AppLixir's servers have confirmed it to ours).
    const [ads, setAds] = useState(null);
    const [adNote, setAdNote] = useState('');
    useEffect(() => {
        if (!adsEnabled()) return;
        // AppLixir test flag, set by ?applixir on any page (main.jsx)
        const test = localStorage.getItem('applixirTest') === '1';
        api('adStatus').then((s) => {
            const status = test ? { ...s, provider: 'applixir' } : s;
            loadAds(status.provider);
            setAds(status);
        }).catch(() => {});
    }, []);
    async function watchAd() {
        setBusy(true);
        setError('');
        setAdNote('');
        try {
            const started = Date.now();
            const applixir = ads.provider === 'applixir';
            // AppLixir's player must open inside the click, so the token is asked for at the same time
            const starting = api('adStart');
            if (!applixir) await starting;
            const result = await showRewardedAd(ads.provider, ads.adUser);
            const { token } = await starting;
            if (result !== 'viewed') {
                setAdNote(result === 'dismissed' ? 'Pub interrompue : pas de booster cette fois.' : 'Aucune pub disponible pour l\'instant, réessaie un peu plus tard.');
                return;
            }
            let res;
            if (applixir) {
                setAdNote('Pub terminée, ton booster arrive…');
                for (let i = 0; i < 15 && !res; i++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    res = await api('adClaim', { token, wait: true }).catch(() => null);
                }
                if (!res) {
                    setAdNote('Confirmation en attente : ton booster apparaîtra dans quelques minutes.');
                    return;
                }
            } else {
                await new Promise((r) => setTimeout(r, Math.max(0, started + 12500 - Date.now())));
                res = await api('adClaim', { token });
            }
            setUser(res.user);
            setAds((a) => ({ ...a, adsLeft: res.adsLeft }));
            setAdNote('+1 booster offert ! Ouvre-le avec le bouton du paquet.');
        } catch (err) {
            setAdNote(err.message);
        } finally {
            setBusy(false);
        }
    }

    const total = catalog?.total || user.total;
    const discovered = Object.keys(owned).length;
    const byType = Object.keys(TYPES).map((key) => ({
        key,
        total: Object.values(catalog?.types[key] || {}).reduce((a, n) => a + n, 0),
        have: Object.values(ownedInfo).filter(([type]) => type === key).length,
    }));

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Carnet de {user.username}</p>
                    <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white mt-1">
                        {discovered} <span className="text-ink-soft font-medium text-2xl sm:text-3xl">/ {total.toLocaleString('fr-FR')} espèces découvertes</span>
                    </h1>
                </div>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-[#2fa866] via-[#4fd18b] to-[#e9c46a]" initial={{ width: 0 }} animate={{ width: `${(discovered / Math.max(total, 1)) * 100}%` }} transition={{ duration: 1 }} />
            </div>

            <div className="mt-10 grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
                {/* the pack */}
                <div className="relative flex flex-col items-center p-8 rounded-[2rem] nd-glass nd-ring text-paper overflow-hidden">
                    <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 50% 30%, #e9c46a, transparent 55%), radial-gradient(circle at 30% 90%, #2fa866, transparent 50%)' }} />
                    <motion.button
                        disabled={busy || !canOpen}
                        onClick={open}
                        className="relative w-[200px] sm:w-[230px] disabled:grayscale disabled:opacity-60"
                        whileHover={canOpen ? { y: -8, rotate: -2 } : {}}
                        whileTap={canOpen ? { scale: 0.96 } : {}}
                    >
                        <Pack />
                        {user.charges > 0 && (
                            <span className="absolute -top-3 -right-3 min-w-10 h-10 px-2 grid place-items-center rounded-full bg-rust text-paper font-display font-black text-lg shadow-lg">
                                ×{user.charges}
                            </span>
                        )}
                    </motion.button>
                    <ChargeGauge user={user} />
                    <p className="relative mt-2 w-full max-w-xs text-xs text-white/60 flex justify-between gap-2">
                        <span>{nextCharge ? <>Prochaine charge dans <b className="text-white tabular-nums">{nextCharge}</b></> : 'Jauge pleine'}</span>
                        <span>+1 {user.chargeMinutes === 60 ? 'toutes les heures' : `toutes les ${user.chargeMinutes} min`}</span>
                    </p>
                    {!user.pass && (
                        <Link to="/boutique" className="relative mt-1 text-xs font-semibold text-[#f4d88f] hover:underline">
                            Avec le Pass Naturaliste : +1 toutes les 15 min
                        </Link>
                    )}
                    <button
                        disabled={busy || !canOpen}
                        onClick={open}
                        className="relative mt-6 w-full max-w-xs py-3.5 rounded-full nd-btn font-bold text-lg disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {payWith === 'charge' ? 'Ouvrir un booster' : payWith === 'booster' ? `Ouvrir un booster bonus (${user.boosters})` : payWith === 'plants' ? <>Ouvrir pour <Plant className="w-5 h-5" />{user.boosterPlants}</> : <>Ouvrir pour <Seed className="w-5 h-5" />{user.boosterPrice}</>}
                    </button>
                    {payWith === 'coins' && !canOpen && (
                        <p className="relative mt-3 text-sm text-white/70 text-center max-w-xs">Plus de charge ni de graines : attends la prochaine charge, ou gagne des graines avec les défis, le quiz et les trophées.</p>
                    )}
                    {payWith === 'coins' && (
                        <Link to="/jardin" className="relative mt-3 w-full max-w-xs py-2.5 rounded-full bg-[#c7ef7a]/15 ring-1 ring-[#c7ef7a]/40 text-[#dcf7a6] font-bold text-sm text-center flex items-center justify-center gap-1.5 hover:bg-[#c7ef7a]/25">
                            <Sprout className="w-4 h-4" />Plante tes graines et pépites : plus de boosters
                        </Link>
                    )}
                    {payWith !== 'charge' && (
                        <Link to="/boutique" className="relative mt-3 w-full max-w-xs py-2.5 rounded-full nd-cta-gold font-bold text-sm text-center">
                            Continuer maintenant · 10 boosters dès 1,99 €
                        </Link>
                    )}
                    {error && <p className="relative mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                </div>

                <div className="space-y-6">
                    {/* daily + shop */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        {ads && (
                            <div className="sm:col-span-2 p-5 rounded-3xl border border-[#e9c46a]/30 bg-gradient-to-br from-[#e9c46a]/12 to-white/[0.03] backdrop-blur flex flex-wrap items-center gap-4">
                                <Clapperboard className="w-8 h-8 text-[#f4d88f] shrink-0" />
                                <div className="flex-1 min-w-[12rem]">
                                    <h2 className="font-display text-xl font-bold">Booster offert</h2>
                                    <p className="text-sm text-ink-soft">Regarde une courte vidéo et gagne 1 booster gratuit · <b className="text-white">{ads.adsLeft}/{ads.adDaily}</b> aujourd'hui</p>
                                    {adNote && <p className="mt-1 text-sm font-semibold text-[#f4d88f]">{adNote}</p>}
                                </div>
                                <button disabled={busy || ads.adsLeft <= 0} onClick={watchAd}
                                    className="w-full sm:w-auto px-6 py-2.5 rounded-full nd-cta-gold font-bold disabled:opacity-40 disabled:grayscale">
                                    {ads.adsLeft > 0 ? 'Regarder une pub' : 'Reviens demain'}
                                </button>
                            </div>
                        )}
                        <div className="p-5 rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur">
                            <Gift className="w-6 h-6 text-rust" />
                            <h2 className="mt-2 font-display text-xl font-bold">Bonus du jour</h2>
                            <p className="text-sm text-ink-soft"><Amount seeds={user.dailyCoins} sign /> graines toutes les 20 heures.</p>
                            <button disabled={busy || !!countdown} onClick={daily}
                                className="mt-4 w-full py-2.5 rounded-full nd-btn font-semibold disabled:opacity-40 disabled:grayscale">
                                {countdown ? `Revient dans ${countdown}` : 'Récupérer'}
                            </button>
                        </div>
                        <Link to="/jardin" className="group p-5 rounded-3xl border border-[#c7ef7a]/25 bg-gradient-to-br from-[#c7ef7a]/10 to-white/[0.03] backdrop-blur hover:border-[#c7ef7a]/50 transition-colors">
                            <Sprout className="w-6 h-6 text-[#8ee6a8]" />
                            <h2 className="mt-2 font-display text-xl font-bold">Le jardin</h2>
                            <p className="text-sm text-ink-soft">
                                Convertis tes pépites en graines, plante-les : elles deviennent des plantes, et {user.boosterPlants} plantes ouvrent un booster.
                                Jusqu'à 2× plus de boosters qu'en payant directement ({user.boosterPrice} graines).
                            </p>
                            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#dcf7a6] group-hover:underline">
                                <Plant />{user.plants} plante{user.plants > 1 ? 's' : ''} · Aller au jardin →
                            </span>
                        </Link>
                    </div>

                    {/* progress by type */}
                    <div className="p-5 rounded-3xl border border-white/10">
                        <h2 className="font-display text-xl font-bold">Progression par type</h2>
                        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                            {byType.map(({ key, total, have }) => {
                                const t = TYPES[key];
                                return (
                                    <li key={key} className="flex items-center gap-2.5 text-sm">
                                        <t.Icon className="w-4 h-4 shrink-0" style={{ color: t.color }} />
                                        <span className="w-36 truncate">{t.label}</span>
                                        <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                            <span className="block h-full rounded-full" style={{ width: `${(have / Math.max(total, 1)) * 100}%`, background: t.color }} />
                                        </span>
                                        <span className="w-20 text-right tabular-nums text-ink-soft">{have}/{total.toLocaleString('fr-FR')}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {opening && (
                    <BoosterOpening bonus={bonus} godPack={godPack}
                        key={opening.map((c) => c.id).join('-')}
                        cards={opening}
                        owner={user.username}
                        onClose={() => setOpening(null)}
                        canOpenAgain={canOpen}
                        onAgain={open}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
