import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Gift, Mail, MessageCircle, Send, Share2, UserPlus, Users } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Amount } from '../components/Currency.jsx';

// lucide no longer ships brand logos: two small hand-drawn ones.
const FacebookIcon = (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M13.5 21v-7.5h2.6l.4-3.1h-3V8.5c0-.9.3-1.5 1.6-1.5h1.6V4.2c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H7.9v3.1h2.6V21h3z" /></svg>
);
const XIcon = (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" /></svg>
);

const n = (v) => Number(v).toLocaleString('fr-FR');

function shareText(catalogTotal, bonus) {
    return `Je collectionne les espèces du vivant sur NatureDex : ${catalogTotal ? `${n(catalogTotal)} cartes` : 'des milliers de cartes'} tirées de Wikipédia, et 20 % des achats vont à des associations nature. Inscris-toi avec mon lien : tu gagnes ${bonus.coins} graines et ${bonus.nuggets} pépites !`;
}

function Reward({ Icon, title, children }) {
    return (
        <div className="rounded-2xl p-4 nd-glass flex gap-3">
            <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-[#e9c46a]/15 text-[#f4d88f]"><Icon className="w-5 h-5" /></span>
            <div className="min-w-0">
                <p className="font-semibold text-white leading-tight">{title}</p>
                <div className="mt-1 text-sm text-ink-soft leading-snug">{children}</div>
            </div>
        </div>
    );
}

export default function Invite() {
    const { setUser, catalog } = useGame();
    const [data, setData] = useState(null);
    const [message, setMessage] = useState('');
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => { api('invites').then(setData).catch((e) => setMessage(e.message)); }, []);

    const link = data ? `${window.location.origin}/?parrain=${data.code}` : '';
    const text = data ? shareText(catalog?.total, data.inviteeBonus) : '';
    const enc = encodeURIComponent;
    const networks = [
        { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, color: '#25d366', url: `https://wa.me/?text=${enc(`${text} ${link}`)}` },
        { key: 'facebook', label: 'Facebook', Icon: FacebookIcon, color: '#1877f2', url: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}` },
        { key: 'x', label: 'X', Icon: XIcon, color: '#e7e9ea', url: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(link)}` },
        { key: 'telegram', label: 'Telegram', Icon: Send, color: '#29a9eb', url: `https://t.me/share/url?url=${enc(link)}&text=${enc(text)}` },
        { key: 'mail', label: 'E-mail', Icon: Mail, color: '#f4d88f', url: `mailto:?subject=${enc('Rejoins-moi sur NatureDex')}&body=${enc(`${text}\n\n${link}`)}` },
    ];

    // The first share action pays the bonus (once per account, server-side).
    async function rewardShare() {
        if (!data || data.shared) return;
        try {
            const res = await api('shareReward');
            setUser(res.user);
            setData(res.invites);
            setMessage(`Merci pour le partage : +${res.coins} graines !`);
        } catch { /* already paid */ }
    }
    async function copy() {
        await navigator.clipboard?.writeText(link).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        rewardShare();
    }
    async function nativeShare() {
        try {
            await navigator.share({ title: 'NatureDex', text, url: link });
            rewardShare();
        } catch { /* cancelled */ }
    }
    async function claim() {
        setBusy(true);
        setMessage('');
        try {
            const res = await api('claimInvites');
            setUser(res.user);
            setData(res.invites);
            setMessage(`${res.paid} parrainage${res.paid > 1 ? 's' : ''} récompensé${res.paid > 1 ? 's' : ''} : +${n(res.coins)} graines et +${n(res.nuggets)} pépites !`);
        } catch (e) {
            setMessage(e.message);
        } finally {
            setBusy(false);
        }
    }

    const ready = data?.invitees.filter((i) => i.ready).length || 0;
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Parrainage</p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-medium text-white">Invite tes amis</h1>
            <p className="mt-3 text-ink-soft max-w-xl">Partage ton lien : plus vous êtes de naturalistes, plus il y a de cartes à échanger. Et tu gagnes des graines et des pépites gratuitement.</p>

            {data && (
                <div className="mt-6 grid sm:grid-cols-3 gap-3">
                    <Reward Icon={UserPlus} title="Pour toi, par ami">
                        <span className="flex flex-wrap gap-x-3"><Amount seeds={data.reward.coins} sign /><Amount nuggets={data.reward.nuggets} sign /></span>
                        <span className="block mt-1">dès qu'il a joué {data.days} jours différents</span>
                    </Reward>
                    <Reward Icon={Gift} title="Pour ton ami">
                        <span className="flex flex-wrap gap-x-3"><Amount seeds={data.inviteeBonus.coins} sign /><Amount nuggets={data.inviteeBonus.nuggets} sign /></span>
                        <span className="block mt-1">à l'inscription avec ton lien</span>
                    </Reward>
                    <Reward Icon={Share2} title="Premier partage">
                        <Amount seeds={data.shareCoins} sign />
                        <span className="block mt-1">{data.shared ? 'Bonus déjà reçu' : 'une seule fois, en partageant ton lien'}</span>
                    </Reward>
                </div>
            )}

            <section className="mt-6 rounded-3xl p-5 nd-glass">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Ton lien d'invitation</p>
                <div className="mt-2 flex gap-2">
                    <input readOnly value={link || '…'} onFocus={(e) => e.target.select()}
                        className="min-w-0 flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono" />
                    <button onClick={copy} disabled={!data} className="shrink-0 flex items-center gap-1.5 px-4 rounded-xl nd-btn font-semibold text-sm disabled:opacity-60">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copié' : 'Copier'}
                    </button>
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-wider text-ink-soft">Partager sur</p>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {canNativeShare && (
                        <button onClick={nativeShare} disabled={!data} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 hover:bg-white/10 text-xs font-semibold text-white">
                            <span className="grid place-items-center w-10 h-10 rounded-full bg-[#4fd18b] text-[#05130d]"><Share2 className="w-5 h-5" /></span>Partager…
                        </button>
                    )}
                    {networks.map(({ key, label, Icon, color, url }) => (
                        <a key={key} href={data ? url : undefined} target="_blank" rel="noreferrer" onClick={rewardShare}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 hover:bg-white/10 text-xs font-semibold text-white">
                            <span className="grid place-items-center w-10 h-10 rounded-full" style={{ background: color, color: key === 'x' || key === 'mail' ? '#0b0f0d' : 'white' }}><Icon className="w-5 h-5" /></span>{label}
                        </a>
                    ))}
                </div>
                <p className="mt-3 text-xs text-ink-soft">Instagram, TikTok, Snapchat : utilise « Partager… » sur ton téléphone, ou copie le lien dans ta bio ou ta story.</p>
            </section>

            {message && <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-sm font-semibold text-[#a8f0c6]">{message}</motion.p>}

            {data && (
                <section className="mt-8">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-white"><Users className="w-5 h-5 text-[#a8f0c6]" />Tes filleuls</h2>
                            <p className="mt-1 text-sm text-ink-soft">{data.rewarded} / {data.cap} parrainages récompensés</p>
                        </div>
                        {ready > 0 && (
                            <button onClick={claim} disabled={busy} className="nd-cta-gold px-5 py-2.5 rounded-full font-bold text-sm disabled:opacity-60">
                                Récupérer ({ready})
                            </button>
                        )}
                    </div>
                    {data.invitees.length === 0 ? (
                        <p className="mt-4 rounded-2xl p-5 bg-white/[0.03] text-center text-ink-soft">Personne ne s'est encore inscrit avec ton lien. Partage-le à tes amis !</p>
                    ) : (
                        <ul className="mt-4 space-y-1.5">
                            {data.invitees.map((i) => (
                                <li key={i.username} className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${i.ready ? 'bg-[#e9c46a]/10 ring-1 ring-[#e9c46a]/30' : 'bg-white/[0.03]'}`}>
                                    <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-[#8fb8a0] font-display font-semibold text-[#10261a]">{i.username.slice(0, 1).toUpperCase()}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-white">{i.username}</p>
                                        <p className="text-xs text-ink-soft">Inscrit le {new Date(i.created_at).toLocaleDateString('fr-FR')}</p>
                                    </div>
                                    <span className="text-right text-xs font-semibold">
                                        {i.rewarded ? <span className="flex items-center gap-1 text-[#a8f0c6]"><Check className="w-4 h-4" />Récompensé</span>
                                            : i.ready ? <span className="text-[#f4d88f]">Prêt à récupérer</span>
                                            : <span className="text-ink-soft">A joué {Math.min(i.days, data.days)}/{data.days} jours</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}
