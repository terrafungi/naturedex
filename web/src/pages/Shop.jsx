import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Brain, CalendarCheck, Clock, Check, CheckCircle2, Compass, ExternalLink, FlaskConical, HeartHandshake, Info, Leaf, Loader2, Lock, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import InviteBanner from '../components/InviteBanner.jsx';
import { api, useGame } from '../api.jsx';
import { Amount, Nugget, Seed } from '../components/Currency.jsx';

const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const ASSOC_COLOR = { lpo: '#4ea8ff', wwf: '#f3f7f1', hb: '#4fd18b' };
const PICK_KEY = 'naturdex.association';

function PackIcon({ pack }) {
    if (pack.coins && pack.nuggets) return <span className="flex -space-x-2"><Seed className="w-9 h-9" /><Nugget className="w-9 h-9" /></span>;
    return pack.nuggets ? <Nugget className="w-10 h-10" /> : <Seed className="w-10 h-10" />;
}

// Back from Stripe: ask the server (which asks Stripe) until the payment is confirmed.
function useReturn(onDone) {
    const [params, setParams] = useSearchParams();
    const session = params.get('achat');
    const cancelled = params.get('annule');
    const [state, setState] = useState(session ? { status: 'checking' } : cancelled ? { status: 'cancelled' } : null);
    useEffect(() => {
        if (!session) return;
        let stop = false;
        (async () => {
            for (let i = 0; i < 8 && !stop; i++) {
                try {
                    const res = await api('shopConfirm', { session });
                    if (res.purchase.status !== 'pending') {
                        setState({ status: res.purchase.status, purchase: res.purchase });
                        onDone(res.user);
                        setParams({}, { replace: true });
                        return;
                    }
                } catch (err) {
                    setState({ status: 'error', error: err.message });
                    return;
                }
                await new Promise((r) => setTimeout(r, 2500));
            }
            if (!stop) setState({ status: 'slow' });
        })();
        return () => { stop = true; };
    }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
    return [state, setState];
}

function ReturnBanner({ state, associations, onClose }) {
    if (!state) return null;
    const a = associations.find((x) => x.id === state.purchase?.association);
    const box = 'mt-6 rounded-2xl p-5 flex items-start gap-4 ring-1';
    if (state.status === 'checking') return (
        <div className={`${box} bg-white/[0.04] ring-white/10`}><Loader2 className="w-6 h-6 animate-spin text-[#a8f0c6] shrink-0" />
            <p className="text-white/85">Vérification du paiement auprès de Stripe…</p></div>
    );
    if (state.status === 'paid') return (
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`${box} bg-[#4fd18b]/10 ring-[#4fd18b]/30`}>
            <CheckCircle2 className="w-7 h-7 text-[#4fd18b] shrink-0" />
            <div className="flex-1">
                <p className="font-display text-xl text-white">Merci ! Ton achat est livré.</p>
                <p className="mt-1 text-white/80 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {state.purchase.coins > 0 && <Amount seeds={state.purchase.coins} sign />}
                    {state.purchase.nuggets > 0 && <Amount nuggets={state.purchase.nuggets} sign />}
                    <span>ont été ajoutées à ton compte.</span>
                </p>
                <p className="mt-2 text-sm text-[#a8f0c6]">
                    <HeartHandshake className="inline w-4 h-4 -mt-0.5 mr-1" />
                    {euros(state.purchase.donation)} sont mis de côté pour {a?.name || 'l\'association choisie'}. N'oublie pas ton trophée « Mécène de la nature » !
                </p>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </motion.div>
    );
    const text = {
        cancelled: 'Paiement annulé : rien n\'a été débité.',
        expired: 'Cette session de paiement a expiré : rien n\'a été débité.',
        slow: 'Le paiement n\'est pas encore confirmé. S\'il a bien été accepté, tes crédits arriveront automatiquement dans quelques minutes.',
        error: state.error,
    }[state.status];
    return (
        <div className={`${box} bg-white/[0.04] ring-white/10`}>
            <Info className="w-6 h-6 text-brass shrink-0" /><p className="flex-1 text-white/85">{text}</p>
            <button onClick={onClose} className="text-white/50 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </div>
    );
}

