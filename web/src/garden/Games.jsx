/**
 * The garden arcade: four short games played full screen. The score goes to the server
 * (gameReward), which clamps it and pays honey, XP and compost within the daily caps.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Play, RotateCcw, Trophy, X } from 'lucide-react';
import { sfx } from '../sfx.js';
import { Compost, Honey, PlantArt, SEED_ORDER } from './art.jsx';
import MatchGame, { MATCH_MOVES, MatchStars } from './Match3.jsx';

const INTRO = {
    bee: { emoji: '🐝', title: "Vol de l'abeille", rules: ['Touche l\'écran (ou Espace) pour battre des ailes, l\'abeille retombe sinon.', 'Passe entre les fleurs et les lianes : +2 à chaque passage.', 'Pollen = 1 point, pollen doré = 5 points. Une collision et la partie s\'arrête !'], bg: 'from-[#5fb7e8] to-[#bff0c8]' },
    pests: { emoji: '🐌', title: 'Chasse aux nuisibles', rules: ['Touche les nuisibles qui sortent de terre.', 'Enchaîne sans rater pour un bonus de série.', 'Ne touche pas les coccinelles 🐞 : elles protègent ton jardin (−3).'], bg: 'from-[#4a2c17] to-[#2b6b3a]' },
    memory: { emoji: '🃏', title: 'Mémoire des graines', rules: ['Retourne les cartes deux par deux.', 'Retrouve les 8 paires de plantes.', 'Moins de coups et plus de vitesse = plus de points.'], bg: 'from-[#2a1b4a] to-[#0f3a2a]' },
    match: { emoji: '🌸', title: 'Cascade des fleurs', rules: ['Échange deux voisins pour aligner 3 éléments identiques ou plus.', '4 alignés = graine rayée, en L ou en T = bombe de pollen, 5 alignés = graine arc-en-ciel.', `${MATCH_MOVES} coups : enchaîne les cascades pour multiplier tes points.`], bg: 'from-[#3a1f5c] via-[#1d4a3a] to-[#0d2a1c]' },
};

export default function GameOverlay({ game, best, max, onFinish, onClose }) {
    const [phase, setPhase] = useState('intro'); // intro | play | done
    const [round, setRound] = useState(0);
    const [result, setResult] = useState(null);
    const info = INTRO[game];

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && phase !== 'play' && onClose();
        addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [phase, onClose]);

    async function end(score) {
        setPhase('done');
        setResult({ score, pending: true });
        const res = await onFinish(score);
        if (res?.record) sfx.record(); else sfx.win();
        setResult({ score, pending: false, ...res });
    }
    const Game = { bee: BeeGame, pests: PestGame, memory: MemoryGame, match: MatchGame }[game];

    return createPortal(
        <motion.div className={`fixed inset-0 z-[120] bg-gradient-to-b ${info.bg} select-none`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {phase === 'play' && <Game key={round} max={max} onEnd={end} />}
            {phase !== 'play' && (
                <button type="button" onClick={onClose} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 grid place-items-center w-10 h-10 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-5 h-5" /></button>
            )}
            <AnimatePresence>
                {phase === 'intro' && (
                    <motion.div key="intro" className="absolute inset-0 grid place-items-center p-6" exit={{ opacity: 0, scale: 0.95 }}>
                        <motion.div className="w-full max-w-sm rounded-[2rem] bg-[#081a11]/85 backdrop-blur ring-1 ring-white/15 p-6 text-center" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                            <motion.p className="text-7xl" animate={{ y: [0, -8, 0], rotate: [0, -6, 6, 0] }} transition={{ duration: 2, repeat: Infinity }}>{info.emoji}</motion.p>
                            <h2 className="mt-2 font-display text-3xl font-bold text-white">{info.title}</h2>
                            <ul className="mt-4 space-y-1.5 text-left text-sm text-white/80">{info.rules.map((r) => <li key={r} className="flex gap-2"><span className="text-[#8ee6a8]">•</span>{r}</li>)}</ul>
                            <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#e9c46a]"><Trophy className="w-4 h-4" />Record : {best || 0} / {max}</p>
                            <button type="button" onClick={() => { sfx.tap(); setPhase('play'); }} className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-full nd-btn font-bold text-lg"><Play className="w-5 h-5" />C'est parti</button>
                        </motion.div>
                    </motion.div>
                )}
                {phase === 'done' && result && (
                    <motion.div key="done" className="absolute inset-0 grid place-items-center p-6 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <motion.div className="w-full max-w-sm rounded-[2rem] bg-[#081a11]/90 backdrop-blur ring-1 ring-white/15 p-6 text-center" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}>
                            <p className="uppercase tracking-[0.25em] text-xs font-bold text-white/60">Score</p>
                            <motion.p className="font-display text-7xl font-black text-white tabular-nums" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>{Math.min(max, result.score)}</motion.p>
                            {game === 'match' && <div className="mb-1"><MatchStars score={result.score} className="w-8 h-8" /></div>}
                            {result.record && <p className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e9c46a] text-[#3b2a05] text-sm font-black"><Trophy className="w-4 h-4" />Nouveau record !</p>}
                            {result.pending ? <p className="mt-4 text-white/60">Calcul des gains…</p> : result.error ? <p className="mt-4 text-[#ffb4a2] text-sm font-semibold">{result.error}</p> : (
                                <>
                                    <div className="mt-4 flex justify-center gap-2 flex-wrap">
                                        <Gain icon={<Honey className="w-5 h-5" />} n={result.reward.honey} />
                                        <Gain icon={<span className="text-xs font-black text-[#a8f0c6]">XP</span>} n={result.reward.xp} />
                                        {result.reward.compost > 0 && <Gain icon={<Compost className="w-5 h-5" />} n={result.reward.compost} />}
                                    </div>
                                    {result.tooSoon && <p className="mt-3 text-xs text-white/60">Partie trop rapprochée de la précédente : pas de gains cette fois, mais le record compte.</p>}
                                    {!result.tooSoon && result.capped && <p className="mt-3 text-xs text-white/60">Limite de gains du jour atteinte : les records comptent toujours.</p>}
                                </>
                            )}
                            <div className="mt-5 flex gap-2">
                                <button type="button" disabled={result.pending} onClick={() => { setResult(null); setRound((r) => r + 1); setPhase('play'); }} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full nd-btn font-bold disabled:opacity-50"><RotateCcw className="w-4 h-4" />Rejouer</button>
                                <button type="button" onClick={onClose} className="px-5 py-3 rounded-full bg-white/10 ring-1 ring-white/15 font-bold text-white">Jardin</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>,
        document.body
    );
}
const Gain = ({ icon, n }) => <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 font-display text-xl font-bold text-white tabular-nums">{icon}+{n}</span>;

function Hud({ score, time, extra }) {
    return (
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 z-10 flex items-center gap-2 pointer-events-none">
            <span className="px-4 py-2 rounded-full bg-black/40 backdrop-blur font-display text-2xl font-black text-white tabular-nums">{score}</span>
            {extra}
            {time != null && <span className={`ml-auto px-4 py-2 rounded-full backdrop-blur font-display text-2xl font-black tabular-nums ${time <= 5 ? 'bg-[#ff5a4b]/80 text-white' : 'bg-black/40 text-white'}`}>{Math.ceil(time)}s</span>}
        </div>
    );
}

// ---------------------------------------------------------------- bee flight (Flappy Bird style)

function BeeGame({ max, onEnd }) {
    const canvas = useRef(null);
    const [hud, setHud] = useState({ score: 0, started: false });
    useEffect(() => {
        const c = canvas.current, g = c.getContext('2d');
        const dpr = Math.min(2, devicePixelRatio || 1);
        let W = 0, H = 0, k = 1;
        const size = () => {
            W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
            k = Math.max(0.8, Math.min(1.35, H / 720)); // physics scale with the screen height
        };
        size();
        addEventListener('resize', size);
        const GROUND = 0.9; // ground line, share of the height
        const STEM_W = 54, SPACING = 250;
        const bee = { x: 0, y: H * 0.45, vy: 0, tilt: 0 };
        const stems = [], fx = [];
        const hills = Array.from({ length: 3 }, (_, i) => ({ off: Math.random() * 1000, speed: 10 + i * 18, color: ['#9fdc8f', '#6cc26a', '#47a457'][i], h: 0.16 + i * 0.05 }));
        const clouds = Array.from({ length: 5 }, () => ({ x: Math.random(), y: 0.08 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.7 }));
        let score = 0, passed = 0, started = false, dead = 0, last = performance.now(), raf = 0, done = false, dist = 0;
        const pop = (x, y, text, color) => fx.push({ x, y, text, color, life: 0.8 });
        const PETALS = ['#ff8fc0', '#ffd166', '#ffffff', '#b98cff', '#ff9f6b'];
        function addStem(x) {
            const gap = Math.max(H * 0.24, Math.min(H * 0.34, 230 * k) - passed * 2.5 * k);
            const top = 70 + Math.random() * (H * GROUND - 70 - gap - 40);
            stems.push({ x, top, gap, petal: PETALS[Math.floor(Math.random() * PETALS.length)], pollen: (stems.length + passed) % 6 === 5 ? 'gold' : 'pollen', scored: false, taken: false });
        }
        const flap = () => {
            if (dead || done) return;
            if (!started) { started = true; setHud((h) => ({ ...h, started: true })); }
            bee.vy = -430 * k;
            sfx.tap();
        };
        const down = (e) => { e.preventDefault(); flap(); };
        const key = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
        c.addEventListener('pointerdown', down);
        addEventListener('keydown', key);
        const crash = () => {
            if (dead) return;
            dead = 0.9;
            bee.vy = Math.min(bee.vy, -200 * k);
            sfx.wrong();
        };
        function frame(t) {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.033, (t - last) / 1000);
            last = t;
            bee.x = Math.min(W * 0.3, 140);
            const ground = H * GROUND;
            const speed = (170 + Math.min(90, passed * 3)) * k;
            if (!started) {
                bee.y = H * 0.45 + Math.sin(t / 260) * 10;
                bee.tilt = 0;
            } else {
                bee.vy += 1350 * k * dt;
                bee.y += bee.vy * dt;
                bee.tilt += (Math.max(-0.5, Math.min(1.2, bee.vy / 600)) - bee.tilt) * Math.min(1, dt * 10);
                if (bee.y < 18) { bee.y = 18; bee.vy = Math.max(0, bee.vy); }
                if (bee.y > ground - 14) { bee.y = ground - 14; bee.vy = 0; crash(); }
            }
            if (dead) {
                dead -= dt;
                if (dead <= 0 && !done) { done = true; cancelAnimationFrame(raf); onEnd(Math.min(max, score)); return; }
            }
            const moving = started && !dead;
            if (moving) {
                dist += speed * dt;
                const lastX = stems.at(-1)?.x ?? W;
                if (!stems.length) addStem(W + 80); else if (lastX < W + 20 - SPACING * k + STEM_W) addStem(lastX + SPACING * k);
            }
            for (let i = stems.length - 1; i >= 0; i--) {
                const s = stems[i];
                if (moving) s.x -= speed * dt;
                if (s.x < -STEM_W - 20) { stems.splice(i, 1); continue; }
                if (dead) continue;
                // collision: the bee (a circle) against the vine and the flower stem
                const r = 15;
                const hits = (y0, y1) => Math.hypot(bee.x - Math.max(s.x, Math.min(bee.x, s.x + STEM_W)), bee.y - Math.max(y0, Math.min(bee.y, y1))) < r;
                if (hits(-1e4, s.top) || hits(s.top + s.gap, ground)) crash();
                // pollen floating in the middle of the gap
                const px = s.x + STEM_W / 2, py = s.top + s.gap / 2;
                if (!s.taken && Math.hypot(px - bee.x, py - bee.y) < 30) {
                    s.taken = true;
                    const n = s.pollen === 'gold' ? 5 : 1;
                    score += n;
                    pop(px, py - 10, `+${n}`, s.pollen === 'gold' ? '#ffd76a' : '#fff');
                    s.pollen === 'gold' ? sfx.correct() : sfx.combo(Math.min(8, passed % 9));
                }
                if (!s.scored && s.x + STEM_W < bee.x - r) {
                    s.scored = true;
                    passed++;
                    score += 2;
                    pop(bee.x, bee.y - 30, '+2', '#a8f0c6');
                }
            }
            // draw: sky, sun, clouds, hills
            const sky = g.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0, '#5fb7e8'); sky.addColorStop(1, '#d9f6ff');
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            g.fillStyle = 'rgba(255,240,180,0.9)'; g.beginPath(); g.arc(W * 0.85, 110, 38, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.85)';
            clouds.forEach((cl) => {
                if (moving) { cl.x -= dt * 0.02 * cl.s; if (cl.x < -0.2) cl.x += 1.4; }
                const x = cl.x * W, y = cl.y * H, s = 22 * cl.s;
                g.beginPath(); g.arc(x, y, s, 0, 7); g.arc(x + s, y - s * 0.4, s * 1.1, 0, 7); g.arc(x + s * 2.1, y, s * 0.9, 0, 7); g.fill();
            });
            hills.forEach((h) => {
                if (moving) h.off += h.speed * dt;
                g.fillStyle = h.color; g.beginPath(); g.moveTo(0, H);
                for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, H * (1 - h.h) + Math.sin((x + h.off) / 90) * 18 + Math.sin((x + h.off) / 37) * 6);
                g.lineTo(W, H); g.fill();
            });
            // stems: a hanging vine from the top, a big flower from the ground
            stems.forEach((s) => {
                const cx = s.x + STEM_W / 2;
                // vine
                g.fillStyle = '#3f8f3c'; g.fillRect(s.x + 8, 0, STEM_W - 16, s.top);
                g.fillStyle = '#2f6e2d'; g.fillRect(s.x + 8, 0, 6, s.top);
                g.fillStyle = '#5fb456';
                for (let y = 30; y < s.top - 10; y += 34) { g.beginPath(); g.ellipse(s.x + (y % 68 ? 6 : STEM_W - 6), y, 14, 7, y % 68 ? -0.5 : 0.5, 0, 7); g.fill(); }
                g.fillStyle = '#2f6e2d'; g.beginPath(); g.ellipse(cx, s.top - 4, STEM_W / 2 + 4, 12, 0, 0, 7); g.fill();
                g.fillStyle = '#5fb456'; g.beginPath(); g.ellipse(cx, s.top - 7, STEM_W / 2, 9, 0, 0, 7); g.fill();
                // flower stem
                const fy = s.top + s.gap;
                g.fillStyle = '#3f8f3c'; g.fillRect(s.x + 14, fy + 14, STEM_W - 28, ground - fy);
                g.fillStyle = '#5fb456';
                for (let y = fy + 50; y < ground - 10; y += 40) { g.beginPath(); g.ellipse(s.x + (Math.floor(y / 40) % 2 ? 4 : STEM_W - 4), y, 15, 7, Math.floor(y / 40) % 2 ? -0.5 : 0.5, 0, 7); g.fill(); }
                g.fillStyle = s.petal;
                for (let p = 0; p < 8; p++) { const a = (p * Math.PI) / 4; g.beginPath(); g.ellipse(cx + Math.cos(a) * 19, fy + 16 + Math.sin(a) * 12, 12, 8, a, 0, 7); g.fill(); }
                g.fillStyle = '#ffb627'; g.beginPath(); g.ellipse(cx, fy + 16, 15, 11, 0, 0, 7); g.fill();
                g.fillStyle = '#c97a10'; g.beginPath(); g.ellipse(cx, fy + 16, 8, 6, 0, 0, 7); g.fill();
                // pollen
                if (!s.taken) {
                    const gold = s.pollen === 'gold', px = cx, py = s.top + s.gap / 2 + Math.sin(t / 300 + s.x / 50) * 6, r = gold ? 14 : 11;
                    const glow = g.createRadialGradient(px, py, 0, px, py, r * 2.2);
                    glow.addColorStop(0, gold ? 'rgba(255,215,90,0.9)' : 'rgba(255,240,150,0.8)'); glow.addColorStop(1, 'rgba(255,220,100,0)');
                    g.fillStyle = glow; g.beginPath(); g.arc(px, py, r * 2.2, 0, 7); g.fill();
                    g.fillStyle = gold ? '#ffcc33' : '#ffe680'; g.beginPath(); g.arc(px, py, r * 0.7, 0, 7); g.fill();
                    if (gold) { g.strokeStyle = '#fff6c9'; g.lineWidth = 2; g.beginPath(); for (let q = 0; q < 4; q++) { const a = t / 400 + (q * Math.PI) / 2; g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 22, py + Math.sin(a) * 22); } g.stroke(); }
                }
            });
            // ground: grass strip with scrolling tufts
            g.fillStyle = '#7a5230'; g.fillRect(0, ground, W, H - ground);
            g.fillStyle = '#4caf50'; g.fillRect(0, ground, W, 12);
            g.fillStyle = '#3b9a40';
            for (let x = -(dist % 24); x < W; x += 24) { g.beginPath(); g.moveTo(x, ground + 12); g.lineTo(x + 6, ground + 2); g.lineTo(x + 12, ground + 12); g.fill(); }
            // bee
            g.save(); g.translate(bee.x, bee.y); g.rotate(dead ? Math.min(1.5, bee.tilt + 0.6) : bee.tilt);
            g.fillStyle = 'rgba(255,255,255,0.8)'; const wing = dead ? 0 : Math.sin(t / (bee.vy < 0 ? 18 : 35)) * 0.6;
            g.beginPath(); g.ellipse(-4, -16, 10, 7, -0.4 + wing, 0, 7); g.fill(); g.beginPath(); g.ellipse(6, -15, 9, 6, 0.4 - wing, 0, 7); g.fill();
            g.fillStyle = '#ffc93c'; g.beginPath(); g.ellipse(0, 0, 20, 14, 0, 0, 7); g.fill();
            g.fillStyle = '#2a1c10'; [-8, 2].forEach((x) => { g.beginPath(); g.ellipse(x, 0, 3.5, 13, 0, 0, 7); g.fill(); });
            g.beginPath(); g.moveTo(-19, 0); g.lineTo(-27, 2); g.lineTo(-19, 5); g.fill();
            g.fillStyle = '#fff'; g.beginPath(); g.arc(13, -3, 5, 0, 7); g.fill();
            g.fillStyle = '#111';
            if (dead) { g.lineWidth = 2; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(11, -5); g.lineTo(16, -1); g.moveTo(16, -5); g.lineTo(11, -1); g.stroke(); }
            else { g.beginPath(); g.arc(14.5, -3, 2.5, 0, 7); g.fill(); }
            g.restore();
            // floating texts
            g.font = '900 22px system-ui, sans-serif'; g.textAlign = 'center';
            for (let i = fx.length - 1; i >= 0; i--) {
                const f = fx[i]; f.life -= dt; f.y -= 50 * dt;
                if (f.life <= 0) { fx.splice(i, 1); continue; }
                g.globalAlpha = Math.min(1, f.life * 2); g.fillStyle = f.color; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4;
                g.strokeText(f.text, f.x, f.y); g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
            }
            setHud((h) => (h.score !== score ? { ...h, score } : h));
        }
        raf = requestAnimationFrame(frame);
        return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('keydown', key); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <>
            <canvas ref={canvas} className="absolute inset-0 w-full h-full touch-none" />
            <Hud score={hud.score} />
            {!hud.started && (
                <motion.p className="absolute inset-x-0 top-[58%] text-center font-display text-2xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] pointer-events-none"
                    animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>Touche pour voler !</motion.p>
            )}
        </>
    );
}

// ---------------------------------------------------------------- pest hunt (whack-a-mole)

const PESTS = ['🐌', '🐛', '🦗'];
function PestGame({ max, onEnd }) {
    const [holes, setHoles] = useState(() => Array(9).fill(null));
    const [score, setScore] = useState(0);
    const [time, setTime] = useState(30);
    const [streak, setStreak] = useState(0);
    const [pops, setPops] = useState([]);
    const s = useRef({ score: 0, streak: 0, holes: Array(9).fill(null), id: 0 });
    useEffect(() => {
        const start = performance.now();
        let ended = false, tickAt = 0;
        const sync = () => setHoles([...s.current.holes]);
        const timer = setInterval(() => {
            const left = 30 - (performance.now() - start) / 1000;
            setTime(Math.max(0, left));
            if (left <= 5 && Math.ceil(left) !== tickAt) { tickAt = Math.ceil(left); sfx.tick(true); }
            const now = performance.now();
            const H = s.current.holes;
            let changed = false;
            H.forEach((h, i) => {
                if (h && h.until < now) {
                    if (!h.hit && !h.bug) { s.current.streak = 0; setStreak(0); }
                    H[i] = null; changed = true;
                }
            });
            const pace = 1 - Math.max(0, left) / 30; // 0 → 1
            const want = 1 + Math.floor(pace * 3);
            if (left > 0.3 && H.filter(Boolean).length < want && Math.random() < 0.35 + pace * 0.3) {
                const free = H.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
                const i = free[Math.floor(Math.random() * free.length)];
                const bug = Math.random() < 0.18;
                H[i] = { id: ++s.current.id, bug, emoji: bug ? '🐞' : PESTS[Math.floor(Math.random() * 3)], until: now + (bug ? 1300 : 1100 - pace * 520) };
                changed = true;
            }
            if (changed) sync();
            if (left <= 0 && !ended) { ended = true; clearInterval(timer); onEnd(Math.min(max, s.current.score)); }
        }, 60);
        return () => clearInterval(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    function hit(i) {
        const h = s.current.holes[i];
        if (!h || h.hit) return;
        h.hit = true;
        h.until = performance.now() + 180;
        let gain;
        if (h.bug) { gain = -3; s.current.streak = 0; sfx.wrong(); }
        else {
            s.current.streak += 1;
            gain = 1 + (s.current.streak > 0 && s.current.streak % 5 === 0 ? 2 : 0);
            sfx.combo(Math.min(8, s.current.streak));
        }
        s.current.score = Math.max(0, s.current.score + gain);
        setScore(s.current.score);
        setStreak(s.current.streak);
        setHoles([...s.current.holes]);
        const id = `${h.id}`;
        setPops((p) => [...p, { id, i, gain }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
    }
    return (
        <>
            <Hud score={score} time={time} extra={streak >= 3 && <motion.span key={streak} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="px-3 py-2 rounded-full bg-[#e9c46a] text-[#3b2a05] font-black">Série ×{streak}</motion.span>} />
            <div className="absolute inset-0 grid place-items-center p-4 pt-20">
                <div className="grid grid-cols-3 gap-3 sm:gap-5 w-full max-w-md">
                    {holes.map((h, i) => (
                        <button key={i} type="button" onPointerDown={() => hit(i)} className="relative aspect-square rounded-full overflow-hidden touch-manipulation"
                            style={{ background: 'radial-gradient(circle at 50% 60%, #1b0e05 0 45%, #4a2c17 46% 62%, #6b4226 63%)', boxShadow: 'inset 0 -6px 0 #2e1a0b, 0 6px 0 #2a6b30' }}>
                            <AnimatePresence>
                                {h && (
                                    <motion.span key={h.id} className="absolute inset-0 grid place-items-center text-5xl sm:text-6xl"
                                        initial={{ y: '70%', scale: 0.6 }} animate={h.hit ? { scale: [1.2, 0], rotate: 30 } : { y: '0%', scale: 1 }} exit={{ y: '80%', opacity: 0 }} transition={{ duration: h.hit ? 0.18 : 0.14 }}>
                                        {h.emoji}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            {pops.filter((p) => p.i === i).map((p) => (
                                <motion.span key={p.id} className={`absolute inset-x-0 top-0 text-center font-display text-2xl font-black ${p.gain < 0 ? 'text-[#ff5a4b]' : 'text-[#ffe28a]'}`}
                                    initial={{ y: 10, opacity: 1 }} animate={{ y: -30, opacity: 0 }} transition={{ duration: 0.7 }}>{p.gain > 0 ? `+${p.gain}` : p.gain}</motion.span>
                            ))}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

// ---------------------------------------------------------------- memory

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
const MEMORY_TIME = 90;
function MemoryGame({ max, onEnd }) {
    const [cards] = useState(() => shuffle(shuffle([...SEED_ORDER]).slice(0, 8).flatMap((k, i) => [{ k, id: `${i}a` }, { k, id: `${i}b` }])));
    const [open, setOpen] = useState([]);
    const [found, setFound] = useState([]);
    const [moves, setMoves] = useState(0);
    const [time, setTime] = useState(MEMORY_TIME);
    const done = useRef(false);
    const start = useRef(performance.now());
    const finish = (pairs, mv, secs) => {
        if (done.current) return;
        done.current = true;
        const score = pairs === 8 ? Math.round(100 - Math.max(0, mv - 8) * 4 - secs / 3) : pairs * 5;
        setTimeout(() => onEnd(Math.max(pairs * 5, Math.min(max, score))), 500);
    };
    useEffect(() => {
        let tickAt = 0;
        const t = setInterval(() => {
            const left = MEMORY_TIME - (performance.now() - start.current) / 1000;
            setTime(Math.max(0, left));
            if (left <= 5 && Math.ceil(left) !== tickAt) { tickAt = Math.ceil(left); sfx.tick(true); }
            if (left <= 0) { clearInterval(t); setFound((f) => { finish(f.length / 2, 0, MEMORY_TIME); return f; }); }
        }, 200);
        return () => clearInterval(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    function flip(i) {
        if (done.current || open.length === 2 || open.includes(i) || found.includes(i)) return;
        sfx.flip();
        const next = [...open, i];
        setOpen(next);
        if (next.length < 2) return;
        const mv = moves + 1;
        setMoves(mv);
        const [a, b] = next;
        if (cards[a].k === cards[b].k) {
            const f = [...found, a, b];
            setTimeout(() => { setFound(f); setOpen([]); sfx.correct(); }, 350);
            if (f.length === 16) finish(8, mv, (performance.now() - start.current) / 1000);
        } else {
            setTimeout(() => setOpen([]), 750);
        }
    }
    const score = Math.max(0, Math.round(100 - Math.max(0, moves - 8) * 4 - (MEMORY_TIME - time) / 3));
    return (
        <>
            <Hud score={found.length === 16 ? score : `${found.length / 2}/8`} time={time} extra={<span className="px-3 py-2 rounded-full bg-black/40 backdrop-blur text-sm font-bold text-white">{moves} coups</span>} />
            <div className="absolute inset-0 grid place-items-center p-3 pt-20">
                <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full max-w-[min(28rem,70dvh)]" style={{ perspective: 800 }}>
                    {cards.map((c, i) => {
                        const up = open.includes(i) || found.includes(i);
                        return (
                            <button key={c.id} type="button" onClick={() => flip(i)} className="relative aspect-[3/4] touch-manipulation">
                                <motion.span className="absolute inset-0 rounded-xl [transform-style:preserve-3d]" animate={{ rotateY: up ? 180 : 0, scale: found.includes(i) ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.35 }}>
                                    <span className="absolute inset-0 rounded-xl [backface-visibility:hidden] grid place-items-center bg-gradient-to-br from-[#3a8f5a] to-[#1d4a33] ring-2 ring-[#8ee6a8]/40 shadow-lg">
                                        <span className="text-2xl opacity-80">🌱</span>
                                    </span>
                                    <span className={`absolute inset-0 rounded-xl [backface-visibility:hidden] [transform:rotateY(180deg)] grid place-items-center bg-gradient-to-b from-[#fdf8ea] to-[#e8dcc0] ring-2 ${found.includes(i) ? 'ring-[#e9c46a] shadow-[0_0_20px_-4px_#e9c46a]' : 'ring-white/50'}`}>
                                        <PlantArt kind={c.k} stage={3} className="w-[85%] h-[85%]" />
                                    </span>
                                </motion.span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
