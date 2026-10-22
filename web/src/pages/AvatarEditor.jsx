import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Leaf, Lock } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Nugget } from '../components/Currency.jsx';
import { AvatarFigure, BGS, HAIRS, HAIR_COLORS, SKINS, SLOT_NAMES, defaultAvatar, rememberAvatar } from '../components/PlayerAvatar.jsx';

function Section({ title, children }) {
    return (
        <section className="mt-6">
            <h2 className="uppercase tracking-[0.2em] text-xs font-bold text-white/55">{title}</h2>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Swatches({ colors, value, onPick }) {
    return (
        <div className="flex flex-wrap gap-2.5">
            {colors.map((c, i) => (
                <button key={c} onClick={() => onPick(i)} aria-label={`Couleur ${i + 1}`}
                    className={`w-10 h-10 rounded-full transition-transform ${value === i ? 'ring-2 ring-[#4fd18b] ring-offset-2 ring-offset-[#0d1f16] scale-110' : 'ring-1 ring-white/15'}`}
                    style={{ background: c }} />
            ))}
        </div>
    );
}

// Each choice drawn on the current character, so the player sees exactly what changes.
function Choices({ items, field, draft, setDraft }) {
    return (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
            {Object.entries(items).map(([key, label]) => (
                <button key={key} onClick={() => setDraft({ ...draft, [field]: key })}
                    className={`flex flex-col items-center gap-1 rounded-2xl p-2 transition-colors ${draft[field] === key ? 'bg-[#4fd18b]/15 ring-1 ring-[#4fd18b]/50' : 'bg-white/5 hover:bg-white/10'}`}>
                    <AvatarFigure avatar={{ ...draft, [field]: key }} size={52} />
                    <span className="text-[11px] text-white/75 text-center leading-tight">{label}</span>
                </button>
            ))}
        </div>
    );
}

// The preview leans toward the finger or the mouse, like a medallion in 3D.
function Tilt({ children }) {
    const [t, setT] = useState({ x: 0, y: 0 });
    const move = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setT({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
    };
    return (
        <div className="[perspective:600px] touch-none" onPointerMove={move} onPointerLeave={() => setT({ x: 0, y: 0 })}>
            <div className="transition-transform duration-200 ease-out rounded-full"
                style={{ transform: `rotateY(${t.x * 18}deg) rotateX(${-t.y * 18}deg)`, filter: `drop-shadow(${-t.x * 8}px ${12 - t.y * 6}px 14px rgba(0,0,0,.45))` }}>
                {children}
            </div>
        </div>
    );
}

// T-shirts come in themes (plants, animals, mushrooms…); other slots are a single list.
const groupByTheme = (items) => {
    const groups = new Map();
    for (const it of items) groups.set(it.theme || null, [...(groups.get(it.theme || null) || []), it]);
    return [...groups];
};

export default function AvatarEditor() {
    const { user, setUser } = useGame();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('shirt');

    useEffect(() => {
        api('avatarGet').then((r) => { setData(r); setDraft({ ...defaultAvatar(user.username), ...r.avatar }); }).catch((e) => setError(e.message));
    }, [user.username]);

    if (!draft) return <div className="py-32 text-center text-ink-soft">{error || 'Chargement…'}</div>;

    // Everything worn but not owned yet: bought together, or a Pass item that blocks saving.
    const missing = Object.keys(SLOT_NAMES).map((slot) => ({ slot, ...data.items[slot].find((i) => i.id === draft[slot]) })).filter((i) => i.id && !i.owned);
    const passMissing = missing.find((i) => i.pass);
    const toBuy = missing.filter((i) => !i.pass);
    const total = toBuy.reduce((n, i) => n + i.price, 0);
    const locked = missing.length > 0;

    const run = async (fn) => {
        setBusy(true);
        setError('');
        try {
            await fn();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };
    const buy = () => run(async () => {
        const r = await api('avatarBuy', { items: toBuy.map(({ slot, id }) => ({ slot, id })) });
        setData(r);
        setUser(r.user);
    });
    const save = () => run(async () => {
        const r = await api('avatarSave', { avatar: draft });
        setUser(r.user);
        rememberAvatar(user.username, r.avatar);
        navigate('/profil');
    });

    return (
        <div className="max-w-3xl mx-auto px-5 py-8 pb-40">
            <Link to="/profil" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"><ArrowLeft className="w-4 h-4" />Profil</Link>
            <h1 className="mt-3 font-display text-4xl text-white">Mon avatar</h1>

            <div className="mt-6 flex justify-center"><Tilt><AvatarFigure avatar={draft} size={300} full animate className="drop-shadow-2xl" /></Tilt></div>

            <div className="mt-6 flex flex-wrap gap-2">
                {Object.entries(SLOT_NAMES).map(([slot, label]) => (
                    <button key={slot} onClick={() => setTab(slot)}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === slot ? 'bg-[#4fd18b] text-[#05130d]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                        {label} <span className="opacity-60">{data.items[slot].filter((i) => i.owned && i.id !== 'aucun').length}/{data.items[slot].filter((i) => i.id !== 'aucun').length}</span>
                    </button>
                ))}
            </div>
            {groupByTheme(data.items[tab]).map(([theme, items]) => (
            <div key={theme || tab}>
            {theme && <h3 className="mt-5 mb-2 text-xs uppercase tracking-[0.2em] font-bold text-white/50">{theme}</h3>}
            <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                {items.map((s) => (
                    <button key={s.id} onClick={() => setDraft({ ...draft, [tab]: s.id })}
                        className={`relative flex flex-col items-center gap-1 rounded-2xl p-2 transition-colors ${draft[tab] === s.id ? 'bg-[#4fd18b]/15 ring-1 ring-[#4fd18b]/50' : 'bg-white/5 hover:bg-white/10'}`}>
                        <AvatarFigure avatar={{ ...draft, ...(tab === 'shirt' && { neck: 'aucun', pet: 'aucun' }), [tab]: s.id }} size={64} className={s.owned ? '' : 'opacity-80'} />
                        <span className="text-xs text-white/85 text-center leading-tight">{s.name}</span>
                        <span className="text-[11px] font-semibold">
                            {s.owned ? <span className="text-[#a8f0c6]">{s.price ? 'Acheté' : s.pass ? 'Pass actif' : 'Gratuit'}</span>
                                : s.pass ? <span className="inline-flex items-center gap-1 text-[#f4d88f]"><Leaf className="w-3 h-3" />Pass</span>
                                    : <span className="inline-flex items-center gap-1 text-[#f4c25b]"><Nugget className="w-3 h-3" />{s.price}</span>}
                        </span>
                        {!s.owned && <Lock className="absolute top-2 right-2 w-3.5 h-3.5 text-white/60" />}
                    </button>
                ))}
            </div>
            </div>
            ))}

            <Section title="Coiffure"><Choices items={HAIRS} field="hair" draft={draft} setDraft={setDraft} /></Section>
            <Section title="Couleur des cheveux"><Swatches colors={HAIR_COLORS} value={draft.hairColor} onPick={(i) => setDraft({ ...draft, hairColor: i })} /></Section>
            <Section title="Peau"><Swatches colors={SKINS} value={draft.skin} onPick={(i) => setDraft({ ...draft, skin: i })} /></Section>
            <Section title="Fond"><Swatches colors={BGS} value={draft.bg} onPick={(i) => setDraft({ ...draft, bg: i })} /></Section>

            <div className="fixed inset-x-0 bottom-24 sm:bottom-6 z-30 px-5">
                <div className="max-w-3xl mx-auto rounded-3xl nd-glass p-3 flex items-center gap-3 shadow-xl shadow-black/40">
                    {error && <p className="flex-1 text-sm text-[#ff8f8f]">{error}</p>}
                    {!error && passMissing && <p className="flex-1 text-sm text-white/75">{passMissing.name} est réservé aux abonnés du Pass Naturaliste.</p>}
                    {!error && !passMissing && locked && (
                        <p className="flex-1 text-sm text-white/75">
                            {toBuy.map((i) => i.name).join(', ')} : <b className="text-[#f4c25b]">{total} pépites</b> (tu en as {user.nuggets.toLocaleString('fr-FR')}).
                        </p>
                    )}
                    {!error && !locked && <p className="flex-1 text-sm text-white/60">Ton avatar s'affiche sur ton profil, dans les classements et auprès de tes amis.</p>}
                    {passMissing && <Link to="/boutique" className="shrink-0 px-5 py-3 rounded-full font-semibold bg-[#e9c46a] text-[#2a1d05]">Voir le Pass</Link>}
                    {!passMissing && locked && user.nuggets < total && <Link to="/boutique" className="shrink-0 px-5 py-3 rounded-full font-semibold bg-[#f4c25b] text-[#2a1d05]">Des pépites</Link>}
                    {!passMissing && locked && user.nuggets >= total && (
                        <button disabled={busy} onClick={buy} className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 rounded-full font-semibold bg-[#f4c25b] text-[#2a1d05] disabled:opacity-60">
                            Acheter · <Nugget className="w-4 h-4" />{total}
                        </button>
                    )}
                    {!locked && (
                        <button disabled={busy} onClick={save} className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 rounded-full font-semibold bg-[#4fd18b] text-[#05130d] disabled:opacity-60">
                            <Check className="w-4 h-4" />Enregistrer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
