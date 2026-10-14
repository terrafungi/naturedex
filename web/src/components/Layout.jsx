import { Link, NavLink, Outlet } from 'react-router-dom';
import { Coins, Library, LogOut, Package } from 'lucide-react';
import { useGame } from '../api.jsx';

const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
        isActive ? 'bg-forest text-paper' : 'text-forest hover:bg-forest/10'
    }`;

export default function Layout() {
    const { user, logout } = useGame();
    return (
        <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 backdrop-blur-sm bg-paper/80 border-b border-forest/15">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
                    <Link to="/" className="flex items-baseline gap-1 mr-auto">
                        <span className="font-display text-2xl font-black text-forest tracking-tight">Natur</span>
                        <span className="font-display text-2xl italic text-brass-deep">Dex</span>
                    </Link>
                    {user ? (
                        <>
                            <nav className="flex items-center gap-1">
                                <NavLink to="/" end className={navClass}><Package className="w-4 h-4" /><span className="hidden sm:inline">Boosters</span></NavLink>
                                <NavLink to="/collection" className={navClass}><Library className="w-4 h-4" /><span className="hidden sm:inline">Collection</span></NavLink>
                            </nav>
                            <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-forest/15 font-display font-bold text-brass-deep" title="Pièces">
                                <Coins className="w-4 h-4" />{user.coins}
                            </div>
                            <button onClick={logout} className="p-2 rounded-full text-ink-soft hover:bg-forest/10" title={`Se déconnecter (${user.username})`}>
                                <LogOut className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <Link to="/connexion" className="px-4 py-2 rounded-full bg-forest text-paper text-sm font-semibold hover:bg-forest-deep">
                            Se connecter
                        </Link>
                    )}
                </div>
            </header>
            <main className="flex-1">
                <Outlet />
            </main>
            <footer className="border-t border-forest/15 py-6 text-center text-xs text-ink-soft">
                Images et textes : <a className="underline" href="https://fr.wikipedia.org" target="_blank" rel="noreferrer">Wikipédia</a> & Wikimedia Commons (licences libres) · Données : Wikidata
            </footer>
        </div>
    );
}
