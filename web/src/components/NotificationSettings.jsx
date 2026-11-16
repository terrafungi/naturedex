import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Send } from 'lucide-react';
import { api } from '../api.jsx';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push.js';

// Profile section: turn notifications on for this device, and pick the categories (shared by all devices).
export default function NotificationSettings() {
    const [config, setConfig] = useState(null);
    const [on, setOn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    const load = async () => {
        const sub = await currentSubscription().catch(() => null);
        const c = await api('pushConfig', { endpoint: sub?.endpoint || '' });
        setConfig(c);
        setOn(!!sub && c.subscribed && Notification.permission === 'granted');
    };
    useEffect(() => { if (pushSupported()) load().catch(() => {}); }, []);

    if (!pushSupported()) {
        return (
            <section className="mt-6 rounded-3xl nd-glass p-5">
                <h2 className="font-display text-xl text-white flex items-center gap-2"><Bell className="w-5 h-5 text-[#f4d88f]" />Notifications</h2>
                <p className="mt-2 text-sm text-white/65">Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord NatureDex à l'écran d'accueil (Partager → Sur l'écran d'accueil).</p>
            </section>
        );
    }
    if (!config?.ready) return null; // not configured on the server yet

    const run = async (fn, ok) => {
        setBusy(true); setNote(null);
        try { await fn(); if (ok) setNote({ text: ok }); } catch (err) { setNote({ error: true, text: err.message }); }
        setBusy(false);
    };
    const toggle = () => run(async () => {
        if (on) { await disablePush(); setOn(false); return; }
        await enablePush(config.publicKey);
        setOn(true);
    });
    const setKind = (key, value) => run(async () => {
        await api('pushPrefs', { prefs: { [key]: value } });
        setConfig((c) => ({ ...c, kinds: c.kinds.map((k) => (k.key === key ? { ...k, on: value } : k)) }));
    });

    return (
        <section className="mt-6 rounded-3xl nd-glass p-5">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="flex-1 font-display text-xl text-white flex items-center gap-2"><Bell className="w-5 h-5 text-[#f4d88f]" />Notifications</h2>
                <button onClick={toggle} disabled={busy}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold disabled:opacity-50 ${on ? 'ring-1 ring-white/20 text-white/80 hover:bg-white/5' : 'nd-cta-gold'}`}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    {on ? 'Désactiver sur cet appareil' : 'Activer sur cet appareil'}
                </button>
            </div>
            <p className="mt-2 text-sm text-white/65">
                {on ? 'Cet appareil reçoit les notifications NatureDex.' : 'Sois prévenu quand tes boosters sont rechargés, quand on surenchérit sur toi ou quand un ami t\'écrit.'}
                {config.devices > (on ? 1 : 0) && <> Autres appareils abonnés : {config.devices - (on ? 1 : 0)}.</>}
            </p>
            <ul className="mt-4 space-y-2">
                {config.kinds.map((k) => (
                    <li key={k.key}>
                        <label className="flex items-center gap-3 text-sm text-white/85 cursor-pointer">
                            <button type="button" role="switch" aria-checked={k.on} disabled={busy} onClick={() => setKind(k.key, !k.on)}
                                className={`relative w-10 h-6 rounded-full transition shrink-0 ${k.on ? 'bg-[#4fd18b]' : 'bg-white/15'}`}>
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white grid place-items-center transition-all ${k.on ? 'left-[1.125rem]' : 'left-0.5'}`}>
                                    {k.on && <Check className="w-3 h-3 text-[#05130d]" strokeWidth={3} />}
                                </span>
                            </button>
                            {k.label}
                        </label>
                    </li>
                ))}
            </ul>
            {on && (
                <button onClick={() => run(() => api('pushTest'), 'Notification envoyée : elle arrive dans quelques secondes.')} disabled={busy}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#a8f0c6] hover:underline disabled:opacity-50">
                    <Send className="w-4 h-4" />M'envoyer une notification de test
                </button>
            )}
            {note && <p className={`mt-3 text-sm ${note.error ? 'text-red-300' : 'text-emerald-300'}`}>{note.text}</p>}
        </section>
    );
}
