import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowDown, Gift, HeartHandshake } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { RARITIES, TYPES } from '../game.jsx';

const RETURNING_KEY = 'naturdex.returning';
const INVITE_KEY = 'naturdex.invite';

// ?parrain=CODE is kept in localStorage until sign-up, so it survives page changes.
function useInvite(params) {
    const [invite, setInvite] = useState(null);
    useEffect(() => {
        const fromUrl = params.get('parrain');
        if (fromUrl) localStorage.setItem(INVITE_KEY, fromUrl);
        const code = fromUrl || localStorage.getItem(INVITE_KEY);
        if (!code) return;
        api('inviteInfo', { code })
            .then((res) => setInvite({ code, ...res }))
            .catch(() => localStorage.removeItem(INVITE_KEY));
    }, [params]);
    return invite;
}

// Three of the most viewed species (legendary, epic, rare), each of a different type.
function useSampleCards(catalog) {
    return useMemo(() => {
        const cards = (catalog?.cards || []).filter((c) => c.thumb_url && c.sci_name && c.name !== c.sci_name)
            .sort((a, b) => Number(b.views) - Number(a.views));
        const used = new Set();
        return ['rare', 'legendary', 'epic'].map((r) => {
            const c = cards.find((c) => c.rarity === r && !used.has(c.type));
            if (c) used.add(c.type);
            return c;
        }).filter(Boolean);
    }, [catalog]);
}

function MiniCard({ card, i }) {
    const r = RARITIES[card.rarity];
    const t = TYPES[card.type];
    const fan = [{ rotate: -12, x: '-92%', y: 18 }, { rotate: 0, x: '-50%', y: 0 }, { rotate: 12, x: '-8%', y: 18 }][i];
    return (
        <motion.article className="nd-feat !absolute left-1/2 top-0 w-[7.4rem] sm:w-[8.6rem] !rounded-[16px] origin-bottom" style={{ '--r': r.color, zIndex: i === 1 ? 2 : 1 }}
            initial={{ opacity: 0, y: 40, rotate: 0, x: '-50%' }} animate={{ opacity: 1, ...fan }} transition={{ delay: 0.1 + i * 0.12, type: 'spring', damping: 18, stiffness: 140 }}>
            <img src={card.thumb_url} alt={card.name} draggable="false" />
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-black/55 text-[9px] font-bold" style={{ color: r.color }}>{r.symbol} {r.label}</span>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
                <h3 className="font-display text-[0.95rem] font-semibold text-white leading-tight line-clamp-2">{card.name}</h3>
                <p className="mt-0.5 text-[9.5px] text-white/60 truncate">{t?.label}</p>
            </div>
        </motion.article>
    );
}

