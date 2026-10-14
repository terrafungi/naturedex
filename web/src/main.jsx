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

function Private({ children }) {
    const { user, ready } = useGame();
    if (!ready) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;
    return user ? children : <Navigate to="/connexion" replace />;
}

function Home() {
    const { user, ready } = useGame();
    if (!ready) return null;
    return user ? <Boosters /> : <Landing />;
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <GameProvider>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/connexion" element={<Auth />} />
                        <Route path="/collection" element={<Private><Collection /></Private>} />
                        <Route path="/carte/:id" element={<Private><CardPage /></Private>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </GameProvider>
        </BrowserRouter>
    </StrictMode>
);
