import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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
