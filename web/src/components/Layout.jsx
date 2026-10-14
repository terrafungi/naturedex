import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Award, Brain, Gavel, Home, Layers, Package, Plus, ShoppingBag, Trophy, User, Users } from 'lucide-react';
import { Nugget, Seed } from './Currency.jsx';
import { useGame } from '../api.jsx';

export const NAV = [
    { to: '/', label: 'Accueil', Icon: Home, end: true },
    { to: '/collection', label: 'Collection', Icon: Layers },
    { to: '/booster', label: 'Booster', Icon: Package },
    { to: '/quiz', label: 'Quiz', Icon: Brain },
    { to: '/encheres', label: 'Enchères', Icon: Gavel },
    { to: '/amis', label: 'Amis', Icon: Users },
    { to: '/defis', label: 'Défis', Icon: Trophy },
    { to: '/trophees', label: 'Trophées', Icon: Award },
    { to: '/boutique', label: 'Boutique solidaire', short: 'Boutique', Icon: ShoppingBag },
    { to: '/profil', label: 'Profil', Icon: User },
];

// Pending friend requests + trade offers, shown as a red dot count on the Amis link.
function useSocialCount() {
    const { user } = useGame();
    return (user?.social?.friendRequests || 0) + (user?.social?.tradeOffers || 0);
}
function NavBadge({ to, className = '' }) {
    const n = useSocialCount();
    if (to !== '/amis' || !n) return null;
    return <span className={`min-w-[1.1rem] h-[1.1rem] px-1 inline-grid place-items-center rounded-full bg-[#ff6b6b] text-white text-[10px] font-bold leading-none ${className}`}>{n > 9 ? '9+' : n}</span>;
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
// wordmark, so the wallet never overlaps the name; below 340 px only the leaf stays.
function Brand({ compact }) {
    return (
        <Link to="/" className="group flex items-center gap-2 sm:gap-2.5 mr-auto min-w-0" aria-label="NatureDex, accueil">
            <LeafLogo className={`${'w-9 h-9'} sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_0_12px_rgba(79,209,139,0.45)] transition-transform group-hover:-rotate-12`} />
            <span className={`leading-none min-w-0 ${compact ? 'max-[339px]:hidden' : ''}`}>
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
            <Link to="/encheres" className="flex items-center gap-1 pl-1.5 sm:pl-2 pr-2 sm:pr-2.5 py-1.5 text-[#f4c25b]" title="Pépites : pour les enchères">
                <Nugget />{short(user.nuggets)}
            </Link>
            <Link to="/boutique" className="grid place-items-center w-6 h-6 mr-1 rounded-full bg-[#e9c46a] text-[#2a1c00] hover:brightness-110" title="Boutique solidaire : acheter des crédits">
                <Plus className="w-4 h-4" strokeWidth={3} />
            </Link>
        </div>
    );
}
// Floating bottom bar = the whole navigation. It scrolls sideways on phones
// (fade on the edges hints there is more) and the active page is kept in view.
function TabBar() {
    const { pathname } = useLocation();
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [pathname]);
    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none" aria-label="Navigation">
            <div ref={ref} className="nd-tabbar nd-tabbar-scroll pointer-events-auto mx-auto w-fit max-w-full flex gap-1 p-1.5 rounded-[1.6rem] overflow-x-auto overscroll-x-contain snap-x">
                {NAV.map(({ to, label, short, Icon, end }) => (
                    <NavLink key={to} to={to} end={end}
                        className={({ isActive }) => `relative snap-start shrink-0 w-[3.9rem] sm:w-[4.9rem] flex flex-col items-center gap-1 py-2 rounded-2xl text-[10.5px] sm:text-[11px] font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25 text-[#a8f0c6]' : 'text-white/55 hover:text-white'}`}>
                        <Icon className="w-5 h-5" strokeWidth={1.8} />{short || label}<NavBadge to={to} className="absolute top-1 right-[calc(50%-1.4rem)]" />
                    </NavLink>
                ))}
            </div>
        </nav>
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