function Intro({ catalog }) {
    const samples = useSampleCards(catalog);
    const counts = useMemo(() => {
        const out = {};
        for (const byRarity of Object.values(catalog?.types || {})) for (const [r, n] of Object.entries(byRarity)) out[r] = (out[r] || 0) + n;
        return out;
    }, [catalog]);
    const total = catalog?.total || Object.values(counts).reduce((a, n) => a + n, 0);

    return (
        <section className="text-center lg:text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#e9c46a]">Jeu de cartes à collectionner</p>
            <h2 className="mt-2 font-display text-[1.9rem] sm:text-4xl font-semibold text-white leading-tight">
                Collectionne <span className="nd-grad-text">{total ? total.toLocaleString('fr-FR') : 'des milliers d\'espèces'}</span>{total ? ' espèces' : ''} du vivant
            </h2>
            <p className="mt-2 text-sm text-ink-soft max-w-md mx-auto lg:mx-0">
                Animaux, plantes, champignons, microbes, fossiles : chaque carte vient de Wikipédia. Ouvre des boosters, complète ton carnet, échange avec tes amis.
            </p>

            <a href="#inscription" className="lg:hidden mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full nd-cta-gold font-bold text-sm">
                Je m'inscris gratuitement<ArrowDown className="w-4 h-4" />
            </a>

            <div className="relative h-[13.5rem] sm:h-[15.5rem] mt-6 max-w-xs mx-auto lg:mx-0 lg:ml-12" aria-hidden={!samples.length}>
                {samples.map((c, i) => <MiniCard key={c.id} card={c} i={i} />)}
            </div>

            <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">6 raretés, selon la popularité de l'espèce</p>
                <ul className="mt-2 flex flex-wrap justify-center lg:justify-start gap-1.5">
                    {Object.entries(RARITIES).map(([key, r]) => (
                        <li key={key} className="px-2.5 py-1 rounded-full bg-white/[0.05] ring-1 ring-white/10 text-xs font-semibold" style={{ color: r.color }}>
                            {r.symbol} {r.label}{counts[key] ? <span className="ml-1 text-white/40 tabular-nums">{counts[key].toLocaleString('fr-FR')}</span> : null}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-5 flex items-start gap-3 text-left rounded-2xl p-3.5 bg-[#e9c46a]/[0.08] ring-1 ring-[#e9c46a]/25 max-w-md mx-auto lg:mx-0">
                <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-[#e9c46a] text-[#2a1c00]"><HeartHandshake className="w-5 h-5" /></span>
                <p className="text-sm text-white/85 leading-snug">
                    <strong className="text-[#f4d88f]">20 % de chaque achat</strong> en boutique est reversé à l'association nature de ton choix : LPO, WWF France ou Humanité & Biodiversité. Le jeu reste jouable gratuitement.
                </p>
            </div>

            <p className="mt-4 text-sm text-ink-soft">
                Avant de jouer, explore <a href="/api/especes" className="text-[#a8f0c6] underline underline-offset-2 hover:text-white">l'encyclopédie des espèces</a> ou
                lis <a href="/api/blog" className="text-[#a8f0c6] underline underline-offset-2 hover:text-white">le blog nature</a>.
            </p>
        </section>
    );
}

export default function Auth() {
    const { user, authenticate, catalog } = useGame();
    const [params] = useSearchParams();
    // New visitors see the sign-up form first; someone who already signed in on this
    // device (or asked for ?mode=login) gets the log-in form.
    const [mode, setMode] = useState(() => {
        const asked = params.get('mode');
        if (asked === 'login' || asked === 'register') return asked;
        if (params.get('parrain')) return 'register';
        return localStorage.getItem(RETURNING_KEY) ? 'login' : 'register';
    });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();
    const invite = useInvite(params);

    if (user) return <Navigate to="/" replace />;

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await authenticate(mode, username, password, mode === 'register' && invite ? { invite: invite.code } : {});
            localStorage.setItem(RETURNING_KEY, '1');
            if (mode === 'register') localStorage.removeItem(INVITE_KEY);
            navigate('/booster');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const tab = (m, label) => (
        <button type="button" onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-colors ${mode === m ? 'bg-white/15 text-white shadow-inner' : 'text-ink-soft hover:text-white hover:bg-white/5'}`}>
            {label}
        </button>
    );

    const intro = mode === 'register';
    return (
        <div className={`mx-auto px-4 ${intro ? 'max-w-5xl py-10 sm:py-14 lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:items-center' : 'max-w-md py-16'}`}>
            {intro && <Intro catalog={catalog} />}
            <div id="inscription" className={intro ? 'mt-12 lg:mt-0 max-w-md w-full mx-auto scroll-mt-24' : ''}>
            <h1 className="font-display text-4xl font-semibold text-white text-center">
                {mode === 'register' ? <>Ton carnet de<br /><span className="nd-grad-text">naturaliste</span></> : <>Bon retour,<br /><span className="nd-grad-text">explorateur</span></>}
            </h1>
            {invite && mode === 'register' && (
                <div className="mt-6 flex items-center gap-3 rounded-2xl p-3.5 bg-[#4fd18b]/10 ring-1 ring-[#4fd18b]/30">
                    <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-[#4fd18b] text-[#05130d]"><Gift className="w-5 h-5" /></span>
                    <p className="text-sm text-white/90 leading-snug">
                        <strong className="text-white">{invite.username}</strong> t'invite ! Inscris-toi pour recevoir <strong className="text-[#8ee6a8]">+{invite.bonus.coins} graines</strong> et <strong className="text-[#f4c25b]">+{invite.bonus.nuggets} pépites</strong> en bonus.
                    </p>
                </div>
            )}
            <form onSubmit={submit} className="mt-10 p-6 rounded-3xl bg-white/[0.04] backdrop-blur border border-white/10 shadow-xl shadow-black/30 space-y-4">
                <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
                    {tab('login', 'Connexion')}
                    {tab('register', 'Inscription')}
                </div>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Pseudo</span>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Mot de passe</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                {error && <p className="text-sm font-semibold text-rust">{error}</p>}
                <button disabled={busy} className="w-full py-3.5 rounded-full nd-btn font-semibold disabled:opacity-60">
                    {busy ? '…' : mode === 'register' ? 'Créer mon compte — 10 boosters gratuits' : 'Se connecter'}
                </button>
            </form>
            </div>
        </div>
    );
}
