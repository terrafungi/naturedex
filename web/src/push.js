// Web Push on this browser / phone. In the Android app (TWA) the same code shows Android notifications.
import { api } from './api.jsx';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (b64url) => {
    const raw = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
    // Dev builds don't register sw.js (main.jsx): do it here so notifications can be tried locally.
    return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription() {
    if (!pushSupported()) return null;
    const reg = await registration();
    return reg.pushManager.getSubscription();
}

// Asks the permission (Android shows its own dialog in the app), subscribes, tells the server.
export async function enablePush(publicKey) {
    if (!pushSupported()) throw new Error('Ton navigateur ne gère pas les notifications.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error(permission === 'denied'
            ? 'Notifications bloquées : autorise-les dans les réglages du navigateur (ou de l\'appli), puis réessaie.'
            : 'Notifications non autorisées.');
    }
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && publicKey && sub.options?.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        const wanted = keyBytes(publicKey);
        if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    await api('pushSubscribe', { subscription: sub.toJSON() });
    return sub;
}

export async function disablePush() {
    const sub = await currentSubscription();
    if (!sub) return;
    await api('pushUnsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
}

// Keeps the server in step with this device: a rotated subscription (sw.js message), or another
// player now logged in on the same phone. Silent: does nothing without permission or login.
export function watchPush() {
    if (!pushSupported()) return;
    const SYNC_KEY = 'naturdex.pushSync';
    const resync = async (force) => {
        try {
            const token = localStorage.getItem('naturdex.token');
            if (Notification.permission !== 'granted' || !token) return;
            const last = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
            if (!force && last && last.token === token && Date.now() - last.at < 24 * 3600 * 1000) return; // at most once a day
            const sub = await currentSubscription();
            if (!sub) return; // never enabled on this device: only the profile switch asks
            const { ready, publicKey } = await api('pushConfig');
            if (ready) await enablePush(publicKey);
            localStorage.setItem(SYNC_KEY, JSON.stringify({ token, at: Date.now() }));
        } catch { /* offline, logged out… */ }
    };
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'push-resubscribe') resync(true);
        if (e.data?.type === 'navigate' && e.data.url) window.location.assign(e.data.url);
    });
    resync();
}
