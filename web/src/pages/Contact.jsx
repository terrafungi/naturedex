import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Bug, CheckCircle2, Heart, Lightbulb, Mail, Send } from 'lucide-react';
import { api } from '../api.jsx';

function Shell({ children }) {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Ton avis</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Écrivez-nous</h1>
            <p className="mt-3 text-ink-soft">Une idée, un bug, un merci ou un mot pour le livre d'or : ton message arrive directement chez l'équipe qui développe NatureDex. Et surtout, dis-nous ce qu'il faudrait changer !</p>
            <section className="mt-6 rounded-3xl nd-glass overflow-hidden">{children}</section>
        </div>
    );
}

const FEEDBACK_KINDS = [
    { key: 'idea', Icon: Lightbulb, label: 'À changer / idée', hint: 'Qu\'est-ce qui te manque, t\'agace ou pourrait être mieux ?' },
    { key: 'bug', Icon: Bug, label: 'Bug', hint: 'Où ça s\'est passé, ce que tu faisais, sur téléphone ou ordinateur…' },
    { key: 'thanks', Icon: Heart, label: 'Merci', hint: 'Un petit mot qui fait plaisir.' },
    { key: 'guestbook', Icon: BookOpen, label: 'Livre d\'or', hint: 'Laisse une trace de ton passage sur NatureDex.' },
    { key: 'other', Icon: Mail, label: 'Autre', hint: 'Tout ce qui ne rentre pas dans les autres cases.' },
];
const FEEDBACK_MAX = 900;

export default function Contact() {
    const [kind, setKind] = useState('idea');
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(null);
    const current = FEEDBACK_KINDS.find((k) => k.key === kind);

    async function send(e) {
        e.preventDefault();
        if (text.trim().length < 3 || sending) return;
        setSending(true);
        setError('');
        try {
            const res = await api('sendFeedback', { kind, body: text });
            setSent(res.owner);
            setText('');
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    if (sent) {
        return (
            <Shell><div className="p-6 sm:p-8 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-[#4fd18b]" />
                <p className="mt-3 font-display text-2xl text-white">Merci pour ton message !</p>
                <p className="mt-2 text-ink-soft">Il est bien arrivé. Si une réponse est nécessaire, elle t'attendra dans tes messages.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Link to={`/messages/${encodeURIComponent(sent)}`} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold text-white">Voir la conversation</Link>
                    <button onClick={() => setSent(null)} className="px-4 py-2 rounded-full nd-btn text-sm font-semibold">Écrire autre chose</button>
                </div>
            </div></Shell>
        );
    }

    return (
        <Shell><form onSubmit={send} className="p-5 sm:p-7">
            <p className="font-display text-2xl text-white">Ton message</p>
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Type de message">
                {FEEDBACK_KINDS.map((k) => (
                    <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${kind === k.key ? 'bg-[#4fd18b] text-[#05130d]' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
                        <k.Icon className="w-4 h-4" />{k.label}
                    </button>
                ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_MAX))} rows={6} placeholder={current.hint}
                className="mt-4 w-full resize-y px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-soft">{text.length} / {FEEDBACK_MAX}</span>
                {error && <span className="text-sm font-semibold text-rust">{error}</span>}
            </div>
            <button disabled={text.trim().length < 3 || sending} className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full nd-btn font-semibold disabled:opacity-40">
                <Send className="w-4 h-4" />{sending ? 'Envoi…' : 'Envoyer'}
            </button>
        </form></Shell>
    );
}
