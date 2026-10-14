import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '../api.jsx';

const RETURNING_KEY = 'naturdex.returning';

export default function Auth() {
    const { user, authenticate } = useGame();
    const [params] = useSearchParams();
    // New visitors see the sign-up form first; someone who already signed in on this
    // device (or asked for ?mode=login) gets the log-in form.
    const [mode, setMode] = useState(() => {
        const asked = params.get('mode');
        if (asked === 'login' || asked === 'register') return asked;
        return localStorage.getItem(RETURNING_KEY) ? 'login' : 'register';
    });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    if (user) return <Navigate to="/" replace />;

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await authenticate(mode, username, password);
            localStorage.setItem(RETURNING_KEY, '1');
            navigate('/booster');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const tab = (m, label) => (
        <button type="button" onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-colors ${mode === m ? 'bg-white/15 text-white shadow-inner' : 'text-ink-soft hover:text-white hover:bg-white/5'}`}>
            {label}
        </button>
    );

    return (
        <div className="max-w-md mx-auto px-4 py-16">
            <h1 className="font-display text-4xl font-semibold text-white text-center">
                {mode === 'register' ? <>Ton carnet de<br /><span className="nd-grad-text">naturaliste</span></> : <>Bon retour,<br /><span className="nd-grad-text">explorateur</span></>}
            </h1>
            <form onSubmit={submit} className="mt-10 p-6 rounded-3xl bg-white/[0.04] backdrop-blur border border-white/10 shadow-xl shadow-black/30 space-y-4">
                <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
                    {tab('login', 'Connexion')}
                    {tab('register', 'Inscription')}
                </div>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Pseudo</span>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Mot de passe</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                {error && <p className="text-sm font-semibold text-rust">{error}</p>}
                <button disabled={busy} className="w-full py-3.5 rounded-full nd-btn font-semibold disabled:opacity-60">
                    {busy ? '…' : mode === 'register' ? 'Créer mon compte — 10 boosters gratuits' : 'Se connecter'}
                </button>
            </form>
        </div>
    );
}
