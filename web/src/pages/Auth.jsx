import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '../api.jsx';

export default function Auth() {
    const { user, authenticate } = useGame();
    const [params] = useSearchParams();
    const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
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
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const tab = (m, label) => (
        <button type="button" onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-colors ${mode === m ? 'bg-forest text-paper' : 'text-forest hover:bg-forest/10'}`}>
            {label}
        </button>
    );

    return (
        <div className="max-w-md mx-auto px-4 py-16">
            <h1 className="font-display text-4xl font-black text-forest text-center">
                {mode === 'register' ? <>Ton carnet de<br /><i className="font-medium text-brass-deep">naturaliste</i></> : <>Bon retour,<br /><i className="font-medium text-brass-deep">explorateur</i></>}
            </h1>
            <form onSubmit={submit} className="mt-10 p-6 rounded-3xl bg-paper-deep/60 border border-forest/15 shadow-xl shadow-forest/5 space-y-4">
                <div className="flex gap-1 p-1 rounded-full bg-paper border border-forest/15">
                    {tab('login', 'Connexion')}
                    {tab('register', 'Inscription')}
                </div>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Pseudo</span>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-paper border border-forest/20 focus:outline-none focus:ring-2 focus:ring-brass" />
                </label>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Mot de passe</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        className="mt-1 w-full px-4 py-3 rounded-xl bg-paper border border-forest/20 focus:outline-none focus:ring-2 focus:ring-brass" />
                </label>
                {error && <p className="text-sm font-semibold text-rust">{error}</p>}
                <button disabled={busy} className="w-full py-3.5 rounded-full bg-forest text-paper font-semibold hover:bg-forest-deep disabled:opacity-60">
                    {busy ? '…' : mode === 'register' ? 'Créer mon compte — 3 boosters offerts' : 'Se connecter'}
                </button>
            </form>
        </div>
    );
}
