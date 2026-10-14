import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Coins, Gift, Package } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Pack } from '../components/Pack.jsx';
import BoosterOpening from '../components/BoosterOpening.jsx';
import { TYPES } from '../game.jsx';

function useCountdown(iso) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!iso) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [iso]);
    if (!iso) return null;
    const ms = Math.max(0, new Date(iso).getTime() - now);
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
    return ms === 0 ? null : `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export default function Boosters() {
    const { user, setUser, catalog, owned, ownedInfo, addCards } = useGame();
    const [opening, setOpening] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const countdown = useCountdown(user.nextDailyAt);

    async function run(action, after) {
        setBusy(true);
        setError('');
        try {
            const res = await api(action);
            setUser(res.user);
            after?.(res);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const open = () => run('openBooster', (res) => { addCards(res.cards); setOpening(res.cards); });
    const buy = () => run('buyBooster');
    const daily = () => run('claimDaily');

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
                    <h1 className="font-display text-4xl sm:text-5xl font-black text-white mt-1">
                        {discovered} <span className="text-ink-soft font-medium text-2xl sm:text-3xl">/ {total.toLocaleString('fr-FR')} espèces découvertes</span>
                    </h1>
                </div>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-500" initial={{ width: 0 }} animate={{ width: `${(discovered / Math.max(total, 1)) * 100}%` }} transition={{ duration: 1 }} />
            </div>

            <div className="mt-10 grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
                {/* the pack */}
                <div className="relative flex flex-col items-center p-8 rounded-[2rem] nd-glass nd-ring text-paper overflow-hidden">
                    <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 50% 30%, #7c5cff, transparent 55%), radial-gradient(circle at 30% 90%, #22e58b, transparent 50%)' }} />
                    <motion.button
                        disabled={busy || user.boosters < 1}
                        onClick={open}
                        className="relative w-[200px] sm:w-[230px] disabled:grayscale disabled:opacity-60"
                        whileHover={user.boosters > 0 ? { y: -8, rotate: -2 } : {}}
                        whileTap={user.boosters > 0 ? { scale: 0.96 } : {}}
                    >
                        <Pack />
                        {user.boosters > 0 && (
                            <span className="absolute -top-3 -right-3 min-w-10 h-10 px-2 grid place-items-center rounded-full bg-rust text-paper font-display font-black text-lg shadow-lg">
                                ×{user.boosters}
                            </span>
                        )}
                    </motion.button>
                    <button
                        disabled={busy || user.boosters < 1}
                        onClick={open}
                        className="relative mt-8 w-full max-w-xs py-3.5 rounded-full nd-btn font-bold text-lg disabled:opacity-40"
                    >
                        {user.boosters > 0 ? 'Ouvrir un booster' : 'Aucun booster'}
                    </button>
                    {error && <p className="relative mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
                </div>

                <div className="space-y-6">
                    {/* daily + shop */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="p-5 rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur">
                            <Gift className="w-6 h-6 text-rust" />
                            <h2 className="mt-2 font-display text-xl font-bold">Bonus du jour</h2>
                            <p className="text-sm text-ink-soft">+{user.dailyCoins} pièces toutes les 20 heures.</p>
                            <button disabled={busy || !!countdown} onClick={daily}
                                className="mt-4 w-full py-2.5 rounded-full nd-btn font-semibold disabled:opacity-40 disabled:grayscale">
                                {countdown ? `Revient dans ${countdown}` : 'Récupérer'}
                            </button>
                        </div>
                        <div className="p-5 rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur">
                            <Package className="w-6 h-6 text-white" />
                            <h2 className="mt-2 font-display text-xl font-bold">Boutique</h2>
                            <p className="text-sm text-ink-soft">Tu as <b className="text-brass-deep">{user.coins} pièces</b>. Recycle tes doublons pour en gagner.</p>
                            <button disabled={busy || user.coins < user.boosterPrice} onClick={buy}
                                className="mt-4 w-full py-2.5 rounded-full border-2 border-brass text-brass-deep font-bold hover:bg-brass/15 disabled:opacity-40 flex items-center justify-center gap-2">
                                Acheter un booster · <Coins className="w-4 h-4" />{user.boosterPrice}
                            </button>
                        </div>
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
                    <BoosterOpening
                        key={opening.map((c) => c.id).join('-')}
                        cards={opening}
                        onClose={() => setOpening(null)}
                        canOpenAgain={user.boosters > 0}
                        onAgain={open}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
