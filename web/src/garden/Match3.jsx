/**
 * Cascade des fleurs: the garden's match-3. Swap two neighbours to line up 3 identical tiles or more.
 * 4 in a line makes a striped seed (clears a row or a column), an L or a T makes a pollen bomb,
 * 5 in a line makes a rainbow seed (swap it to clear every tile of that kind). Cascades multiply
 * the points. 25 moves; the specials left on the board go off as a final bonus.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Star } from 'lucide-react';
import { sfx } from '../sfx.js';

const N = 8;
export const MATCH_MOVES = 25;
export const MATCH_STARS = [2500, 5000, 8000];
const KINDS = ['fleur', 'tournesol', 'feuille', 'goutte', 'champi', 'baie'];
const COLOR = { fleur: '#ff7eb6', tournesol: '#ffc93c', feuille: '#6fdc6a', goutte: '#5fc4ff', champi: '#ff5a4b', baie: '#9b7bff', rainbow: '#ffffff' };
const PRAISE = { 2: 'Joli !', 3: 'Superbe !', 4: 'Magnifique !', 5: 'Divin !' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => KINDS[Math.floor(Math.random() * KINDS.length)];
const rc = (i) => [Math.floor(i / N), i % N];
const at = (r, c) => r * N + c;
const make = (g, kind, sp = null, drop = 0) => ({ id: g.id++, kind, sp, drop });

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// Every horizontal and vertical line of 3+ identical tiles (rainbow seeds never match).
function findRuns(grid) {
    const runs = [];
    for (let line = 0; line < N; line++) {
        for (const dir of ['h', 'v']) {
            const cell = (k) => (dir === 'h' ? at(line, k) : at(k, line));
            let s = 0;
            while (s < N) {
                const kind = grid[cell(s)]?.kind;
                let e = s + 1;
                while (e < N && kind && grid[cell(e)]?.kind === kind) e++;
                if (kind && kind !== 'rainbow' && e - s >= 3) runs.push({ dir, cells: Array.from({ length: e - s }, (_, j) => cell(s + j)) });
                s = e;
            }
        }
    }
    return runs;
}

// Runs sharing a tile form one group (that is how L and T shapes are found).
function groupRuns(runs) {
    const groups = [];
    for (const run of runs) {
        const merged = { cells: new Set(run.cells), runs: [run] };
        for (const g of groups.filter((g) => run.cells.some((i) => g.cells.has(i)))) {
            g.cells.forEach((i) => merged.cells.add(i));
            merged.runs.push(...g.runs);
            groups.splice(groups.indexOf(g), 1);
        }
        groups.push(merged);
    }
    return groups;
}

function specialOf(group) {
    const long = Math.max(...group.runs.map((r) => r.cells.length));
    if (long >= 5) return 'rainbow';
    if (group.runs.some((r) => r.dir === 'h') && group.runs.some((r) => r.dir === 'v')) return 'bomb';
    if (long === 4) return group.runs.find((r) => r.cells.length === 4).dir === 'h' ? 'col' : 'row';
    return null;
}

// A swap that does something, or null when the board is stuck.
function findMove(grid) {
    for (let i = 0; i < N * N; i++) {
        const [r, c] = rc(i);
        for (const j of [c < N - 1 ? i + 1 : -1, r < N - 1 ? i + N : -1]) {
            if (j < 0) continue;
            const a = grid[i], b = grid[j];
            if (a.sp === 'rainbow' || b.sp === 'rainbow' || (a.sp && b.sp)) return [i, j];
            grid[i] = b; grid[j] = a;
            const ok = findRuns(grid).length > 0;
            grid[i] = a; grid[j] = b;
            if (ok) return [i, j];
        }
    }
    return null;
}

function freshBoard(g) {
    for (;;) {
        const grid = [];
        for (let i = 0; i < N * N; i++) {
            const [r, c] = rc(i);
            let k;
            do k = rnd(); while ((c >= 2 && grid[i - 1].kind === k && grid[i - 2].kind === k) || (r >= 2 && grid[i - N].kind === k && grid[i - 2 * N].kind === k));
            grid.push(make(g, k, null, N + 2 + r * 0.4));
        }
        if (findMove(grid)) return grid;
    }
}

// ---------------------------------------------------------------- art

const GRADIENTS = [['pink', '#ffc2dc', '#ff4f95'], ['gold', '#fff1a8', '#f5a300'], ['green', '#c4f7a6', '#2a9f49'], ['blue', '#d2f3ff', '#1a86db'],
    ['red', '#ffa293', '#d4261b'], ['purple', '#dccaff', '#6236d0'], ['brown', '#a0602e', '#43200d'], ['cream', '#fffbf2', '#e2cfa6']];
function TileDefs() {
    return (
        <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
                {GRADIENTS.map(([id, a, b]) => (
                    <radialGradient key={id} id={`m3-${id}`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
                ))}
            </defs>
        </svg>
    );
}

const ART = {
    fleur: (
        <g>
            {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="50" cy="26" rx="17" ry="22" fill="url(#m3-pink)" stroke="#b02f6c" strokeWidth="2.5" transform={`rotate(${a} 50 50)`} />)}
            <circle cx="50" cy="50" r="15" fill="url(#m3-gold)" stroke="#b07500" strokeWidth="2.5" />
            <circle cx="45" cy="45" r="4.5" fill="#fff" opacity="0.75" />
        </g>
    ),
    tournesol: (
        <g>
            {Array.from({ length: 12 }, (_, k) => <ellipse key={k} cx="50" cy="20" rx="8" ry="17" fill="url(#m3-gold)" stroke="#bd7400" strokeWidth="2" transform={`rotate(${k * 30} 50 50)`} />)}
            <circle cx="50" cy="50" r="19" fill="url(#m3-brown)" stroke="#2b1205" strokeWidth="2.5" />
            {[[44, 44], [56, 45], [50, 55], [42, 54], [58, 55], [50, 39]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.3" fill="#e9a856" opacity="0.85" />)}
        </g>
    ),
    feuille: (
        <g>
            <path d="M50 6 C82 22 90 58 50 94 C10 58 18 22 50 6Z" fill="url(#m3-green)" stroke="#196530" strokeWidth="3" />
            <path d="M50 18 V86 M50 40 L66 30 M50 40 L34 30 M50 58 L68 47 M50 58 L32 47 M50 74 L62 66 M50 74 L38 66" stroke="#196530" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
            <ellipse cx="38" cy="32" rx="6" ry="11" fill="#fff" opacity="0.4" transform="rotate(25 38 32)" />
        </g>
    ),
    goutte: (
        <g>
            <path d="M50 6 C50 6 84 46 84 64 A34 34 0 0 1 16 64 C16 46 50 6 50 6Z" fill="url(#m3-blue)" stroke="#0f5c99" strokeWidth="3" />
            <ellipse cx="37" cy="60" rx="7" ry="13" fill="#fff" opacity="0.65" transform="rotate(20 37 60)" />
            <circle cx="63" cy="77" r="4" fill="#fff" opacity="0.45" />
        </g>
    ),
    champi: (
        <g>
            <path d="M38 56 L62 56 L64 88 Q50 95 36 88 Z" fill="url(#m3-cream)" stroke="#a3854f" strokeWidth="2.5" />
            <path d="M8 58 C8 16 92 16 92 58 Q50 67 8 58Z" fill="url(#m3-red)" stroke="#8a170f" strokeWidth="3" />
            {[[30, 40, 7], [55, 31, 8], [75, 47, 6], [47, 51, 5]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#fff" opacity="0.95" />)}
        </g>
    ),
    baie: (
        <g>
            <path d="M50 16 C58 4 76 6 80 16 C68 22 57 21 50 16Z" fill="url(#m3-green)" stroke="#196530" strokeWidth="2" />
            {[[33, 44], [67, 44], [50, 71]].map(([x, y]) => (
                <g key={`${x}-${y}`}>
                    <circle cx={x} cy={y} r="21" fill="url(#m3-purple)" stroke="#3a1c92" strokeWidth="2.5" />
                    <circle cx={x - 7} cy={y - 8} r="5" fill="#fff" opacity="0.6" />
                    <path d={`M${x - 4} ${y - 18} l4 4 l4 -4`} stroke="#3a1c92" strokeWidth="2" fill="none" />
                </g>
            ))}
        </g>
    ),
};

function TileArt({ kind, sp }) {
    if (sp === 'rainbow') {
        return (
            <span className="relative block w-full h-full rounded-full animate-[spin_3s_linear_infinite]"
                style={{ background: 'conic-gradient(#ff7eb6,#ffc93c,#6fdc6a,#5fc4ff,#9b7bff,#ff7eb6)', boxShadow: '0 0 16px 3px rgba(255,255,255,0.65), inset 0 -5px 8px rgba(0,0,0,0.25)' }}>
                <span className="absolute inset-[24%] rounded-full bg-white/90 blur-[1px]" />
            </span>
        );
    }
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible"
            style={{ filter: sp ? `drop-shadow(0 0 7px ${COLOR[kind]}) drop-shadow(0 3px 2px rgba(0,0,0,0.35))` : 'drop-shadow(0 3px 2px rgba(0,0,0,0.35))' }}>
            {ART[kind]}
            {(sp === 'row' || sp === 'col') && (
                <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.85" transform={sp === 'col' ? 'rotate(90 50 50)' : undefined}>
                    {[32, 50, 68].map((y) => <line key={y} x1="8" x2="92" y1={y} y2={y} />)}
                </g>
            )}
            {sp === 'bomb' && (
                <circle cx="50" cy="50" r="47" fill="none" stroke="#fff3b0" strokeWidth="5" strokeDasharray="11 7" className="animate-[spin_4s_linear_infinite]"
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            )}
        </svg>
    );
}

function Tile({ t, i, cell, selected, hint }) {
    const [r, c] = rc(i);
    return (
        <motion.div className="absolute left-0 top-0 p-[7%] pointer-events-none" style={{ width: cell, height: cell }}
            initial={{ x: c * cell, y: (r - t.drop) * cell, scale: t.drop ? 1 : 0 }}
            animate={{ x: c * cell, y: r * cell, scale: selected ? 1.15 : 1, rotate: hint ? [0, -12, 12, -8, 0] : 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 60, transition: { duration: 0.2 } }}
            transition={{
                x: { type: 'spring', stiffness: 520, damping: 34 },
                y: { type: 'spring', stiffness: 380, damping: 28 },
                scale: { type: 'spring', stiffness: 500, damping: 16 },
                rotate: hint ? { duration: 0.8, repeat: Infinity, repeatDelay: 0.7 } : { duration: 0.2 },
            }}>
            {selected && <span className="absolute inset-[3%] rounded-2xl bg-white/25 ring-2 ring-white/90 shadow-[0_0_18px_rgba(255,255,255,0.6)]" />}
            <span className="relative block w-full h-full"><TileArt kind={t.kind} sp={t.sp} /></span>
        </motion.div>
    );
}

export function MatchStars({ score, className = 'w-6 h-6' }) {
    return (
        <span className="inline-flex gap-1">
            {MATCH_STARS.map((s, k) => (
                <motion.span key={s} initial={false} animate={score >= s ? { scale: [1.5, 1], rotate: [-30, 0] } : { scale: 1 }}>
                    <Star className={`${className} ${score >= s ? 'fill-[#ffd34d] text-[#ffd34d] drop-shadow-[0_0_6px_#ffd34d]' : 'text-white/30'}`} strokeWidth={k === 2 ? 2.5 : 2} />
                </motion.span>
            ))}
        </span>
    );
}

// Petals drifting behind the board.
const PETALS = Array.from({ length: 12 }, (_, k) => ({ k, left: Math.random() * 100, delay: Math.random() * 8, dur: 9 + Math.random() * 7, size: 10 + Math.random() * 12, color: ['#ffc2dc', '#fff1a8', '#ffffff', '#dccaff'][k % 4] }));
function Petals() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {PETALS.map((p) => (
                <motion.span key={p.k} className="absolute top-0 rounded-[60%_0_60%_0] opacity-70" style={{ left: `${p.left}%`, width: p.size, height: p.size, background: p.color }}
                    initial={{ y: '-10vh', rotate: 0 }} animate={{ y: '110vh', x: [0, 40, -20, 30], rotate: 360 }}
                    transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'linear' }} />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- the game

export default function MatchGame({ max, onEnd }) {
    const G = useRef(null);
    if (!G.current) {
        G.current = { id: 1, score: 0, moves: MATCH_MOVES, busy: true, ended: false, grid: [] };
        G.current.grid = freshBoard(G.current);
    }
    const [tiles, setTiles] = useState(() => [...G.current.grid]);
    const [score, setScore] = useState(0);
    const [moves, setMoves] = useState(MATCH_MOVES);
    const [sel, setSel] = useState(null);
    const [hint, setHint] = useState(null);
    const [idle, setIdle] = useState(0);
    const [fx, setFx] = useState([]);
    const [cell, setCell] = useState(44);
    const board = useRef(null);
    const drag = useRef(null);
    const fxId = useRef(0);
    const render = () => setTiles([...G.current.grid]);

    useEffect(() => {
        G.current.ended = false;
        const size = () => setCell(Math.floor(Math.min(innerWidth - 40, innerHeight - 230, 560) / N));
        size();
        addEventListener('resize', size);
        const t = setTimeout(() => { G.current.busy = false; }, 900);
        return () => { removeEventListener('resize', size); clearTimeout(t); G.current.ended = true; };
    }, []);
    // after a few idle seconds, a possible swap wiggles
    useEffect(() => {
        const t = setTimeout(() => { if (!G.current.busy && !G.current.ended) setHint(findMove(G.current.grid)); }, 6000);
        return () => clearTimeout(t);
    }, [idle]);

    function addFx(items, ms) {
        const list = (Array.isArray(items) ? items : [items]).map((x) => ({ ...x, id: ++fxId.current }));
        setFx((f) => [...f, ...list]);
        setTimeout(() => setFx((f) => f.filter((x) => !list.includes(x))), ms);
    }

    async function cascade(forced, fired = new Set(), swaps = []) {
        const g = G.current, grid = g.grid;
        let chain = 0, first = forced;
        for (;;) {
            const groups = groupRuns(findRuns(grid));
            if (!groups.length && !first) break;
            chain += 1;
            const clear = new Set(first || []);
            first = null;
            const create = [];
            let bonus = 0;
            for (const gr of groups) {
                gr.cells.forEach((i) => clear.add(i));
                if (gr.cells.size >= 4) bonus += (gr.cells.size - 3) * 40;
                const sp = specialOf(gr);
                if (!sp) continue;
                const cells = [...gr.cells];
                const cross = sp === 'bomb' ? cells.find((i) => gr.runs.filter((r) => r.cells.includes(i)).length > 1) : undefined;
                const spot = swaps.find((i) => gr.cells.has(i)) ?? cross ?? cells[Math.floor(cells.length / 2)];
                create.push({ spot, kind: sp === 'rainbow' ? 'rainbow' : grid[spot].kind, sp });
            }
            // specials caught in the clear go off, and can set each other off
            const queue = [...clear];
            const blasts = [];
            while (queue.length) {
                const i = queue.pop();
                const t = grid[i];
                if (!t?.sp || fired.has(i)) continue;
                fired.add(i);
                const [r, c] = rc(i);
                let hit = [];
                if (t.sp === 'row') { hit = Array.from({ length: N }, (_, k) => at(r, k)); blasts.push({ type: 'beam', dir: 'h', r, c }); }
                else if (t.sp === 'col') { hit = Array.from({ length: N }, (_, k) => at(k, c)); blasts.push({ type: 'beam', dir: 'v', r, c }); }
                else if (t.sp === 'bomb') {
                    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                        if (Math.abs(dr) + Math.abs(dc) <= 2 && r + dr >= 0 && r + dr < N && c + dc >= 0 && c + dc < N) hit.push(at(r + dr, c + dc));
                    }
                    blasts.push({ type: 'ring', r, c });
                } else if (t.sp === 'rainbow') {
                    const counts = {};
                    grid.forEach((x) => { if (x && x.kind !== 'rainbow') counts[x.kind] = (counts[x.kind] || 0) + 1; });
                    const kind = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
                    grid.forEach((x, j) => { if (x?.kind === kind) hit.push(j); });
                    blasts.push({ type: 'ring', r, c, rainbow: true });
                }
                bonus += 60;
                for (const j of hit) { clear.add(j); queue.push(j); }
            }
            const pts = (clear.size * 10 + bonus) * chain;
            g.score += pts;
            setScore(g.score);
            let sr = 0, sc = 0;
            clear.forEach((i) => { const [r, c] = rc(i); sr += r; sc += c; });
            const sparks = [...clear].filter((i) => grid[i]).map((i) => {
                const [r, c] = rc(i);
                return { type: 'spark', r, c, color: COLOR[grid[i].kind], dots: Array.from({ length: 4 }, () => [(Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2]) };
            });
            addFx([...sparks, ...blasts], 650);
            addFx({ type: 'pts', r: sr / clear.size, c: sc / clear.size, text: `+${pts}`, big: pts >= 400 }, 950);
            const praise = PRAISE[Math.min(5, chain)] || (clear.size >= 14 ? 'Superbe !' : null);
            if (praise) addFx({ type: 'praise', text: praise }, 1100);
            if (blasts.length) sfx.correct();
            sfx.combo(Math.min(8, chain + (blasts.length ? 1 : 0)));
            clear.forEach((i) => { grid[i] = null; });
            create.forEach(({ spot, kind, sp }) => { grid[spot] = make(g, kind, sp, 0); });
            render();
            await wait(blasts.length ? 300 : 220);
            if (g.ended && !g.finishing) return chain;
            // gravity, then new tiles fall from above
            for (let c = 0; c < N; c++) {
                const col = [];
                for (let r = N - 1; r >= 0; r--) if (grid[at(r, c)]) col.push(grid[at(r, c)]);
                const missing = N - col.length;
                for (let r = N - 1, k = 0; r >= 0; r--, k++) grid[at(r, c)] = col[k] || make(g, rnd(), null, missing);
            }
            render();
            await wait(320);
        }
        return chain;
    }

    async function settle() {
        const g = G.current;
        if (!findMove(g.grid)) {
            addFx({ type: 'praise', text: 'On mélange !' }, 1000);
            await wait(450);
            let ok = false;
            for (let tries = 0; tries < 200 && !ok; tries++) {
                const grid = shuffle([...g.grid]);
                if (!findRuns(grid).length && findMove(grid)) { g.grid.splice(0, N * N, ...grid); ok = true; }
            }
            if (!ok) g.grid.splice(0, N * N, ...freshBoard(g));
            sfx.swish();
            render();
            await wait(500);
        }
        if (g.moves <= 0) {
            g.ended = true;
            g.finishing = true;
            const specials = g.grid.map((t, i) => (t?.sp ? i : -1)).filter((i) => i >= 0);
            if (specials.length) {
                addFx({ type: 'praise', text: 'Bonus final !' }, 1200);
                await wait(700);
                await cascade(new Set(specials));
            }
            await wait(700);
            onEnd(Math.min(max, g.score));
            return;
        }
        g.busy = false;
        setIdle((x) => x + 1);
    }

    async function play(a, b) {
        const g = G.current;
        if (g.busy || g.ended) return;
        g.busy = true;
        setSel(null);
        setHint(null);
        const grid = g.grid;
        [grid[a], grid[b]] = [grid[b], grid[a]];
        render();
        sfx.swish();
        await wait(180);
        const A = grid[b], B = grid[a]; // A came from a, B from b
        let forced = null;
        const fired = new Set();
        if (A.sp === 'rainbow' || B.sp === 'rainbow') {
            const rainbowAt = A.sp === 'rainbow' ? b : a;
            const other = A.sp === 'rainbow' ? B : A;
            const otherAt = A.sp === 'rainbow' ? a : b;
            forced = new Set([a, b]);
            fired.add(rainbowAt);
            if (other.sp === 'rainbow') {
                fired.add(otherAt);
                grid.forEach((_, i) => forced.add(i));
            } else {
                grid.forEach((t, i) => {
                    if (t.kind !== other.kind) return;
                    forced.add(i);
                    if (other.sp && i !== otherAt) t.sp = other.sp === 'bomb' ? 'bomb' : Math.random() < 0.5 ? 'row' : 'col';
                });
            }
            const [r, c] = rc(rainbowAt);
            addFx({ type: 'ring', r, c, rainbow: true }, 700);
            sfx.record();
            if (other.sp && other.sp !== 'rainbow') { render(); await wait(380); }
        } else if (A.sp && B.sp) {
            forced = new Set([a, b]);
        } else if (!findRuns(grid).length) {
            [grid[a], grid[b]] = [grid[b], grid[a]];
            render();
            sfx.wrong();
            await wait(220);
            g.busy = false;
            setIdle((x) => x + 1);
            return;
        }
        g.moves -= 1;
        setMoves(g.moves);
        await cascade(forced, fired, [b, a]);
        await settle();
    }

    // input: swipe a tile towards a neighbour, or tap one then the other
    function cellAt(e) {
        const r = board.current.getBoundingClientRect();
        const c = Math.floor((e.clientX - r.left) / cell), row = Math.floor((e.clientY - r.top) / cell);
        return c >= 0 && c < N && row >= 0 && row < N ? at(row, c) : null;
    }
    function down(e) {
        const i = cellAt(e);
        if (i == null || G.current.busy) return;
        drag.current = { i, x: e.clientX, y: e.clientY, moved: false };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    function move(e) {
        const d = drag.current;
        if (!d || d.moved) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return;
        d.moved = true;
        const [r, c] = rc(d.i);
        let j = null;
        if (Math.abs(dx) > Math.abs(dy)) j = dx > 0 ? (c < N - 1 ? d.i + 1 : null) : (c > 0 ? d.i - 1 : null);
        else j = dy > 0 ? (r < N - 1 ? d.i + N : null) : (r > 0 ? d.i - N : null);
        if (j != null) play(d.i, j);
    }
    function up() {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        if (sel == null || sel === d.i) { setSel(sel === d.i ? null : d.i); sfx.tap(); return; }
        const [r1, c1] = rc(sel), [r2, c2] = rc(d.i);
        if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) play(sel, d.i);
        else { setSel(d.i); sfx.tap(); }
    }

    const W = cell * N;
    const pos = (r, c) => ({ left: (c + 0.5) * cell, top: (r + 0.5) * cell });
    const nextStar = MATCH_STARS.find((s) => score < s) ?? MATCH_STARS[2];
    return (
        <>
            <TileDefs />
            <Petals />
            <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 z-10 flex items-start gap-2 pointer-events-none">
                <div className="px-4 py-2 rounded-2xl bg-black/35 backdrop-blur ring-1 ring-white/10 min-w-[10rem]">
                    <motion.p key={score} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="origin-left font-display text-3xl font-black text-white tabular-nums leading-none">{score.toLocaleString('fr-FR')}</motion.p>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="relative block w-24 h-2 rounded-full bg-white/15 overflow-hidden">
                            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ff7eb6] to-[#ffd34d]" animate={{ width: `${Math.min(100, (score / MATCH_STARS[2]) * 100)}%` }} />
                        </span>
                        <MatchStars score={score} className="w-4 h-4" />
                    </div>
                    {score < MATCH_STARS[2] && <p className="mt-1 text-[10px] font-semibold text-white/60">Prochaine étoile : {nextStar.toLocaleString('fr-FR')}</p>}
                </div>
                <motion.div key={moves} initial={{ scale: 1.25 }} animate={{ scale: 1 }}
                    className={`ml-auto grid place-items-center w-[4.25rem] h-[4.25rem] rounded-2xl backdrop-blur ring-1 ring-white/10 ${moves <= 5 ? 'bg-[#ff5a4b]/85' : 'bg-black/35'}`}>
                    <span className="flex flex-col items-center">
                        <span className="font-display text-3xl font-black text-white leading-none tabular-nums">{moves}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/75">coups</span>
                    </span>
                </motion.div>
            </div>

            <div className="absolute inset-0 grid place-items-center pt-28 pb-4 px-3">
                <div className="relative p-2 rounded-[1.7rem] bg-[#0b2117]/55 ring-1 ring-white/20 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                    <div ref={board} className="relative overflow-hidden rounded-[1.2rem] touch-none cursor-pointer" style={{ width: W, height: W }}
                        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}>
                        {Array.from({ length: N * N }, (_, i) => {
                            const [r, c] = rc(i);
                            return <span key={i} className={`absolute ${(r + c) % 2 ? 'bg-white/[0.08]' : 'bg-white/[0.03]'}`} style={{ left: c * cell, top: r * cell, width: cell, height: cell }} />;
                        })}
                        <AnimatePresence>
                            {tiles.map((t, i) => t && <Tile key={t.id} t={t} i={i} cell={cell} selected={sel === i} hint={!!hint && hint.includes(i)} />)}
                        </AnimatePresence>
                        {fx.map((f) => {
                            if (f.type === 'spark') {
                                return (
                                    <span key={f.id} className="absolute pointer-events-none" style={pos(f.r, f.c)}>
                                        <motion.span className="absolute rounded-full -translate-x-1/2 -translate-y-1/2" style={{ width: cell, height: cell, border: `3px solid ${f.color}`, boxShadow: `0 0 12px ${f.color}` }}
                                            initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.45 }} />
                                        {f.dots.map(([dx, dy], k) => (
                                            <motion.span key={k} className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ background: f.color }}
                                                initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: dx * cell, y: dy * cell, opacity: 0, scale: 0.3 }} transition={{ duration: 0.55, ease: 'easeOut' }} />
                                        ))}
                                    </span>
                                );
                            }
                            if (f.type === 'beam') {
                                const h = f.dir === 'h';
                                return (
                                    <motion.span key={f.id} className="absolute pointer-events-none rounded-full"
                                        style={h ? { left: 0, width: W, top: f.r * cell + cell * 0.2, height: cell * 0.6, background: 'linear-gradient(90deg,transparent,#fff,transparent)' }
                                            : { top: 0, height: W, left: f.c * cell + cell * 0.2, width: cell * 0.6, background: 'linear-gradient(180deg,transparent,#fff,transparent)' }}
                                        initial={h ? { scaleY: 0, opacity: 1 } : { scaleX: 0, opacity: 1 }} animate={h ? { scaleY: [0, 1.4, 0], opacity: [1, 1, 0] } : { scaleX: [0, 1.4, 0], opacity: [1, 1, 0] }}
                                        transition={{ duration: 0.45 }} />
                                );
                            }
                            if (f.type === 'ring') {
                                return (
                                    <motion.span key={f.id} className="absolute pointer-events-none rounded-full -translate-x-1/2 -translate-y-1/2" style={{
                                        ...pos(f.r, f.c), width: cell * 5, height: cell * 5,
                                        background: f.rainbow ? 'conic-gradient(#ff7eb6,#ffc93c,#6fdc6a,#5fc4ff,#9b7bff,#ff7eb6)' : 'radial-gradient(circle,#fff6c0 0 30%,#ffc93c 55%,transparent 70%)',
                                        WebkitMask: f.rainbow ? 'radial-gradient(circle, transparent 55%, #000 57%, #000 68%, transparent 70%)' : undefined,
                                        mask: f.rainbow ? 'radial-gradient(circle, transparent 55%, #000 57%, #000 68%, transparent 70%)' : undefined,
                                    }}
                                        initial={{ scale: 0.1, opacity: 1 }} animate={{ scale: f.rainbow ? 2.2 : 1, opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                                );
                            }
                            if (f.type === 'pts') {
                                return (
                                    <motion.span key={f.id} className={`absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 font-display font-black whitespace-nowrap ${f.big ? 'text-3xl text-[#ffe28a]' : 'text-2xl text-white'}`}
                                        style={{ ...pos(f.r, f.c), textShadow: '0 2px 0 rgba(0,0,0,0.45), 0 0 12px rgba(0,0,0,0.35)' }}
                                        initial={{ y: 0, opacity: 0, scale: 0.6 }} animate={{ y: -cell, opacity: [0, 1, 1, 0], scale: 1 }} transition={{ duration: 0.9 }}>{f.text}</motion.span>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
            </div>

            <div className="absolute inset-0 grid place-items-center pointer-events-none z-20">
                <AnimatePresence>
                    {fx.filter((f) => f.type === 'praise').slice(-1).map((f) => (
                        <motion.p key={f.id} className="font-display text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#fff6c0] via-[#ffd34d] to-[#ff7eb6] [-webkit-text-stroke:1.5px_rgba(80,20,60,0.55)] drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
                            initial={{ scale: 0.3, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 1.4, opacity: 0 }}
                            transition={{ type: 'spring', damping: 11, stiffness: 260 }}>{f.text}</motion.p>
                    ))}
                </AnimatePresence>
            </div>
        </>
    );
}
