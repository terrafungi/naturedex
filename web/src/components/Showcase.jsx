import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { api } from '../api.jsx';
import { drawShowcase, loadCardImage, loadFonts } from '../showcase.js';

// The showcase picture, drawn at full export size and scaled down by CSS.
// Draws at once (cards without photos), then again as fonts and photos arrive.
const ShowcaseCanvas = forwardRef(function ShowcaseCanvas({ showcase, username, className = '' }, ref) {
    const canvas = useRef(null);
    const loaded = useRef(new Map()); // photos kept across redraws, so editing does not flicker
    useImperativeHandle(ref, () => canvas.current);

    useEffect(() => {
        let live = true;
        const images = loaded.current;
        const draw = () => live && canvas.current && drawShowcase(canvas.current, { ...showcase, username }, images);
        draw();
        loadFonts().then(draw);
        let timer = 0;
        for (const c of showcase.cards) {
            if (images.has(c.id)) continue;
            loadCardImage(c.thumb_url).then((img) => {
                if (!live || !img) return;
                images.set(c.id, img);
                clearTimeout(timer);
                timer = setTimeout(draw, 30);
            });
        }
        return () => { live = false; clearTimeout(timer); };
    }, [showcase, username]);

    return <canvas ref={canvas} className={`block w-full h-auto ${className}`} />;
});
export default ShowcaseCanvas;

// Waits until every photo is in, so the exported file is complete.
export async function exportShowcase(showcase, username) {
    await loadFonts();
    const images = new Map();
    await Promise.all(showcase.cards.map(async (c) => {
        const img = await loadCardImage(c.thumb_url);
        if (img) images.set(c.id, img);
    }));
    const canvas = document.createElement('canvas');
    drawShowcase(canvas, { ...showcase, username }, images);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à créer'))), 'image/jpeg', 0.92));
}

// Share sheet on phones (Instagram, WhatsApp…), plain download elsewhere.
export async function shareShowcase(showcase, username) {
    const blob = await exportShowcase(showcase, username);
    const name = `naturedex-vitrine-${(showcase.title || 'ma-vitrine').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'vitrine'}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: showcase.title || 'Ma vitrine NatureDex' });
            return 'shared';
        } catch (e) {
            if (e.name === 'AbortError') return 'cancelled';
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
}

// Small picture of a showcase for galleries: drawn once it scrolls into view, then kept as a
// light JPEG, so a page of full-size canvases never sits in memory. Drawing is queued one at a time.
let drawQueue = Promise.resolve();
let bigCanvas = null;
export function ShowcaseThumb({ showcase, username, width = 480, className = '' }) {
    const box = useRef(null);
    const [src, setSrc] = useState(null);

    useEffect(() => {
        let live = true;
        let url = null;
        const io = new IntersectionObserver(async ([entry]) => {
            if (!entry.isIntersecting) return;
            io.disconnect();
            const images = new Map();
            await Promise.all([loadFonts(), ...showcase.cards.map(async (c) => {
                const img = await loadCardImage(c.thumb_url);
                if (img) images.set(c.id, img);
            })]);
            drawQueue = drawQueue.then(async () => {
                if (!live) return;
                bigCanvas ||= document.createElement('canvas');
                drawShowcase(bigCanvas, { ...showcase, username }, images);
                const small = document.createElement('canvas');
                small.width = width;
                small.height = Math.round((width * bigCanvas.height) / bigCanvas.width);
                small.getContext('2d').drawImage(bigCanvas, 0, 0, small.width, small.height);
                const blob = await new Promise((resolve) => small.toBlob(resolve, 'image/jpeg', 0.85));
                if (!live || !blob) return;
                url = URL.createObjectURL(blob);
                setSrc(url);
            }).catch(() => {});
        }, { rootMargin: '400px' });
        io.observe(box.current);
        return () => { live = false; io.disconnect(); if (url) URL.revokeObjectURL(url); };
    }, [showcase, username, width]);

    return (
        <div ref={box} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: showcase.format === 'carre' ? '1 / 1' : '9 / 16' }}>
            {src
                ? <img src={src} alt={showcase.title || `Vitrine de ${username}`} className="absolute inset-0 w-full h-full object-cover" />
                : <div className="absolute inset-0 animate-pulse bg-white/[0.06]" />}
        </div>
    );
}

// ♥ vote for someone's showcase: the count changes at once and rolls back if the server refuses.
// `votes` is whatever count the page shows (this week or all time); a vote moves it by one.
export function VoteButton({ username, votes, voted, mine, onError, className = '' }) {
    const [state, setState] = useState({ votes, voted });
    const [busy, setBusy] = useState(false);
    useEffect(() => { setState({ votes, voted }); }, [votes, voted]);

    async function toggle() {
        if (mine || busy) return;
        const prev = state;
        setState({ voted: !prev.voted, votes: prev.votes + (prev.voted ? -1 : 1) });
        setBusy(true);
        try {
            const r = await api(prev.voted ? 'unvoteShowcase' : 'voteShowcase', { username });
            setState({ voted: r.voted, votes: prev.votes + (r.voted ? 1 : 0) - (prev.voted ? 1 : 0) });
        } catch (e) {
            setState(prev);
            onError?.(e.message);
        } finally { setBusy(false); }
    }

    const label = mine ? 'Ta vitrine' : state.voted ? 'Retirer mon vote' : 'Voter pour cette vitrine';
    return (
        <button type="button" onClick={toggle} disabled={mine} aria-pressed={state.voted} aria-label={label} title={label}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold tabular-nums transition ${state.voted ? 'bg-[#ff6b8a]/15 text-[#ff9fb3] ring-1 ring-[#ff6b8a]/40' : 'bg-white/[0.06] text-white/80 hover:bg-white/10'} ${mine ? 'opacity-60 cursor-default' : ''} ${className}`}>
            <Heart className={`w-4 h-4 ${state.voted ? 'fill-current' : ''}`} />
            {state.votes.toLocaleString('fr-FR')}
        </button>
    );
}
