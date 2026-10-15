import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '../index.css';
import './promo.css';
import Promo from './Promo.jsx';
import { DURATION } from './timeline.js';

// ?render → the renderer drives the time with window.__seek(t); otherwise the video plays in a loop.
const rendering = new URLSearchParams(location.search).has('render');
let setTime;

function App() {
    const [t, setT] = useState(Number(new URLSearchParams(location.search).get('t')) || 0);
    setTime = setT;
    useEffect(() => {
        if (rendering) return;
        let raf, t0 = performance.now() - t * 1000;
        const loop = (now) => { setT(((now - t0) / 1000) % DURATION); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    return <Promo t={t} />;
}

createRoot(document.getElementById('root')).render(<App />);

// CSS animations of the game components (holo frame, shine…) are pinned to the video time too.
function syncAnimations(t) {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
}

window.__seek = async (t) => {
    flushSync(() => setTime(t));
    syncAnimations(t);
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    const pending = [...document.images].filter((img) => !img.complete);
    if (pending.length) {
        await Promise.race([
            Promise.all(pending.map((img) => new Promise((r) => { img.onload = img.onerror = r; }))),
            new Promise((r) => setTimeout(r, 8000)),
        ]);
    }
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
window.__duration = DURATION;
