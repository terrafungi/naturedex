import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { GameProvider, useGame } from './api.jsx';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Boosters from './pages/Boosters.jsx';
import Collection from './pages/Collection.jsx';
import CardPage from './pages/CardPage.jsx';
import Challenges from './pages/Challenges.jsx';
import Profile from './pages/Profile.jsx';
import Trophies from './pages/Trophies.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Auctions from './pages/Auctions.jsx';
import Friends from './pages/Friends.jsx';
import Quiz from './pages/Quiz.jsx';
import Shop from './pages/Shop.jsx';

// Sign-up is mandatory: every page (home included) needs an account, so a first
// visit lands on the sign-up form (Auth switches to log-in for returning players).
function Private({ children }) {
    const { user, ready } = useGame();
    if (!ready) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;
    return user ? children : <Navigate to="/connexion" replace />;
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
                        <Route path="/defis" element={<Private><Challenges /></Private>} />
                        <Route path="/trophees" element={<Private><Trophies /></Private>} />
                        <Route path="/classement" element={<Private><Leaderboard /></Private>} />
                        <Route path="/encheres" element={<Private><Auctions /></Private>} />
                        <Route path="/quiz" element={<Private><Quiz /></Private>} />
                        <Route path="/boutique" element={<Private><Shop /></Private>} />
                        <Route path="/amis" element={<Private><Friends /></Private>} />
                        <Route path="/profil" element={<Private><Profile /></Private>} />
                        <Route path="/collection" element={<Private><Collection /></Private>} />
                        <Route path="/carte/:id" element={<Private><CardPage /></Private>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </GameProvider>
        </BrowserRouter>
    </StrictMode>
);
