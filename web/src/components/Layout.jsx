import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Brain, Gavel, Home, Layers, LogIn, LogOut, Menu, Package, Plus, ShoppingBag, Trophy, User, Users, X } from 'lucide-react';
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
    { to: '/boutique', label: 'Boutique solidaire', Icon: ShoppingBag },
    { to: '/profil', label: 'Profil', Icon: User },
];
// The mobile tab bar has room for five: the rest stays in the menu.
const TABS = NAV.filter(({ to }) => !['/', '/profil', '/trophees', '/defis', '/boutique'].includes(to));

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

function Brand() {
    return (
        <Link to="/" className="group flex items-center gap-2.5 mr-auto min-w-0">
            <LeafLogo className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_0_12px_rgba(79,209,139,0.45)] transition-transform group-hover:-rotate-12" />
            <span className="leading-none min-w-0">
                <span className="block font-display text-[1.6rem] sm:text-[1.8rem] font-semibold text-white">NatureDex</span>
                <span className="block lg:hidden xl:block mt-1 text-[8.5px] sm:text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55 truncate">Des cartes pour un monde plus vivant</span>
            </span>
        </Link>
    );
}

const fmt = (n) => Number(n).toLocaleString('fr-FR');

function Wallet({ user }) {
    return (
        <div className="flex items-center rounded-full bg-white/[0.06] ring-1 ring-white/12 text-sm font-bold tabular-nums">
            <Link to="/booster" className="flex items-center gap-1 pl-2.5 pr-2 py-1.5 text-[#8ee6a8]" title="Graines : pour ouvrir des boosters">
                <Seed />{fmt(user.coins)}
            </Link>
            <span className="w-px h-4 bg-white/15" />
            <Link to="/encheres" className="flex items-center gap-1 pl-2 pr-2.5 py-1.5 text-[#f4c25b]" title="Pépites : pour les enchères">
                <Nugget />{fmt(user.nuggets)}
            </Link>
            <Link to="/boutique" className="grid place-items-center w-6 h-6 mr-1 rounded-full bg-[#e9c46a] text-[#2a1c00] hover:brightness-110" title="Boutique solidaire : acheter des crédits">
                <Plus className="w-4 h-4" strokeWidth={3} />
            </Link>
        </div>
    );
}
function MenuSheet({ onClose }) {
    const { user, logout } = useGame();
    return (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.nav className="absolute right-0 top-0 h-full w-[min(320px,85vw)] bg-[#081a11] border-l border-white/10 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-0.5 overflow-y-auto overscroll-contain"
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <LeafLogo className="w-9 h-9" />
                    <button onClick={onClose} className="grid place-items-center w-10 h-10 rounded-full nd-cta-glass" aria-label="Fermer le menu"><X className="w-5 h-5" /></button>
                </div>
                {user && (
                    <div className="mb-3 shrink-0 rounded-2xl nd-glass px-4 py-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="font-display text-lg text-white truncate">{user.username}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm font-semibold tabular-nums">
                                <span className="flex items-center gap-1 text-[#8ee6a8]"><Seed />{fmt(user.coins)}</span>
                                <span className="flex items-center gap-1 text-[#f4c25b]"><Nugget />{fmt(user.nuggets)}</span>
                            </div>
                        </div>
                        <Link to="/boutique" onClick={onClose} className="grid place-items-center w-9 h-9 rounded-full bg-[#e9c46a] text-[#2a1c00] shrink-0" title="Boutique solidaire" aria-label="Boutique solidaire">
                            <Plus className="w-5 h-5" strokeWidth={3} />
                        </Link>
                    </div>
                )}
                {NAV.map(({ to, label, Icon, end }) => (
                    <NavLink key={to} to={to} end={end} onClick={onClose}
                        className={({ isActive }) => `shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/15 text-[#a8f0c6]' : 'text-white/80 hover:bg-white/5'}`}>
                        <Icon className="w-5 h-5" />{label}<NavBadge to={to} className="ml-auto" />
                    </NavLink>
                ))}
                <div className="mt-auto pt-3 shrink-0">
                    {user ? (
                        <button onClick={() => { logout(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/5">
                            <LogOut className="w-5 h-5" />Se déconnecter
                        </button>
                    ) : (
                        <Link to="/connexion" onClick={onClose} className="nd-cta-gold flex items-center justify-center gap-2 px-4 py-3 rounded-full font-bold">
                            <LogIn className="w-5 h-5" />Se connecter
                        </Link>
                    )}
                </div>
            </motion.nav>
        </motion.div>
    );
}

function TabBar() {
    return (
        <nav className="nd-tabbar fixed inset-x-0 bottom-0 z-40 lg:hidden">
            <div className="grid grid-cols-5 px-2 pt-2 pb-2">
                {TABS.map(({ to, label, Icon, end }) => (
                    <NavLink key={to} to={to} end={end}
                        className={({ isActive }) => `relative flex flex-col items-center gap-1 py-2 rounded-2xl text-[11px] font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25 text-[#a8f0c6]' : 'text-white/55'}`}>
                        <Icon className="w-5 h-5" strokeWidth={1.8} />{label}<NavBadge to={to} className="absolute top-1 right-[calc(50%-1.4rem)]" />
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}

export default function Layout() {
    const { user } = useGame();
    const [menu, setMenu] = useState(false);
    const { pathname } = useLocation();
    const home = pathname === '/';
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

    return (
        <div className="min-h-screen flex flex-col">
            <header className={`${home ? 'absolute' : 'sticky bg-[#05130d]/75 backdrop-blur-xl border-b border-white/[0.07]'} top-0 inset-x-0 z-40`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[4.5rem] sm:h-20 flex items-center gap-3">
                    <Brand />
                    <nav className="hidden lg:flex items-center gap-0.5">
                        {NAV.filter(({ to }) => to !== '/' && to !== '/boutique').map(({ to, label, end }) => (
                            <NavLink key={to} to={to} end={end}
                                className={({ isActive }) => `flex items-center gap-1 px-2.5 py-2 rounded-full text-sm font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/25' : 'text-white/70 hover:text-white hover:bg-white/5'}`}>
                                {label}<NavBadge to={to} />
                            </NavLink>
                        ))}
                    </nav>
                    {user && <Wallet user={user} />}
                    <button onClick={() => setMenu(true)} className="grid place-items-center w-11 h-11 rounded-full nd-cta-glass shrink-0" aria-label="Ouvrir le menu">
                        <Menu className="w-5 h-5 text-white" />
                    </button>
                </div>
            </header>
            <main className="flex-1 pb-24 lg:pb-0">
                <Outlet />
            </main>
            <footer className="border-t border-white/[0.07] px-4 pt-6 pb-28 lg:pb-6 text-center text-xs text-ink-soft">
                NatureDex · Images et textes : <a className="underline hover:text-white" href="https://fr.wikipedia.org" target="_blank" rel="noreferrer">Wikipédia</a> & Wikimedia Commons (licences libres) · Données : Wikidata
            </footer>
            <TabBar />
            <AnimatePresence>{menu && <MenuSheet onClose={() => setMenu(false)} />}</AnimatePresence>
        </div>
    );
}
