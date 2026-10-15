import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, EyeOff, LayoutGrid, Save, Share2, Square, Star, Smartphone, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import ShowcaseCanvas, { shareShowcase } from '../components/Showcase.jsx';
import { BACKGROUNDS, FORMATS, LAYOUTS, SHOWCASE_MAX } from '../showcase.js';
import { RARITIES } from '../game.jsx';

const DEFAULTS = { title: '', background: 'foret', layout: 'grille', format: 'story', cards: [] };
// phones open their share sheet (Instagram, WhatsApp…); computers download the file
const canShareFiles = (() => {
    try { return !!navigator.canShare?.({ files: [new File([''], 'vitrine.jpg', { type: 'image/jpeg' })] }); } catch { return false; }
})();

function Swatch({ id, active, onClick }) {
    const ref = useRef(null);
    useEffect(() => {
        const ctx = ref.current.getContext('2d');
        ctx.save();
        ctx.scale(0.125, 0.125);
        BACKGROUNDS[id].paint(ctx, 1080, 1920, (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })());
        ctx.restore();
    }, [id]);
    return (
        <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0" aria-pressed={active}>
            <canvas ref={ref} width={135} height={240}
                className={`w-14 h-[6.2rem] rounded-xl transition ${active ? 'ring-[3px] ring-[#e9c46a] scale-105' : 'ring-1 ring-white/15 opacity-80 hover:opacity-100'}`} />
            <span className={`text-[11px] font-semibold ${active ? 'text-[#f4d88f]' : 'text-white/60'}`}>{BACKGROUNDS[id].label}</span>
        </button>
    );
}

