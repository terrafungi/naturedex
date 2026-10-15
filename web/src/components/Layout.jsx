import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Award, Brain, Gavel, Gift, Home, Layers, LayoutGrid, Medal, MessageCircle, Package, Plus, ShoppingBag, Sprout, Swords, Trophy, User, Users, X } from 'lucide-react';
import { Nugget, Plant, Seed } from './Currency.jsx';
import { useGame } from '../api.jsx';

export const NAV = [
    { to: '/', label: 'Accueil', Icon: Home, end: true },
    { to: '/collection', label: 'Collection', Icon: Layers },
    { to: '/booster', label: 'Booster', Icon: Package },
    { to: '/jardin', label: 'Jardin', Icon: Sprout },
    { to: '/combat', label: 'Combat', Icon: Swords },
    { to: '/quiz', label: 'Quiz', Icon: Brain },
    { to: '/classement', label: 'Classement', Icon: Medal },
    { to: '/encheres', label: 'Enchères', Icon: Gavel },
    { to: '/amis', label: 'Amis', Icon: Users },
    { to: '/messages', label: 'Messages', Icon: MessageCircle },
    { to: '/defis', label: 'Défis', Icon: Trophy },
    { to: '/trophees', label: 'Trophées', Icon: Award },
    { to: '/boutique', label: 'Boutique solidaire', short: 'Boutique', Icon: ShoppingBag },
    { to: '/inviter', label: 'Inviter des amis', short: 'Inviter', Icon: Gift },
    { to: '/profil', label: 'Profil', Icon: User },
];

// Red counter on a navigation icon: what is waiting on that page (rewards to collect,
// unread messages, friend requests…), from the server's `badges` map.
function useBadge(to) {
    const { badges } = useGame();
    return badges[to] || 0;
}
function Counter({ n, className = '' }) {
    if (!n) return null;
    return <span className={`min-w-[1.1rem] h-[1.1rem] px-1 inline-grid place-items-center rounded-full bg-[#ff6b6b] text-white text-[10px] font-bold leading-none ring-2 ring-[#0b1f16] ${className}`}>{n > 9 ? '9+' : n}</span>;
}
function NavBadge({ to, className }) {
    return <Counter n={useBadge(to)} className={className} />;
}

export function LeafLogo({ className = 'w-9 h-9' }) {
    return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden>
            <defs>
                <linearGradient id="nd-leaf" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#1f8a4f" />
                    <stop offset="0.6" stopColor="#4fd18b" />
                    <stop offset="1" stopColor="#c8f7d9" />
                </linearGradient>
            </defs>
            <path d="M7 33C5 18 15 6 34 5c1 19-10 30-25 29z" fill="url(#nd-leaf)" />
            <path d="M8 32C14 24 20 17 29 10" stroke="#05130d" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.65" />
            <path d="M15 24l-1-6M19 20l4 0M22 16l-1-4" stroke="#05130d" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
        </svg>
    );
}

// `compact` (logged in, wallet shown): no tagline on phones and a slightly smaller
// wordmark, so the wallet never overlaps the name; below 430 px (three currencies) only the leaf stays.
function Brand({ compact }) {
    return (
        <Link to="/" className="group flex items-center gap-2 sm:gap-2.5 mr-auto min-w-0" aria-label="NatureDex, accueil">
            <LeafLogo className={`${'w-9 h-9'} sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_0_12px_rgba(79,209,139,0.45)] transition-transform group-hover:-rotate-12`} />
            <span className={`leading-none min-w-0 ${compact ? 'max-[429px]:hidden' : ''}`}>
                <span className={`block font-display ${compact ? 'text-[1.45rem]' : 'text-[1.6rem]'} sm:text-[1.8rem] font-semibold text-white truncate`}>NatureDex</span>
                <span className={`${compact ? 'hidden sm:block' : 'block'} mt-1 text-[8.5px] sm:text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55 truncate`}>Des cartes pour un monde plus vivant</span>
            </span>
        </Link>
    );
}

const fmt = (n) => Number(n).toLocaleString('fr-FR');
// Header wallet only: 12 345 → "12,3 k" so the name keeps its room on phones.
const short = (n) => (n >= 10_000 ? `${(Math.floor(n / 100) / 10).toLocaleString('fr-FR')} k` : fmt(n));

