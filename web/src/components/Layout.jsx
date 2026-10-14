import { Link, NavLink, Outlet } from 'react-router-dom';
import { Coins, Library, LogOut, Package } from 'lucide-react';
import { useGame } from '../api.jsx';

const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
        isActive ? 'bg-white/12 text-white ring-1 ring-white/15' : 'text-ink-soft hover:text-white hover:bg-white/5'
    }`;

export default function Layout() {
    const { user, logout } = useGame();
    return (
        <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070a14]/65 border-b border-white/[0.07]">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
                    <Link to="/" className="group flex items-center gap-2 mr-auto">
                        <span className="grid place-items-center w-8 h-8 rounded-xl bg-[conic-gradient(from_200deg,#14c8d6,#7c5cff,#ff4f9a,#ffc53d,#3cf29b,#14c8d6)] shadow-lg shadow-violet-500/30 transition-transform group-hover:rotate-12">
                            <span className="w-3 h-3 rounded-full bg-white/90" />
                        </span>
                        <span className="font-display text-2xl font-extrabold tracking-tight text-white">Natur<span className="nd-grad-text">Dex</span></span>
                    </Link>
                    {user ? (
                        <>
                            <nav className="flex items-center gap-1">
                                <NavLink to="/" end className={navClass}><Package className="w-4 h-4" /><span className="hidden sm:inline">Boosters</span></NavLink>
                                <NavLink to="/collection" className={navClass}><Library className="w-4 h-4" /><span className="hidden sm:inline">Collection</span></NavLink>
                            </nav>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 ring-1 ring-amber-300/25 font-display font-bold text-amber-300" title="Pièces">
                                <Coins className="w-4 h-4" />{user.coins}
                            </div>
                            <button onClick={logout} className="p-2 rounded-full text-ink-soft hover:text-white hover:bg-white/10" title={`Se déconnecter (${user.username})`}>
                                <LogOut className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <Link to="/connexion" className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-white/[0.07] ring-1 ring-white/15 hover:bg-white/15 transition-colors">
                            Se connecter
                        </Link>
                    )}
                </div>
            </header>
            <main className="flex-1">
                <Outlet />
            </main>
            <footer className="border-t border-white/[0.07] px-4 py-6 text-center text-xs text-ink-soft">
                Images et textes : <a className="underline hover:text-white" href="https://fr.wikipedia.org" target="_blank" rel="noreferrer">Wikipédia</a> & Wikimedia Commons (licences libres) · Données : Wikidata
            </footer>
        </div>
    );
}
