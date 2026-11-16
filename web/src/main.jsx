import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { GameProvider, useGame } from './api.jsx';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Boosters from './pages/Boosters.jsx';
import Garden from './pages/Garden.jsx';
import Terrain from './pages/Terrain.jsx';
const Exploration = lazy(() => import('./pages/Exploration.jsx')); // MapLibre: its own chunk
import Collection from './pages/Collection.jsx';
import ShowcaseEditor from './pages/ShowcaseEditor.jsx';
import Showcases from './pages/Showcases.jsx';
import CardPage from './pages/CardPage.jsx';
import AdminCards from './pages/AdminCards.jsx';
import Challenges from './pages/Challenges.jsx';
import Profile from './pages/Profile.jsx';
import AvatarEditor from './pages/AvatarEditor.jsx';
import Player from './pages/Player.jsx';
import Trophies from './pages/Trophies.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Invite from './pages/Invite.jsx';
import Messages from './pages/Messages.jsx';
import Contact from './pages/Contact.jsx';
import Auctions from './pages/Auctions.jsx';
import Friends from './pages/Friends.jsx';
import Quiz from './pages/Quiz.jsx';
import Shop from './pages/Shop.jsx';
import Privacy from './pages/Privacy.jsx';

// ?applixir on any page tries AppLixir in this browser before it is live for everyone (?applixir=0 stops)
const applixirParam = new URLSearchParams(location.search).get('applixir');
if (applixirParam !== null) localStorage.setItem('applixirTest', applixirParam === '0' ? '0' : '1');
import Combat from './pages/Combat.jsx';
import Battle from './pages/Battle.jsx';
const Duel = lazy(() => import('./pages/Duel.jsx'));
const DuelGame = lazy(() => import('./pages/DuelGame.jsx'));
const DeckBuilder = lazy(() => import('./pages/DeckBuilder.jsx'));

// Every page but the home needs an account; visitors are sent to the sign-up form
// (Auth switches to log-in for returning players).
function Private({ children }) {
    const { user, ready } = useGame();
    const { search } = useLocation();
    if (!ready) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;
    // keep ?parrain=… (invite links point at the home page)
    return user ? children : <Navigate to={`/connexion${search}`} replace />;
}

// The home is public: visitors get the presentation of the game, players their home.
// Invite links (/?parrain=…) still go straight to the sign-up form.
function Home() {
    const { user, ready } = useGame();
    const { search } = useLocation();
    if (!ready) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;
    if (!user && new URLSearchParams(search).has('parrain')) return <Navigate to={`/connexion${search}`} replace />;
    return <Landing />;
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <GameProvider>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/connexion" element={<Auth />} />
                        <Route path="/confidentialite" element={<Privacy />} />
                        <Route path="/booster" element={<Private><Boosters /></Private>} />
                        <Route path="/exploration" element={<Private><Suspense fallback={<div className="py-32 text-center font-display text-xl text-ink-soft">Chargement de la carte…</div>}><Exploration /></Suspense></Private>} />
                        <Route path="/terrain" element={<Private><Terrain /></Private>} />
                        <Route path="/jardin" element={<Private><Garden /></Private>} />
                        <Route path="/defis" element={<Private><Challenges /></Private>} />
                        <Route path="/trophees" element={<Private><Trophies /></Private>} />
                        <Route path="/classement" element={<Private><Leaderboard /></Private>} />
                        <Route path="/inviter" element={<Private><Invite /></Private>} />
                        <Route path="/messages" element={<Private><Messages /></Private>} />
                        <Route path="/messages/:username" element={<Private><Messages /></Private>} />
                        <Route path="/ecrivez-nous" element={<Private><Contact /></Private>} />
                        <Route path="/encheres" element={<Private><Auctions /></Private>} />
                        <Route path="/combat" element={<Private><Combat /></Private>} />
                        <Route path="/combat/:id" element={<Private><Battle /></Private>} />
                        <Route path="/duel" element={<Private><Suspense fallback={null}><Duel /></Suspense></Private>} />
                        <Route path="/duel/deck" element={<Private><Suspense fallback={null}><DeckBuilder /></Suspense></Private>} />
                        <Route path="/duel/:id" element={<Private><Suspense fallback={null}><DuelGame /></Suspense></Private>} />
                        <Route path="/quiz" element={<Private><Quiz /></Private>} />
                        <Route path="/boutique" element={<Private><Shop /></Private>} />
                        <Route path="/amis" element={<Private><Friends /></Private>} />
                        <Route path="/profil" element={<Private><Profile /></Private>} />
                        <Route path="/avatar" element={<Private><AvatarEditor /></Private>} />
                        <Route path="/joueur/:username" element={<Private><Player /></Private>} />
                        <Route path="/collection" element={<Private><Collection /></Private>} />
                        <Route path="/vitrine" element={<Private><ShowcaseEditor /></Private>} />
                        <Route path="/vitrines" element={<Private><Showcases /></Private>} />
                        <Route path="/carte/:id" element={<Private><CardPage /></Private>} />
                        <Route path="/admin/cartes" element={<Private><AdminCards /></Private>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </GameProvider>
        </BrowserRouter>
    </StrictMode>
);

// Installable app (see public/sw.js: nothing is cached).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