function Wallet({ user }) {
    return (
        <div className="shrink-0 flex items-center rounded-full bg-white/[0.06] ring-1 ring-white/12 text-[13px] sm:text-sm font-bold tabular-nums">
            <Link to="/booster" className="flex items-center gap-1 pl-2 sm:pl-2.5 pr-1.5 sm:pr-2 py-1.5 text-[#8ee6a8]" title="Graines : pour ouvrir des boosters">
                <Seed />{short(user.coins)}
            </Link>
            <span className="w-px h-4 bg-white/15" />
            <Link to="/jardin" className="flex items-center gap-1 px-1.5 sm:px-2 py-1.5 text-[#c7ef7a]" title="Plantes : récoltées au jardin, 10 ouvrent un booster">
                <Plant />{short(user.plants ?? 0)}
            </Link>
            <span className="w-px h-4 bg-white/15" />
            <Link to="/encheres" className="flex items-center gap-1 pl-1.5 sm:pl-2 pr-2 sm:pr-2.5 py-1.5 text-[#f4c25b]" title="Pépites : pour les enchères">
                <Nugget />{short(user.nuggets)}
            </Link>
            <Link to="/boutique" className="grid place-items-center w-6 h-6 mr-1 rounded-full bg-[#e9c46a] text-[#2a1c00] hover:brightness-110" title="Boutique solidaire : acheter des crédits">
                <Plus className="w-4 h-4" strokeWidth={3} />
            </Link>
        </div>
    );
}
// Floating bottom bar = the whole navigation. On phones and tablets it shows the
// main pages plus a "Plus" button that opens the rest; on large screens all fit.
const PRIMARY = 5;

function TabItem({ to, label, short, Icon, end, className = '' }) {
    return (
        <NavLink to={to} end={end}
            className={({ isActive }) => `relative flex flex-col items-center gap-1 py-2 rounded-2xl text-[10.5px] sm:text-[11px] font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25 text-[#a8f0c6]' : 'text-white/55 hover:text-white'} ${className}`}>
            <Icon className="w-5 h-5" strokeWidth={1.8} />{short || label}<NavBadge to={to} className="absolute top-1 right-[calc(50%-1.4rem)]" />
        </NavLink>
    );
}

function TabBar() {
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    const { badges, refreshBadges } = useGame();
    const primary = NAV.slice(0, PRIMARY);
    const more = NAV.slice(PRIMARY);
    const activeMore = more.find(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
    const moreBadge = more.reduce((sum, { to }) => sum + (badges[to] || 0), 0);

    useEffect(() => { setOpen(false); }, [pathname]);
    useEffect(() => { refreshBadges(); }, [pathname, refreshBadges]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const MoreIcon = open ? X : activeMore?.Icon || LayoutGrid;
    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div key="backdrop" className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                )}
            </AnimatePresence>
            <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none" aria-label="Navigation">
                <AnimatePresence>
                    {open && (
                        <motion.div key="sheet" id="nd-more" className="lg:hidden nd-tabbar pointer-events-auto mx-auto mb-2 w-full max-w-md p-2 rounded-[1.6rem] grid grid-cols-3 sm:grid-cols-4 gap-1"
                            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ duration: 0.18 }}>
                            {more.map((item) => <TabItem key={item.to} {...item} short={item.label} className="py-3 px-1 text-center text-[11.5px]" />)}
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="nd-tabbar pointer-events-auto mx-auto w-full max-w-md lg:w-fit lg:max-w-none flex gap-1 p-1.5 rounded-[1.6rem]">
                    {primary.map((item) => <TabItem key={item.to} {...item} className="flex-1 min-w-0 lg:flex-none lg:w-[4.55rem]" />)}
                    {more.map((item) => <TabItem key={item.to} {...item} className="hidden lg:flex lg:w-[4.55rem]" />)}
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="nd-more"
                        className={`lg:hidden relative flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-2xl text-[10.5px] sm:text-[11px] font-semibold transition-colors ${open || activeMore ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25 text-[#a8f0c6]' : 'text-white/80 hover:text-white'}`}>
                        <MoreIcon className="w-5 h-5" strokeWidth={1.8} />
                        <span className="max-w-full truncate px-0.5">{open ? 'Fermer' : activeMore ? (activeMore.short || activeMore.label) : 'Plus'}</span>
                        {!open && !activeMore && !moreBadge && <Plus className="absolute top-1.5 right-[calc(50%-1.3rem)] w-3 h-3 p-px rounded-full bg-[#e9c46a] text-[#2a1c00]" strokeWidth={3.5} />}
                        {!open && <Counter n={moreBadge} className="absolute top-1 right-[calc(50%-1.4rem)]" />}
                    </button>
                </div>
            </nav>
        </>
    );
}

export default function Layout() {
    const { user } = useGame();
    const { pathname } = useLocation();
    const home = pathname === '/';
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

    return (
        <div className="min-h-screen flex flex-col">
            <header className={`${home ? 'absolute' : 'sticky bg-[#05130d]/75 backdrop-blur-xl border-b border-white/[0.07]'} top-0 inset-x-0 z-40`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[4.5rem] sm:h-20 flex items-center gap-3">
                    <Brand compact={!!user} />
                    {user && <Wallet user={user} />}
                </div>
            </header>
            <main className={`flex-1 ${user ? 'pb-28' : ''}`}>
                <Outlet />
            </main>
            <footer className={`border-t border-white/[0.07] px-4 pt-6 ${user ? 'pb-32' : 'pb-6'} text-center text-xs text-ink-soft`}>
                NatureDex · Images et textes : <a className="underline hover:text-white" href="https://fr.wikipedia.org" target="_blank" rel="noreferrer">Wikipédia</a> & Wikimedia Commons (licences libres) · Données : Wikidata
            </footer>
            {user && <TabBar />}
        </div>
    );
}
