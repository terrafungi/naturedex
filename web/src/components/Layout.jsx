import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Coins, Home, Layers, LogIn, LogOut, Menu, Package, Trophy, User, X } from 'lucide-react';
import { useGame } from '../api.jsx';

export const NAV = [
    { to: '/', label: 'Accueil', Icon: Home, end: true },
    { to: '/collection', label: 'Collection', Icon: Layers },
    { to: '/booster', label: 'Booster', Icon: Package },
    { to: '/defis', label: 'Défis', Icon: Trophy },
    { to: '/profil', label: 'Profil', Icon: User },
];

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
                <span className="block mt-1 text-[8.5px] sm:text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55 truncate">Des cartes pour un monde plus vivant</span>
            </span>
        </Link>
    );
}

const fmt = (n) => Number(n).toLocaleString('fr-FR');

function CoinPill({ coins }) {
    return (
        <Link to="/booster" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e9c46a]/10 ring-1 ring-[#e9c46a]/30 font-bold text-[#f4d88f] text-sm" title="Pièces">
            <Coins className="w-4 h-4" />{fmt(coins)}
        </Link>
    );
}
function MenuSheet({ onClose }) {
    const { user, logout } = useGame();
    return (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.nav className="absolute right-0 top-0 h-full w-[min(320px,85vw)] bg-[#081a11] border-l border-white/10 p-6 flex flex-col gap-1"
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
                <div className="flex items-center justify-between mb-6">
                    <LeafLogo className="w-9 h-9" />
                    <button onClick={onClose} className="grid place-items-center w-10 h-10 rounded-full nd-cta-glass" aria-label="Fermer le menu"><X className="w-5 h-5" /></button>
                </div>
                {user && (
                    <div className="mb-4 rounded-2xl nd-glass p-4">
                        <div className="font-display text-xl text-white">{user.username}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-[#f4d88f]"><Coins className="w-4 h-4" />{fmt(user.coins)} pièces</div>
                    </div>
                )}
                {NAV.map(({ to, label, Icon, end }) => (
                    <NavLink key={to} to={to} end={end} onClick={onClose}
                        className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/15 text-[#a8f0c6]' : 'text-white/80 hover:bg-white/5'}`}>
                        <Icon className="w-5 h-5" />{label}
                    </NavLink>
                ))}
                <div className="mt-auto">
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
        <nav className="nd-tabbar fixed inset-x-0 bottom-0 z-40 md:hidden">
            <div className="grid grid-cols-5 px-2 pt-2 pb-2">
                {NAV.map(({ to, label, Icon, end }) => (
                    <NavLink key={to} to={to} end={end}
                        className={({ isActive }) => `flex flex-col items-center gap-1 py-2 rounded-2xl text-[11px] font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25 text-[#a8f0c6]' : 'text-white/55'}`}>
                        <Icon className="w-5 h-5" strokeWidth={1.8} />{label}
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
                    <nav className="hidden md:flex items-center gap-1">
                        {NAV.map(({ to, label, end }) => (
                            <NavLink key={to} to={to} end={end}
                                className={({ isActive }) => `px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${isActive ? 'bg-[#4fd18b]/15 text-[#a8f0c6] ring-1 ring-[#4fd18b]/25' : 'text-white/70 hover:text-white hover:bg-white/5'}`}>
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                    {user && <CoinPill coins={user.coins} />}
                    <button onClick={() => setMenu(true)} className="grid place-items-center w-11 h-11 rounded-full nd-cta-glass shrink-0" aria-label="Ouvrir le menu">
                        <Menu className="w-5 h-5 text-white" />
                    </button>
                </div>
            </header>
            <main className="flex-1 pb-24 md:pb-0">
                <Outlet />
            </main>
            <footer className="border-t border-white/[0.07] px-4 pt-6 pb-28 md:pb-6 text-center text-xs text-ink-soft">
                NatureDex · Images et textes : <a className="underline hover:text-white" href="https://fr.wikipedia.org" target="_blank" rel="noreferrer">Wikipédia</a> & Wikimedia Commons (licences libres) · Données : Wikidata
            </footer>
            <TabBar />
            <AnimatePresence>{menu && <MenuSheet onClose={() => setMenu(false)} />}</AnimatePresence>
        </div>
    );
}
