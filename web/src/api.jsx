import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Direct Lambda URL (faster than going through CloudFront /api).
const API_BASE = 'https://6473i3zbep7lhvii3vg7pzg3ny0aicsj.lambda-url.eu-central-1.on.aws/';
const TOKEN_KEY = 'naturdex.token';

export async function api(action, params = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || 'Erreur réseau');
        err.status = res.status;
        throw err;
    }
    return data;
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
    const [user, setUser] = useState(null);
    const [ready, setReady] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [owned, setOwned] = useState({}); // { cardId: count }
    const [ownedInfo, setOwnedInfo] = useState({}); // { cardId: [type, rarity] }

    const refreshCollection = useCallback(async () => {
        const { owned, info } = await api('collection');
        setOwned(owned);
        setOwnedInfo(info);
    }, []);

    useEffect(() => {
        // { total, types: { type: { rarity: count } }, cards: sample for the landing page }
        api('catalog').then(setCatalog).catch(() => setCatalog({ total: 0, types: {}, cards: [] }));
        if (!localStorage.getItem(TOKEN_KEY)) { setReady(true); return; }
        api('me')
            .then(({ user }) => { setUser(user); return refreshCollection(); })
            .catch(() => localStorage.removeItem(TOKEN_KEY))
            .finally(() => setReady(true));
    }, [refreshCollection]);

    // Keep wallet and social badges (friend requests, trade offers) fresh.
    const loggedIn = !!user;
    useEffect(() => {
        if (!loggedIn) return;
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') api('me').then(({ user }) => setUser(user)).catch(() => {});
        }, 45_000);
        return () => clearInterval(t);
    }, [loggedIn]);

    const authenticate = useCallback(async (mode, username, password, extra = {}) => {
        const { token, user } = await api(mode, { username, password, ...extra });
        localStorage.setItem(TOKEN_KEY, token);
        setUser(user);
        await refreshCollection();
    }, [refreshCollection]);

    const logout = useCallback(async () => {
        await api('logout').catch(() => {});
        localStorage.removeItem(TOKEN_KEY);
        localStorage.setItem('naturdex.returning', '1'); // next visit shows log-in, not sign-up
        setUser(null);
        setOwned({});
        setOwnedInfo({});
    }, []);

    // Merge newly opened cards into the local collection without a refetch.
    const addCards = useCallback((cards) => {
        setOwned((prev) => {
            const next = { ...prev };
            for (const c of cards) next[c.id] = (next[c.id] || 0) + 1;
            return next;
        });
        setOwnedInfo((prev) => {
            const next = { ...prev };
            for (const c of cards) next[c.id] = [c.type, c.rarity];
            return next;
        });
    }, []);

    return (
        <GameContext.Provider value={{ user, setUser, ready, catalog, owned, ownedInfo, setOwned, refreshCollection, authenticate, logout, addCards }}>
            {children}
        </GameContext.Provider>
    );
}

export const useGame = () => useContext(GameContext);
