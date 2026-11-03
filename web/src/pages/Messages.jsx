import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send, UserPlus } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import PlayerAvatar from '../components/PlayerAvatar.jsx';

const MAX = 1000;
const POLL_MS = 5000;

// 14:05 today, "hier", or 12 oct.
function when(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function Conversations({ data, active }) {
    if (!data) return <p className="p-6 text-center text-ink-soft">Chargement…</p>;
    const { conversations, friends } = data;
    if (!conversations.length && !friends.length) {
        return (
            <div className="p-6 text-center">
                <p className="text-ink-soft">Tu peux écrire à tes amis. Ajoute d'abord un ami avec son pseudo.</p>
                <Link to="/amis" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full nd-btn text-sm font-semibold"><UserPlus className="w-4 h-4" />Ajouter un ami</Link>
            </div>
        );
    }
    return (
        <div className="p-2">
            <ul className="space-y-1">
                {conversations.map((c) => (
                    <li key={c.username}>
                        <Link to={`/messages/${encodeURIComponent(c.username)}`}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${active === c.username ? 'bg-[#4fd18b]/12 ring-1 ring-[#4fd18b]/25' : 'hover:bg-white/5'}`}>
                            <PlayerAvatar name={c.username} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-baseline gap-2">
                                    <span className={`truncate ${c.unread ? 'font-bold text-white' : 'font-semibold text-white/90'}`}>{c.username}</span>
                                    <span className="ml-auto shrink-0 text-[11px] text-ink-soft">{when(c.created_at)}</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className={`truncate text-sm ${c.unread ? 'text-white' : 'text-ink-soft'}`}>{c.mine && 'Toi : '}{c.body}</span>
                                    {c.unread > 0 && <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 inline-grid place-items-center rounded-full bg-[#ff6b6b] text-white text-[11px] font-bold">{c.unread}</span>}
                                </span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            {friends.length > 0 && (
                <>
                    <p className="px-3 pt-4 pb-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">Écrire à un ami</p>
                    <div className="px-2 flex flex-wrap gap-1.5">
                        {friends.map((f) => (
                            <Link key={f} to={`/messages/${encodeURIComponent(f)}`} className="flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-sm font-semibold text-white">
                                <PlayerAvatar name={f} size={24} />{f}
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function Thread({ username, onActivity }) {
    const { refreshBadges } = useGame();
    const navigate = useNavigate();
    const [thread, setThread] = useState(null);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const scroller = useRef(null);
    const lastId = useRef(0);

    // Full load, then only messages newer than the last one we have.
    const load = useCallback(async (initial) => {
        const res = await api('thread', { username, after: initial ? 0 : lastId.current });
        if (res.messages.length) lastId.current = Number(res.messages.at(-1).id);
        setThread((prev) => (initial || !prev ? res : { ...res, messages: [...prev.messages, ...res.messages.filter((m) => !prev.messages.some((p) => p.id === m.id))] }));
        if (res.read) { refreshBadges(); onActivity(); }
        return res;
    }, [username, refreshBadges, onActivity]);

    useEffect(() => {
        let live = true;
        lastId.current = 0;
        setThread(null);
        setError('');
        load(true).catch((e) => live && setError(e.message));
        const t = setInterval(() => document.visibilityState === 'visible' && load(false).catch(() => {}), POLL_MS);
        return () => { live = false; clearInterval(t); };
    }, [load]);

    const count = thread?.messages.length || 0;
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [count]);

    async function send(e) {
        e?.preventDefault();
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        setError('');
        try {
            const { message } = await api('sendMessage', { username, body });
            setText('');
            lastId.current = Math.max(lastId.current, Number(message.id));
            setThread((prev) => ({ ...prev, messages: [...prev.messages, message] }));
            onActivity();
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    const name = thread?.username || username;
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-3 py-3 border-b border-white/10">
                <button onClick={() => navigate('/messages')} className="lg:hidden grid place-items-center w-9 h-9 rounded-full hover:bg-white/10 text-white" aria-label="Retour aux conversations"><ArrowLeft className="w-5 h-5" /></button>
                <PlayerAvatar name={name} size={36} />
                <p className="font-display text-lg font-semibold text-white truncate">{name}</p>
            </div>
            <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1.5">
                {!thread && !error && <p className="text-center text-ink-soft">Chargement…</p>}
                {thread && !thread.messages.length && <p className="mt-8 text-center text-ink-soft">Aucun message pour l'instant. Dis bonjour à {name} !</p>}
                {thread?.messages.map((m, i) => {
                    const prev = thread.messages[i - 1];
                    const gap = !prev || prev.mine !== m.mine || new Date(m.created_at) - new Date(prev.created_at) > 10 * 60_000;
                    return (
                        <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'} ${gap && i ? 'pt-2' : ''}`}>
                            <p className={`max-w-[80%] px-3.5 py-2 rounded-2xl whitespace-pre-wrap break-words text-[15px] leading-snug ${m.gift ? 'bg-[#e9c46a] text-[#05130d] font-semibold ring-2 ring-[#e9c46a]/40 shadow-[0_0_24px_rgba(233,196,106,0.35)]' : m.mine ? 'bg-[#4fd18b] text-[#05130d]' : 'bg-white/10 text-white'} ${m.mine ? 'rounded-br-md' : 'rounded-bl-md'}`}>{m.body}</p>
                            {gap && <span className="mt-0.5 px-1 text-[10.5px] text-ink-soft">{when(m.created_at)}{m.mine && m.read_at && i === thread.messages.length - 1 ? ' · Lu' : ''}</span>}
                        </div>
                    );
                })}
            </div>
            {error && <p className="px-4 pb-2 text-sm font-semibold text-rust">{error}</p>}
            {thread && !thread.friend ? (
                <p className="px-4 py-3 border-t border-white/10 text-sm text-ink-soft">Vous n'êtes plus amis : tu ne peux plus écrire à {name}.</p>
            ) : (
                <form onSubmit={send} className="flex items-end gap-2 p-2.5 border-t border-white/10">
                    <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} rows={1} placeholder={`Message à ${name}…`}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }}
                        className="flex-1 min-w-0 max-h-32 resize-none px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 [field-sizing:content]" />
                    <button disabled={!text.trim() || sending} className="grid place-items-center w-11 h-11 shrink-0 rounded-full bg-[#4fd18b] text-[#05130d] disabled:opacity-40" aria-label="Envoyer"><Send className="w-5 h-5" /></button>
                </form>
            )}
        </div>
    );
}

