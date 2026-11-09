import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
const NO_FAVS = { binders: [], cards: {} };

export function GameProvider({ children }) {
    const [user, setUserRaw] = useState(null);
    const [ready, setReady] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [owned, setOwned] = useState({}); // { cardId: count }
    const [ownedInfo, setOwnedInfo] = useState({}); // { cardId: [type, rarity] }
    const [favs, setFavs] = useState(NO_FAVS); // { binders: [{ id, name, parent, count }], cards: { cardId: [binderId…] } }

    const refreshCollection = useCallback(async () => {
        const [{ owned, info }, favs] = await Promise.all([api('collection'), api('binders')]);
        setOwned(owned);
        setOwnedInfo(info);
        setFavs(favs);
    }, []);

    useEffect(() => {
        // { total, types: { type: { rarity: count } }, cards: sample for the landing page }
        api('catalog').then(setCatalog).catch(() => setCatalog({ total: 0, types: {}, cards: [] }));
        if (!localStorage.getItem(TOKEN_KEY)) { setReady(true); return; }
        api('me')
            .then(({ user }) => { setUserRaw(user); return refreshCollection(); })
            .catch(() => localStorage.removeItem(TOKEN_KEY))
            .finally(() => setReady(true));
    }, [refreshCollection]);

    // Counters per page (`/defis`: 2…) for the navigation badges, refreshed every 30 s,
    // on page change and shortly after any action that returns a new user.
    const [badges, setBadges] = useState({});
    const [gifts, setGifts] = useState([]); // gifts received and not yet shown (pop-up)
    const [awards, setAwards] = useState([]); // weekly showcase prizes won and not yet collected (pop-up)
    const [awardsLater, setAwardsLater] = useState([]); // prizes put off with « Plus tard » during this visit
    const [notices, setNotices] = useState(null); // « Pendant ton absence » (referrals, friend requests, trades)
    const refreshBadges = useCallback(() => {
        if (!localStorage.getItem(TOKEN_KEY)) return;
        api('badges').then(({ user, badges, gifts, awards, notices }) => { setUserRaw(user); setBadges(badges); setGifts(gifts || []); setAwards(awards || []); setNotices(notices || null); }).catch(() => {});
    }, []);
    const loggedIn = !!user;
    useEffect(() => {
        if (!loggedIn) return;
        refreshBadges();
        const t = setInterval(() => document.visibilityState === 'visible' && refreshBadges(), 30_000);
        const onShow = () => document.visibilityState === 'visible' && refreshBadges();
        document.addEventListener('visibilitychange', onShow);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
    }, [loggedIn, refreshBadges]);
    const pending = useRef(0);
    const setUser = useCallback((u) => {
        setUserRaw(u);
        clearTimeout(pending.current);
        if (u) pending.current = setTimeout(refreshBadges, 400);
    }, [refreshBadges]);

    const authenticate = useCallback(async (mode, username, password, extra = {}) => {
        const { token, user } = await api(mode, { username, password, ...extra });
        localStorage.setItem(TOKEN_KEY, token);
        setUser(user);
        await refreshCollection();
    }, [refreshCollection, setUser]);

    const logout = useCallback(async () => {
        await api('logout').catch(() => {});
        localStorage.removeItem(TOKEN_KEY);
        localStorage.setItem('naturdex.returning', '1'); // next visit shows log-in, not sign-up
        setUserRaw(null);
        setBadges({});
        setGifts([]);
        setAwards([]);
        setNotices(null);
        setOwned({});
        setOwnedInfo({});
        setFavs(NO_FAVS);
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
        <GameContext.Provider value={{ user, setUser, ready, badges, refreshBadges, gifts, setGifts, awards, setAwards, awardsLater, setAwardsLater, notices, setNotices, catalog, owned, ownedInfo, setOwned, favs, setFavs, refreshCollection, authenticate, logout, addCards }}>
            {children}
        </GameContext.Provider>
    );
}

export const useGame = () => useContext(GameContext);