function Segmented({ value, options, onChange }) {
    return (
        <div className="inline-flex p-1 rounded-full bg-white/[0.06] ring-1 ring-white/10">
            {options.map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => onChange(key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${value === key ? 'bg-[#e9c46a] text-[#2a1c00]' : 'text-white/70 hover:text-white'}`}>
                    {Icon && <Icon className="w-4 h-4" />}{label}
                </button>
            ))}
        </div>
    );
}

function Section({ title, aside, children }) {
    return (
        <section className="pt-5 border-t border-white/10 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}

export default function ShowcaseEditor() {
    const { user, favs } = useGame();
    const [params] = useSearchParams();
    const fromParam = params.get('classeur');
    const [source, setSource] = useState(fromParam === 'all' || !fromParam ? 'all' : Number(fromParam));
    const [pool, setPool] = useState(null);
    const [draft, setDraft] = useState(null);
    const [saved, setSaved] = useState(undefined); // undefined = loading, null = none
    const [busy, setBusy] = useState('');
    const [note, setNote] = useState('');

    const binderName = (id) => (id === 'all' ? 'Mes favoris' : favs.binders.find((b) => b.id === id)?.name || 'Ma vitrine');

    useEffect(() => {
        api('showcase').then((r) => setSaved(r.showcase)).catch(() => setSaved(null));
    }, []);

    useEffect(() => {
        let live = true;
        setPool(null);
        api('browse', { binder: source, onlyOwned: true, offset: 0, limit: 120 })
            .then((r) => live && setPool(r.cards))
            .catch(() => live && setPool([]));
        return () => { live = false; };
    }, [source]);

    // First draft: the saved showcase, or the first 10 cards of the chosen binder.
    useEffect(() => {
        if (draft || saved === undefined || !pool) return;
        if (saved && !fromParam) setDraft(saved);
        else setDraft({ ...DEFAULTS, ...(saved ? { background: saved.background, layout: saved.layout, format: saved.format } : {}), title: binderName(source), cards: pool.slice(0, SHOWCASE_MAX) });
    }, [draft, saved, pool]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setNote(''); };
    const chosen = useMemo(() => new Set(draft?.cards.map((c) => c.id)), [draft]);

    function toggle(card) {
        if (chosen.has(card.id)) return set({ cards: draft.cards.filter((c) => c.id !== card.id) });
        if (draft.cards.length >= SHOWCASE_MAX) return setNote(`${SHOWCASE_MAX} cartes maximum : retire une carte d'abord.`);
        set({ cards: [...draft.cards, card] });
    }
    function move(i, by) {
        const cards = [...draft.cards];
        [cards[i], cards[i + by]] = [cards[i + by], cards[i]];
        set({ cards });
    }

    async function save() {
        setBusy('save');
        try {
            const r = await api('saveShowcase', { ...draft, cardIds: draft.cards.map((c) => c.id) });
            setSaved(r.showcase);
            setNote('Vitrine enregistrée : elle s\'affiche sur ton profil.');
        } catch (e) { setNote(e.message); } finally { setBusy(''); }
    }
    async function unpublish() {
        if (!window.confirm('Retirer la vitrine de ton profil ?')) return;
        setBusy('delete');
        try {
            await api('deleteShowcase');
            setSaved(null);
            setNote('Vitrine retirée de ton profil.');
        } catch (e) { setNote(e.message); } finally { setBusy(''); }
    }
    async function share() {
        setBusy('share');
        try {
            const how = await shareShowcase(draft, user.username);
            if (how === 'downloaded') setNote('Image téléchargée !');
        } catch (e) { setNote(e.message || 'Image impossible à créer'); } finally { setBusy(''); }
    }

    if (!draft) return <div className="py-32 text-center font-display text-xl text-ink-soft">Chargement…</div>;

    const story = draft.format === 'story';
    const empty = !draft.cards.length;
    const unchanged = saved && JSON.stringify({ ...saved, cards: saved.cards.map((c) => c.id), updatedAt: 0 })
        === JSON.stringify({ ...saved, ...draft, cards: draft.cards.map((c) => c.id), updatedAt: 0 });

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <Link to="/collection" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"><ArrowLeft className="w-4 h-4" />Collection</Link>
            <p className="mt-4 uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Vitrine</p>
            <h1 className="font-display text-4xl font-semibold text-white mt-1">Compose ta plus belle image</h1>
            <p className="mt-2 text-sm text-ink-soft max-w-xl">Choisis jusqu'à {SHOWCASE_MAX} cartes, un fond et une disposition. Enregistre-la sur ton profil ou partage l'image.</p>

            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-8 items-start">
                <div className="min-w-0 lg:sticky lg:top-24">
                    <div className="mx-auto rounded-[1.4rem] overflow-hidden ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] bg-black/30"
                        style={{ maxWidth: story ? 'min(100%, calc(62vh * 9 / 16))' : 'min(100%, 62vh)' }}>
                        {empty
                            ? <div className="grid place-items-center text-center text-white/60 text-sm p-8" style={{ aspectRatio: story ? '9 / 16' : '1' }}>Ajoute des cartes en dessous pour composer ta vitrine.</div>
                            : <ShowcaseCanvas showcase={draft} username={user.username} />}
                    </div>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button onClick={share} disabled={empty || !!busy}
                            className="nd-cta-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold disabled:opacity-50">
                            {canShareFiles ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                            {busy === 'share' ? 'Préparation…' : canShareFiles ? 'Partager l\'image' : 'Télécharger l\'image'}
                        </button>
                        <button onClick={save} disabled={empty || !!busy || unchanged}
                            className="nd-cta-glass inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-white disabled:opacity-50">
                            {unchanged ? <Check className="w-4 h-4 text-[#a8f0c6]" /> : <Save className="w-4 h-4 text-[#a8f0c6]" />}
                            {busy === 'save' ? 'Enregistrement…' : unchanged ? 'Sur ton profil' : saved ? 'Mettre à jour mon profil' : 'Afficher sur mon profil'}
                        </button>
                    </div>
                    {note && <p className="mt-3 text-center text-sm font-semibold text-[#a8f0c6]" role="status">{note}</p>}
                    {saved && (
                        <p className="mt-3 text-center text-xs text-white/50">
                            <Link to={`/joueur/${encodeURIComponent(user.username)}`} className="underline hover:text-white">Voir mon profil</Link>
                            {' · '}
                            <button onClick={unpublish} disabled={!!busy} className="inline-flex items-center gap-1 underline hover:text-white"><EyeOff className="w-3 h-3" />Retirer du profil</button>
                        </p>
                    )}
                </div>

                <div className="rounded-[1.6rem] nd-glass p-5 sm:p-6 space-y-5">
                    <Section title="Format">
                        <Segmented value={draft.format} onChange={(format) => set({ format })}
                            options={[['story', 'Story 9:16', Smartphone], ['carre', 'Carré', Square]]} />
                    </Section>
                    <Section title="Fond">
                        <div className="-mx-1 px-1 pb-1 flex gap-3 overflow-x-auto">
                            {Object.keys(BACKGROUNDS).map((id) => <Swatch key={id} id={id} active={draft.background === id} onClick={() => set({ background: id })} />)}
                        </div>
                    </Section>
                    <Section title="Disposition">
                        <Segmented value={draft.layout} onChange={(layout) => set({ layout })}
                            options={Object.entries(LAYOUTS).map(([k, label]) => [k, label, k === 'grille' ? LayoutGrid : null])} />
                        {draft.layout === 'vedette' && <p className="mt-2 text-xs text-white/50">La première carte est mise en avant.</p>}
                    </Section>
                    <Section title="Titre">
                        <input value={draft.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} placeholder="Ma vitrine"
                            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#e9c46a]" />
                    </Section>
                    <Section title="Cartes exposées" aside={<span className="text-xs font-bold tabular-nums text-[#f4d88f]">{draft.cards.length}/{SHOWCASE_MAX}</span>}>
                        {empty ? <p className="text-sm text-white/50">Touche une carte de tes favoris pour l'ajouter.</p> : (
                            <ol className="-mx-1 px-1 pb-1 flex gap-2.5 overflow-x-auto">
                                {draft.cards.map((c, i) => (
                                    <li key={c.id} className="shrink-0 w-[4.6rem]">
                                        <div className="relative">
                                            <img src={c.thumb_url} alt={c.name} draggable="false" className="w-[4.6rem] h-[6.4rem] object-cover rounded-lg ring-2"
                                                style={{ '--tw-ring-color': RARITIES[c.rarity]?.color }} />
                                            <span className="absolute top-1 left-1 grid place-items-center w-5 h-5 rounded-full bg-black/70 text-[10px] font-bold text-white">{i + 1}</span>
                                            <button onClick={() => toggle(c)} aria-label={`Retirer ${c.name}`}
                                                className="absolute -top-1.5 -right-1.5 grid place-items-center w-6 h-6 rounded-full bg-[#e76f51] text-white shadow"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                        <div className="mt-1 flex justify-between">
                                            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Avancer"
                                                className="grid place-items-center w-7 h-7 rounded-full bg-white/[0.07] text-white disabled:opacity-25"><ChevronLeft className="w-4 h-4" /></button>
                                            <button onClick={() => move(i, 1)} disabled={i === draft.cards.length - 1} aria-label="Reculer"
                                                className="grid place-items-center w-7 h-7 rounded-full bg-white/[0.07] text-white disabled:opacity-25"><ChevronRight className="w-4 h-4" /></button>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Section>
                    <Section title="Choisir dans">
                        <div className="flex flex-wrap gap-2">
                            {[['all', `Tous les favoris`], ...favs.binders.filter((b) => b.count).map((b) => [b.id, b.name])].map(([id, name]) => (
                                <button key={id} onClick={() => setSource(id)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${source === id ? 'bg-[#c9a227] border-transparent text-paper' : 'border-white/10 text-ink hover:bg-white/10'}`}>
                                    {id === 'all' && <Star className="w-3.5 h-3.5 fill-current" />}{name}
                                </button>
                            ))}
                        </div>
                        {!pool && <p className="mt-4 text-sm text-white/50">Chargement…</p>}
                        {pool?.length === 0 && <p className="mt-4 text-sm text-white/50">Aucune carte ici. Touche l'étoile <Star className="inline w-4 h-4 -mt-1" /> d'une carte dans ta collection pour l'ajouter à tes favoris.</p>}
                        {pool?.length > 0 && (
                            <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                                {pool.map((c) => {
                                    const on = chosen.has(c.id);
                                    return (
                                        <button key={c.id} onClick={() => toggle(c)} title={c.name} aria-pressed={on}
                                            className={`relative rounded-lg overflow-hidden transition ${on ? 'ring-[3px] ring-[#e9c46a]' : 'ring-1 ring-white/10 opacity-75 hover:opacity-100'}`}>
                                            <img src={c.thumb_url} alt={c.name} loading="lazy" draggable="false" className="w-full aspect-[5/7] object-cover" />
                                            <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-gradient-to-t from-black/85 to-transparent text-[10px] leading-tight font-semibold text-white truncate">{c.name}</span>
                                            {on && <span className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-full bg-[#e9c46a] text-[#2a1c00]"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </div>
    );
}
