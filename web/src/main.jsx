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
import Challenges from './pages/Challenges.jsx';
import Profile from './pages/Profile.jsx';
import AvatarEditor from './pages/AvatarEditor.jsx';
import Player from './pages/Player.jsx';
import Trophies from './pages/Trophies.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Invite from './pages/Invite.jsx';
import Messages from './pages/Messages.jsx';
import Auctions from './pages/Auctions.jsx';
import Friends from './pages/Friends.jsx';
import Quiz from './pages/Quiz.jsx';
import Shop from './pages/Shop.jsx';
import Combat from './pages/Combat.jsx';
import Battle from './pages/Battle.jsx';

// Sign-up is mandatory: every page (home included) needs an account, so a first
// visit lands on the sign-up form (Auth switches to log-in for returning players).
function Private({ children }) {
    const { user, ready } = useGame();
    const { search } = useLocation();
    if (!ready) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;
    // keep ?parrain=… (invite links point at the home page)
    return user ? children : <Navigate to={`/connexion${search}`} replace />;
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <GameProvider>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Private><Landing /></Private>} />
                        <Route path="/connexion" element={<Auth />} />
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
                        <Route path="/encheres" element={<Private><Auctions /></Private>} />
                        <Route path="/combat" element={<Private><Combat /></Private>} />
                        <Route path="/combat/:id" element={<Private><Battle /></Private>} />
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
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </GameProvider>
        </BrowserRouter>
    </StrictMode>
);