export default function Messages() {
    const { username } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    const loadList = useCallback(() => { api('conversations').then(setData).catch((e) => setError(e.message)); }, []);
    useEffect(() => {
        loadList();
        const t = setInterval(() => document.visibilityState === 'visible' && loadList(), 15_000);
        return () => clearInterval(t);
    }, [loadList]);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
            <div className={username ? 'hidden lg:block' : ''}>
                <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Messagerie</p>
                <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Messages</h1>
                <p className="mt-3 text-ink-soft">Discute avec tes amis : prépare un échange, montre tes plus belles cartes.</p>
            </div>
            {error && <p className="mt-4 text-sm font-semibold text-rust">{error}</p>}
            <div className={`${username ? 'mt-0 lg:mt-6' : 'mt-6'} lg:grid lg:grid-cols-[19rem_1fr] lg:gap-4`}>
                <section className={`rounded-3xl nd-glass overflow-hidden lg:h-[34rem] lg:overflow-y-auto ${username ? 'hidden lg:block' : ''}`}>
                    <Conversations data={data} active={username} />
                </section>
                <section className={`rounded-3xl nd-glass overflow-hidden h-[calc(100dvh-12.5rem)] sm:h-[calc(100dvh-14rem)] lg:h-[34rem] ${username ? '' : 'hidden lg:block'}`}>
                    {username ? <Thread key={username} username={username} onActivity={loadList} /> : (
                        <div className="h-full grid place-items-center p-6 text-center text-ink-soft">
                            <span><MessageCircle className="w-10 h-10 mx-auto mb-3 text-white/30" />Choisis une conversation.</span>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