function Associations({ list, pick, setPick, share }) {
    return (
        <div className="grid sm:grid-cols-3 gap-3">
            {list.map((a) => {
                const on = pick === a.id;
                return (
                    <button key={a.id} onClick={() => setPick(a.id)}
                        className={`text-left rounded-2xl p-4 transition ring-1 ${on ? 'bg-[#4fd18b]/12 ring-[#4fd18b]/60 shadow-[0_0_30px_-10px_#4fd18b]' : 'bg-white/[0.035] ring-white/10 hover:bg-white/[0.06]'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`grid place-items-center w-5 h-5 rounded-full ring-2 ${on ? 'bg-[#4fd18b] ring-[#4fd18b]' : 'ring-white/30'}`}>
                                {on && <Check className="w-3.5 h-3.5 text-[#05130d]" strokeWidth={3} />}
                            </span>
                            <span className="font-display text-lg font-semibold" style={{ color: ASSOC_COLOR[a.id] }}>{a.name}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/45">{a.full}</p>
                        <p className="mt-2 text-sm text-white/75 leading-snug">{a.text}</p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-white/55">Déjà mis de côté : <b className="text-white tabular-nums">{euros(a.donated)}</b></span>
                            <a href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#a8f0c6] hover:underline inline-flex items-center gap-1">
                                Site <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </button>
                );
            })}
            <p className="sm:col-span-3 text-xs text-white/50">{Math.round(share * 100)} % de chaque paiement va à l'association cochée. Tu peux en changer à chaque achat.</p>
        </div>
    );
}

const longDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// Back from the Pass checkout: confirm with the server (which asks Stripe).
function usePassReturn(onDone) {
    const [params, setParams] = useSearchParams();
    const session = params.get('pass');
    const [state, setState] = useState(session ? 'checking' : null);
    useEffect(() => {
        if (!session) return;
        let stop = false;
        (async () => {
            for (let i = 0; i < 8 && !stop; i++) {
                try {
                    const res = await api('passConfirm', { session });
                    if (res.active) { onDone(res.user); setState('active'); setParams({}, { replace: true }); return; }
                } catch (err) {
                    setState(err.message); return;
                }
                await new Promise((r) => setTimeout(r, 2500));
            }
            if (!stop) setState('slow');
        })();
        return () => { stop = true; };
    }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
    return [state, setState];
}

function PassCard({ shop, user, assoc, ret, onUser }) {
    const p = shop.pass;
    const mine = user?.pass;
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const perks = [
        [CalendarCheck, <>Bonus du jour doublé : <Amount seeds={p.dailyBase + p.dailyCoins} /> + <Amount nuggets={p.dailyNuggets} /></>],
        [Compass, <><b className="text-white">{p.catchBase + p.catches} captures</b> par jour en Exploration au lieu de {p.catchBase}</>],
        [Brain, <><b className="text-white">{p.quizBase + p.quizzes} quiz</b> par jour au lieu de {p.quizBase}</>],
        [Clock, <>Un booster gratuit <b className="text-white">toutes les {p.chargeMinutes} min</b> au lieu de {p.chargeBase === 60 ? '1 h' : `${p.chargeBase} min`}</>],
        [Leaf, <>Badge <b className="text-white">Mécène</b> à côté de ton pseudo</>],
        [HeartHandshake, <><b className="text-[#a8f0c6]">{euros(p.donation)} chaque mois</b> pour {assoc.name}</>],
    ];
    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); } catch (err) { setError(err.message); }
        setBusy(false);
    };
    const subscribe = () => run(async () => {
        const { url } = await api('passCheckout', { association: assoc.id, consent });
        window.location.assign(url);
        await new Promise(() => {}); // keep the spinner while leaving
    });
    const toggle = (resume) => run(async () => {
        if (!resume && !window.confirm(`Arrêter le renouvellement ? Tu gardes tes avantages jusqu'au ${longDate(mine.until)}.`)) return;
        const { user: u } = await api('passCancel', { resume });
        onUser(u);
    });
    return (
        <div className="relative mt-10 rounded-3xl p-5 sm:p-7 ring-1 ring-[#e9c46a]/50 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(233,196,106,0.18),rgba(79,209,139,0.06)_55%,rgba(255,255,255,0.02))] shadow-[0_0_60px_-25px_#e9c46a]">
            <span className="absolute -top-3 left-6 rounded-full bg-[#e9c46a] text-[#2a1c00] text-[11px] font-extrabold uppercase tracking-wider px-3 py-1">Abonnement</span>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl text-white flex items-center gap-2"><Leaf className="w-7 h-7 text-[#e9c46a]" />{p.label}</h2>
                    <p className="mt-1 text-white/70">Plus de jeu chaque jour, et un vrai coup de pouce régulier à la nature.</p>
                </div>
                <p className="font-display text-white"><span className="text-4xl font-bold tabular-nums">{euros(p.price)}</span><span className="text-white/60"> / mois</span></p>
            </div>
            <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {perks.map(([Icon, text], i) => (
                    <li key={i} className="flex items-start gap-3 text-white/85"><Icon className="w-5 h-5 mt-0.5 text-[#e9c46a] shrink-0" /><span className="flex flex-wrap items-center gap-x-1.5">{text}</span></li>
                ))}
            </ul>
            {ret === 'checking' && <p className="mt-5 flex items-center gap-2 text-white/85"><Loader2 className="w-5 h-5 animate-spin text-[#a8f0c6]" />Activation du Pass auprès de Stripe…</p>}
            {ret === 'slow' && <p className="mt-5 text-white/80">Le paiement n'est pas encore confirmé. S'il a été accepté, ton Pass s'activera tout seul dans quelques minutes.</p>}
            {ret && !['checking', 'slow', 'active'].includes(ret) && <p className="mt-5 text-sm font-semibold text-[#ffb4a2]">{ret}</p>}
            {mine ? (
                <div className="mt-6 rounded-2xl bg-[#4fd18b]/10 ring-1 ring-[#4fd18b]/30 p-4 flex flex-wrap items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-[#4fd18b] shrink-0" />
                    <p className="flex-1 min-w-[12rem] text-white/90">
                        {ret === 'active' && <b className="text-white">Merci, ton Pass est actif ! </b>}
                        {mine.cancelled
                            ? <>Pass actif jusqu'au <b className="text-white">{longDate(mine.until)}</b>, sans renouvellement.</>
                            : <>Pass actif, renouvelé le <b className="text-white">{longDate(mine.until)}</b>.</>}
                    </p>
                    <button onClick={() => toggle(mine.cancelled)} disabled={busy}
                        className={`px-4 py-2 rounded-full text-sm font-bold ${mine.cancelled ? 'nd-cta-gold' : 'ring-1 ring-white/20 text-white/80 hover:bg-white/5'} disabled:opacity-40`}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mine.cancelled ? 'Reprendre l\'abonnement' : 'Résilier'}
                    </button>
                </div>
            ) : (
                <>
                    <label className="mt-6 flex items-start gap-3 text-sm text-white/80 cursor-pointer">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#4fd18b] shrink-0" />
                        <span>Je demande l'activation immédiate du Pass et je reconnais perdre mon droit de rétractation de 14 jours. L'abonnement se renouvelle chaque mois et je peux le résilier à tout moment ici, en un clic.</span>
                    </label>
                    <p className="mt-3 text-xs text-white/55 flex gap-2"><Info className="w-4 h-4 shrink-0" />Si tu as moins de 18 ans, demande l'accord d'un parent avant de t'abonner.</p>
                    <button onClick={subscribe} disabled={!consent || busy || !shop.ready}
                        className="mt-5 w-full sm:w-auto nd-cta-gold inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold disabled:opacity-40 disabled:pointer-events-none">
                        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                        {shop.ready ? `S'abonner · ${euros(p.price)} / mois` : 'Paiement bientôt disponible'}
                    </button>
                </>
            )}
            {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
        </div>
    );
}

function PackCard({ pack, assoc, selected, onSelect }) {
    const used = pack.once && !pack.available;
    return (
        <button onClick={onSelect} disabled={used}
            className={`relative text-left rounded-3xl p-5 transition ring-1 flex flex-col disabled:opacity-45 disabled:hover:translate-y-0 ${selected ? 'bg-[#e9c46a]/10 ring-[#e9c46a]/70 shadow-[0_0_40px_-12px_#e9c46a]' : pack.once && !used ? 'bg-[#4fd18b]/[0.07] ring-[#4fd18b]/40 hover:-translate-y-0.5' : 'nd-glass ring-white/10 hover:-translate-y-0.5'}`}>
            {pack.best && <span className="absolute -top-2.5 right-4 rounded-full bg-[#e9c46a] text-[#2a1c00] text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1">Meilleure offre</span>}
            {pack.once && <span className="absolute -top-2.5 right-4 rounded-full bg-[#4fd18b] text-[#05130d] text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1">{used ? 'Déjà utilisée' : 'Une seule fois'}</span>}
            <PackIcon pack={pack} />
            <p className="mt-3 font-display text-lg text-white">{pack.label}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-lg">
                {pack.coins > 0 && <Amount seeds={pack.coins} />}
                {pack.nuggets > 0 && <Amount nuggets={pack.nuggets} />}
            </div>
            {pack.once && <p className="mt-1 text-xs font-semibold text-[#a8f0c6]"><Sparkles className="inline w-3.5 h-3.5 -mt-0.5" /> 2× le sachet de graines, pépites en plus</p>}
            {pack.bonus && <p className="mt-1 text-xs font-semibold text-[#a8f0c6]"><Sparkles className="inline w-3.5 h-3.5 -mt-0.5" /> dont {pack.bonus.toLocaleString('fr-FR')} offertes</p>}
            <div className="mt-auto pt-4 flex items-end justify-between gap-2">
                <span className="font-display text-2xl font-bold text-white tabular-nums">{euros(pack.price)}</span>
                <span className="text-right text-xs text-[#a8f0c6] leading-tight">
                    <HeartHandshake className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" />{euros(pack.donation)}<br /><span className="text-white/50">pour {assoc?.name}</span>
                </span>
            </div>
        </button>
    );
}

function Checkout({ shop, pack, assoc }) {
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { setError(''); }, [pack, assoc]);
    const pay = async () => {
        setBusy(true); setError('');
        try {
            const { url } = await api('shopCheckout', { pack: pack.id, association: assoc.id, consent });
            window.location.assign(url);
        } catch (err) {
            setError(err.message); setBusy(false);
        }
    };
    return (
        <div className="mt-6 rounded-3xl nd-glass p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl text-white">{pack.label} · {euros(pack.price)}</p>
                <p className="text-sm text-white/70">
                    Dont <b className="text-[#a8f0c6]">{euros(pack.donation)}</b> reversés à <b className="text-white">{assoc.name}</b>
                </p>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-white/80 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#4fd18b] shrink-0" />
                <span>Je demande la livraison immédiate de mes crédits et je reconnais perdre mon droit de rétractation de 14 jours une fois qu'ils sont ajoutés à mon compte.</span>
            </label>
            <p className="mt-3 text-xs text-white/55 flex gap-2"><Info className="w-4 h-4 shrink-0" />Si tu as moins de 18 ans, demande l'accord d'un parent avant de payer.</p>
            {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
            <button onClick={pay} disabled={!consent || busy || !shop.ready}
                className="mt-5 w-full sm:w-auto nd-cta-gold inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold disabled:opacity-40 disabled:pointer-events-none">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                {shop.ready ? `Payer ${euros(pack.price)}` : 'Paiement bientôt disponible'}
            </button>
            <p className="mt-3 text-xs text-white/50 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Paiement sécurisé par Stripe : tes coordonnées bancaires ne passent jamais par NatureDex.</p>
        </div>
    );
}

export default function Shop() {
    const { user, setUser } = useGame();
    const [shop, setShop] = useState(null);
    const [error, setError] = useState('');
    const [pick, setPickState] = useState(() => localStorage.getItem(PICK_KEY) || 'lpo');
    const [packId, setPackId] = useState(null);
    const setPick = (id) => { setPickState(id); localStorage.setItem(PICK_KEY, id); };

    const load = useCallback(() => api('shop').then((s) => { setShop(s); setUser(s.user); }).catch((err) => setError(err.message)), [setUser]);
    useEffect(() => { load(); }, [load]);
    const [ret, setRet] = useReturn((u) => { setUser(u); load(); });
    const [passRet] = usePassReturn((u) => { setUser(u); load(); });

    if (!shop) return <div className="py-32 text-center font-display text-xl text-ink-soft">{error || 'Chargement…'}</div>;
    const assoc = shop.associations.find((a) => a.id === pick) || shop.associations[0];
    const pack = shop.packs.find((p) => p.id === packId);
    const share = Math.round(shop.donationShare * 100);

    return (
        <div className="max-w-5xl mx-auto px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Boutique solidaire</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Des crédits qui font pousser la nature</h1>
            <InviteBanner className="mt-5" />

            <div className="mt-6 rounded-3xl p-5 sm:p-6 ring-1 ring-[#4fd18b]/35 bg-[linear-gradient(135deg,rgba(79,209,139,0.16),rgba(79,209,139,0.03))] flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex items-center gap-4 flex-1">
                    <span className="font-display text-5xl sm:text-7xl font-bold text-[#4fd18b] leading-none whitespace-nowrap">{share} %</span>
                    <p className="text-white/90 leading-snug">
                        <b className="text-white">du prix que tu paies est reversé</b> à l'association de protection de la nature que tu choisis :
                        LPO, WWF France ou Humanité & Biodiversité.
                    </p>
                </div>
                <div className="sm:text-right sm:border-l sm:border-white/10 sm:pl-5">
                    <p className="text-xs uppercase tracking-wider text-white/55">Déjà mis de côté par les joueurs</p>
                    <p className="font-display text-3xl font-bold text-white tabular-nums">{euros(shop.totalDonated)}</p>
                </div>
            </div>

            {!shop.ready && (
                <p className="mt-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-3 text-sm text-white/75 flex gap-2">
                    <Info className="w-5 h-5 text-brass shrink-0" />Le paiement n'est pas encore activé. Tu peux déjà découvrir les packs, ils seront achetables très bientôt.
                </p>
            )}
            {shop.testMode && (
                <p className="mt-4 rounded-2xl bg-[#4ea8ff]/10 ring-1 ring-[#4ea8ff]/30 px-4 py-3 text-sm text-white/85 flex gap-2">
                    <FlaskConical className="w-5 h-5 text-[#4ea8ff] shrink-0" />Mode test : aucun vrai paiement. Carte de test Stripe : 4242 4242 4242 4242, date future, n'importe quel code.
                </p>
            )}
            <ReturnBanner state={ret} associations={shop.associations} onClose={() => setRet(null)} />

            <h2 className="mt-10 font-display text-2xl text-white"><span className="text-white/40 mr-2">1.</span>Choisis ton association</h2>
            <div className="mt-4"><Associations list={shop.associations} pick={assoc.id} setPick={setPick} share={shop.donationShare} /></div>

            <PassCard shop={shop} user={user} assoc={assoc} ret={passRet} onUser={setUser} />

            <h2 className="mt-10 font-display text-2xl text-white"><span className="text-white/40 mr-2">2.</span>Ou choisis un pack</h2>
            <p className="mt-1 text-sm text-ink-soft">Les graines ouvrent des boosters, les pépites servent aux enchères.</p>
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {shop.packs.map((p) => <PackCard key={p.id} pack={p} assoc={assoc} selected={p.id === packId} onSelect={() => setPackId(p.id)} />)}
            </div>
            {pack && <Checkout shop={shop} pack={pack} assoc={assoc} />}

            {shop.purchases.length > 0 && (
                <>
                    <h2 className="mt-12 font-display text-2xl text-white">Mes achats</h2>
                    <div className="mt-4 rounded-2xl nd-glass divide-y divide-white/[0.07]">
                        {shop.purchases.map((p) => (
                            <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <span className="text-white/55 tabular-nums w-24">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</span>
                                <span className="text-white font-semibold flex-1 min-w-[8rem]">{p.label}</span>
                                <span className="tabular-nums text-white">{euros(p.amount)}</span>
                                <span className="text-[#a8f0c6] tabular-nums">{euros(p.donation)} → {shop.associations.find((a) => a.id === p.association)?.name}</span>
                                <span className={`text-xs font-bold uppercase tracking-wider ${p.status === 'paid' ? 'text-[#4fd18b]' : 'text-white/40'}`}>
                                    {{ paid: 'Livré', pending: 'En attente', expired: 'Abandonné' }[p.status]}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="mt-12 text-xs text-white/45 leading-relaxed space-y-2 max-w-3xl">
                <p>
                    Les graines et pépites sont des crédits de jeu, sans valeur monétaire, non échangeables contre de l'argent. Ils servent uniquement dans NatureDex.
                    Tout reste jouable gratuitement : la boutique sert seulement à aller plus vite et à soutenir la nature.
                </p>
                <p>
                    La part solidaire ({share} % du prix TTC payé) est mise de côté à chaque achat et versée par NatureDex aux associations. Le compteur ci-dessus
                    montre les montants réels. Ce reversement ne donne pas droit à un reçu fiscal pour l'acheteur.
                </p>
                <p>Un souci avec un paiement ? Les crédits non reçus sont ajoutés automatiquement dès que Stripe confirme le paiement. <Link to="/profil" className="underline">Mon profil</Link></p>
            </div>
        </div>
    );
}
