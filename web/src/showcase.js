import { RARITIES, TYPES } from './game.jsx';

// Showcase ("vitrine"): up to 10 cards on a drawn background, painted on a canvas so the
// preview, the profile and the exported image are exactly the same picture.

export const SHOWCASE_MAX = 10;
export const FORMATS = {
    story: { label: 'Story 9:16', w: 1080, h: 1920 },
    carre: { label: 'Carré', w: 1080, h: 1080 },
};
export const LAYOUTS = {
    grille: 'Grille',
    eventail: 'Éventail',
    vedette: 'Vedette',
};

const DISPLAY = '"Playfair Display", Georgia, serif';
const SANS = '"Plus Jakarta Sans", system-ui, sans-serif';

function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function glow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function vertical(ctx, W, H, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

// A leaf with its midrib, pointing up from (x, y) and rotated by `angle`.
function leaf(ctx, x, y, length, width, angle, fill, vein) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(width, -length * 0.25, width * 0.8, -length * 0.8, 0, -length);
    ctx.bezierCurveTo(-width * 0.8, -length * 0.8, -width, -length * 0.25, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();
    if (vein) {
        ctx.strokeStyle = vein;
        ctx.lineWidth = Math.max(1.5, width * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -length * 0.95);
        for (let i = 1; i < 6; i++) {
            const t = -length * i / 6.5;
            ctx.moveTo(0, t); ctx.lineTo(width * 0.55, t - length * 0.08);
            ctx.moveTo(0, t); ctx.lineTo(-width * 0.55, t - length * 0.08);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// A fern frond: a curved stem with leaflets shrinking to the tip.
function frond(ctx, x, y, length, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = length * 0.012;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.15, -length * 0.5, 0, -length);
    ctx.stroke();
    for (let i = 1; i < 18; i++) {
        const t = i / 18, size = length * 0.16 * (1 - t * 0.85);
        const px = length * 0.15 * 2 * t * (1 - t), py = -length * t;
        leaf(ctx, px, py, size, size * 0.3, 1.25, color);
        leaf(ctx, px, py, size, size * 0.3, -1.15, color);
    }
    ctx.restore();
}

function snowflake(ctx, x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -r);
        ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.8);
        ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.25, -r * 0.8);
        ctx.stroke();
    }
    ctx.restore();
}

function sparkle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
}

function ridge(ctx, W, H, base, amp, color, rand) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, base);
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
        const x = (W * i) / steps;
        ctx.quadraticCurveTo(x - W / steps / 2, base - amp * (0.4 + rand()), x, base - amp * rand() * 0.5);
    }
    ctx.lineTo(W, H);
    ctx.fill();
}

// Each background paints the whole canvas; `ink` is the text colour that reads on it.
export const BACKGROUNDS = {
    foret: {
        label: 'Forêt', ink: '#f4ead0', accent: '#a8f0c6',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#123d27', '#0a2618', '#04120b']);
            ctx.globalAlpha = 0.07;
            ctx.fillStyle = '#f6ffd8';
            for (let i = 0; i < 5; i++) {
                const x = W * (0.05 + i * 0.18);
                ctx.beginPath();
                ctx.moveTo(x, 0); ctx.lineTo(x + W * 0.08, 0);
                ctx.lineTo(x + W * 0.5, H); ctx.lineTo(x + W * 0.3, H);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            for (let i = 0; i < 7; i++) frond(ctx, W * (rand() * 0.2 - 0.05), H * (0.75 + rand() * 0.3), H * (0.3 + rand() * 0.2), 0.2 + rand() * 0.6, `rgba(30,110,64,${0.35 + rand() * 0.3})`);
            for (let i = 0; i < 7; i++) frond(ctx, W * (0.85 + rand() * 0.2), H * (0.75 + rand() * 0.3), H * (0.3 + rand() * 0.2), -0.2 - rand() * 0.6, `rgba(30,110,64,${0.35 + rand() * 0.3})`);
            for (let i = 0; i < 40; i++) glow(ctx, rand() * W, rand() * H, 6 + rand() * 14, `rgba(220,255,150,${0.25 + rand() * 0.45})`);
        },
    },
    ocean: {
        label: 'Océan', ink: '#eaf8ff', accent: '#7dd3fc',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#1a7fa8', '#0b4b72', '#05213d', '#020d1c']);
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 6; i++) {
                const x = W * rand();
                ctx.beginPath();
                ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0);
                ctx.lineTo(x + 260 * (rand() - 0.3), H * 0.8); ctx.lineTo(x - 160, H * 0.8);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            for (let i = 0; i < 9; i++) {
                const x = W * rand(), len = H * (0.12 + rand() * 0.2);
                ctx.strokeStyle = `rgba(20,140,110,${0.35 + rand() * 0.3})`;
                ctx.lineWidth = 14 + rand() * 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x, H + 20);
                for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(k * 1.3 + i) * 30, H + 20 - (len * k) / 6);
                ctx.stroke();
            }
            for (let i = 0; i < 45; i++) {
                const r = 4 + rand() * 18;
                ctx.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.35})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2); ctx.stroke();
            }
        },
    },
    nuit: {
        label: 'Nuit étoilée', ink: '#fdf6e3', accent: '#f7d774',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#070b26', '#141a4a', '#2c2160', '#3c2659']);
            glow(ctx, W * 0.5, H * 0.35, W * 0.9, 'rgba(110,90,200,0.18)');
            for (let i = 0; i < 260; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
                ctx.beginPath(); ctx.arc(rand() * W, rand() * H * 0.85, rand() * 2.6 + 0.6, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 9; i++) sparkle(ctx, rand() * W, rand() * H * 0.7, 10 + rand() * 14, 'rgba(255,248,220,0.9)');
            glow(ctx, W * 0.82, H * 0.08, W * 0.22, 'rgba(255,240,190,0.35)');
            ctx.fillStyle = '#fff3c9';
            ctx.beginPath(); ctx.arc(W * 0.82, H * 0.08, W * 0.06, 0, Math.PI * 2); ctx.fill();
            ridge(ctx, W, H, H * 0.93, H * 0.06, '#140f2e', rand);
        },
    },
    herbier: {
        label: 'Herbier', ink: '#2d2416', accent: '#7a5c2e',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#f6eed7', '#efe3c4', '#e7d6ad']);
            for (let i = 0; i < 5000; i++) {
                ctx.fillStyle = `rgba(110,80,30,${rand() * 0.06})`;
                ctx.fillRect(rand() * W, rand() * H, 2, 2);
            }
            ctx.strokeStyle = 'rgba(120,90,40,0.10)';
            ctx.lineWidth = 2;
            for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
            const sepia = ['rgba(110,120,60,0.30)', 'rgba(140,100,50,0.26)', 'rgba(90,110,70,0.28)'];
            for (let i = 0; i < 14; i++) {
                const corner = i % 4, x = corner % 2 ? W * (0.9 + rand() * 0.1) : W * rand() * 0.1, y = corner < 2 ? H * rand() * 0.12 + 40 : H * (0.9 + rand() * 0.1);
                leaf(ctx, x, y, 120 + rand() * 120, 40 + rand() * 30, rand() * Math.PI * 2, sepia[i % 3], 'rgba(90,60,20,0.25)');
            }
            ctx.strokeStyle = 'rgba(120,90,40,0.35)';
            ctx.lineWidth = 3;
            rrect(ctx, 28, 28, W - 56, H - 56, 10);
            ctx.stroke();
        },
    },
    or: {
        label: 'Trésor', ink: '#fff4d6', accent: '#f4c25b',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#1d1306', '#120b03', '#060401']);
            ctx.save();
            ctx.translate(W / 2, H * 0.48);
            for (let i = 0; i < 36; i++) {
                ctx.rotate((Math.PI * 2) / 36);
                ctx.fillStyle = i % 2 ? 'rgba(244,194,91,0.05)' : 'rgba(244,194,91,0.10)';
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -H); ctx.lineTo(60, -H); ctx.fill();
            }
            ctx.restore();
            glow(ctx, W / 2, H * 0.48, W * 0.7, 'rgba(244,194,91,0.30)');
            for (let i = 0; i < 70; i++) sparkle(ctx, rand() * W, rand() * H, 4 + rand() * 14, `rgba(255,${210 + rand() * 40},${120 + rand() * 60},${0.3 + rand() * 0.6})`);
            ctx.strokeStyle = 'rgba(244,194,91,0.55)';
            ctx.lineWidth = 4;
            rrect(ctx, 30, 30, W - 60, H - 60, 24); ctx.stroke();
            ctx.lineWidth = 1.5;
            rrect(ctx, 46, 46, W - 92, H - 92, 16); ctx.stroke();
        },
    },
    aube: {
        label: 'Aube', ink: '#fff6ec', accent: '#ffd29a',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#2b1d5c', '#7a3f8f', '#e0607a', '#ffa86b', '#ffd58a']);
            glow(ctx, W * 0.5, H * 0.86, W * 0.55, 'rgba(255,230,160,0.55)');
            ctx.fillStyle = 'rgba(255,240,200,0.9)';
            ctx.beginPath(); ctx.arc(W * 0.5, H * 0.86, W * 0.11, 0, Math.PI * 2); ctx.fill();
            ridge(ctx, W, H, H * 0.86, H * 0.12, 'rgba(120,50,90,0.55)', rand);
            ridge(ctx, W, H, H * 0.91, H * 0.08, 'rgba(70,30,70,0.75)', rand);
            ridge(ctx, W, H, H * 0.96, H * 0.05, '#2a1433', rand);
            for (let i = 0; i < 6; i++) {
                const x = W * rand(), y = H * (0.1 + rand() * 0.3), s = 10 + rand() * 10;
                ctx.strokeStyle = 'rgba(40,20,50,0.5)'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s / 2, x, y); ctx.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); ctx.stroke();
            }
        },
    },
    jungle: {
        label: 'Jungle', ink: '#f2ffe9', accent: '#c7ef7a',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#0d3a2a', '#0a2b1f', '#061a12']);
            glow(ctx, W * 0.5, H * 0.45, W * 0.8, 'rgba(160,230,120,0.12)');
            const greens = ['#1d6b3d', '#2b8a4a', '#145a33', '#3a9b52', '#0f4a2a'];
            for (let i = 0; i < 26; i++) {
                const side = i % 4;
                const x = side === 0 ? -40 + rand() * 120 : side === 1 ? W + 40 - rand() * 120 : rand() * W;
                const y = side < 2 ? rand() * H : side === 2 ? -20 + rand() * 60 : H + 20 - rand() * 60;
                const toward = Math.atan2(H / 2 - y, W / 2 - x) + Math.PI / 2;
                leaf(ctx, x, y, 220 + rand() * 200, 90 + rand() * 70, toward + (rand() - 0.5) * 0.9, greens[i % 5], 'rgba(200,255,180,0.18)');
            }
        },
    },
    givre: {
        label: 'Givre', ink: '#0f2a3d', accent: '#2a7bb0',
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#f2fbff', '#d6eefc', '#a9d4f0']);
            glow(ctx, W * 0.2, H * 0.15, W * 0.6, 'rgba(255,255,255,0.7)');
            for (let i = 0; i < 40; i++) snowflake(ctx, rand() * W, rand() * H, 10 + rand() * 34, `rgba(70,140,190,${0.12 + rand() * 0.25})`);
            for (let i = 0; i < 120; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
                ctx.beginPath(); ctx.arc(rand() * W, rand() * H, 2 + rand() * 4, 0, Math.PI * 2); ctx.fill();
            }
            ridge(ctx, W, H, H * 0.95, H * 0.04, 'rgba(255,255,255,0.85)', rand);
        },
    },
    // Premium: unlocked with pépites (prices come from the server).
    aurore: {
        label: 'Aurore boréale', ink: '#effff8', accent: '#7cf5c4', premium: true,
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#020812', '#06182a', '#0b2236', '#0a1a24']);
            for (let i = 0; i < 220; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.7})`;
                ctx.beginPath(); ctx.arc(rand() * W, rand() * H * 0.8, rand() * 2.2 + 0.5, 0, Math.PI * 2); ctx.fill();
            }
            // curtains of light: many thin vertical strokes along a wavy line, fading upwards
            ctx.globalCompositeOperation = 'lighter';
            const bands = [['46,255,170', 0.3, 0.2], ['90,255,190', 0.5, 0.16], ['170,110,255', 0.18, 0.12], ['46,255,170', 0.72, 0.1]];
            bands.forEach(([rgb, base, amp], b) => {
                const phase = rand() * 6, freq = 1.6 + rand() * 1.4;
                for (let x = -20; x < W + 20; x += 3) {
                    const t = x / W;
                    const y = H * (base + Math.sin(t * Math.PI * freq + phase) * amp * 0.5 + Math.sin(t * 9 + b) * 0.015);
                    const len = H * (0.16 + 0.1 * Math.sin(t * 13 + phase) ** 2);
                    const g = ctx.createLinearGradient(0, y - len, 0, y);
                    g.addColorStop(0, `rgba(${rgb},0)`);
                    g.addColorStop(0.6, `rgba(${rgb},${0.08 + 0.08 * Math.sin(t * 40 + b) ** 2})`);
                    g.addColorStop(0.9, `rgba(${rgb},${0.3 + 0.25 * Math.sin(t * 23 + b) ** 2})`);
                    g.addColorStop(1, `rgba(${rgb},0)`);
                    ctx.fillStyle = g;
                    ctx.fillRect(x, y - len, 3, len);
                }
            });
            ctx.globalCompositeOperation = 'source-over';
            glow(ctx, W * 0.5, H * 0.3, W * 0.8, 'rgba(60,255,180,0.14)');
            ridge(ctx, W, H, H * 0.9, H * 0.08, '#081520', rand);
            // pine silhouettes on the ridge
            ctx.fillStyle = '#03090f';
            for (let i = 0; i < 26; i++) {
                const x = rand() * W, h = H * (0.04 + rand() * 0.06), base = H * (0.94 + rand() * 0.03), w = h * 0.32;
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const y = base - (h * k) / 4;
                    ctx.moveTo(x, y - h * 0.4); ctx.lineTo(x + w * (1 - k * 0.2), y); ctx.lineTo(x - w * (1 - k * 0.2), y); ctx.closePath();
                }
                ctx.fill();
            }
            ctx.fillRect(0, H * 0.965, W, H);
        },
    },
    volcan: {
        label: 'Volcan', ink: '#fff1e2', accent: '#ffb35c', premium: true,
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#140405', '#2a0807', '#4a0f08', '#250605']);
            glow(ctx, W * 0.5, H * 0.62, W * 0.95, 'rgba(255,90,20,0.30)');
            // smoke
            for (let i = 0; i < 30; i++) glow(ctx, W * (0.2 + rand() * 0.6), H * (0.05 + rand() * 0.4), W * (0.12 + rand() * 0.2), 'rgba(60,30,30,0.35)');
            // the cone, with lava rivers
            ctx.fillStyle = '#1a0605';
            ctx.beginPath();
            ctx.moveTo(-W * 0.1, H); ctx.lineTo(W * 0.38, H * 0.7); ctx.lineTo(W * 0.62, H * 0.7); ctx.lineTo(W * 1.1, H); ctx.fill();
            glow(ctx, W * 0.5, H * 0.7, W * 0.25, 'rgba(255,170,60,0.75)');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(255,120,30,0.9)';
            ctx.shadowBlur = 24;
            for (let i = 0; i < 7; i++) {
                let x = W * (0.4 + rand() * 0.2), y = H * 0.71;
                ctx.strokeStyle = `rgba(255,${110 + rand() * 90},30,${0.6 + rand() * 0.4})`;
                ctx.lineWidth = 4 + rand() * 7;
                ctx.beginPath(); ctx.moveTo(x, y);
                const dir = x < W / 2 ? -1 : 1;
                while (y < H) { x += dir * (8 + rand() * 30) + (rand() - 0.5) * 30; y += 30 + rand() * 30; ctx.lineTo(x, y); }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            // embers
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 120; i++) {
                const x = W * (0.5 + (rand() - 0.5) * rand() * 1.4), y = H * (0.72 - rand() * 0.68), r = 1.5 + rand() * 4;
                glow(ctx, x, y, r * 4, `rgba(255,${120 + rand() * 100},40,${0.25 + rand() * 0.5})`);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255,150,70,0.45)';
            ctx.lineWidth = 3;
            rrect(ctx, 30, 30, W - 60, H - 60, 22); ctx.stroke();
        },
    },
    galaxie: {
        label: 'Galaxie', ink: '#fbf5ff', accent: '#f0a6ff', premium: true,
        paint(ctx, W, H, rand) {
            vertical(ctx, W, H, ['#05020f', '#0d0624', '#120a33', '#05020f']);
            ctx.globalCompositeOperation = 'lighter';
            // nebula clouds
            const hues = ['200,80,255', '80,120,255', '255,80,180', '60,220,255'];
            for (let i = 0; i < 26; i++) glow(ctx, W * (0.1 + rand() * 0.8), H * (0.15 + rand() * 0.7), W * (0.15 + rand() * 0.3), `rgba(${hues[i % 4]},${0.1 + rand() * 0.12})`);
            // spiral arms of stars
            ctx.save();
            ctx.translate(W * 0.72, Math.min(H * 0.2, W * 0.36));
            ctx.rotate(-0.45);
            for (let i = 0; i < 2600; i++) {
                const arm = i % 2, t = rand();
                const a = t * Math.PI * 3.2 + arm * Math.PI, r = t * W * 0.8;
                const spread = (rand() - 0.5) * (18 + r * 0.22);
                const x = Math.cos(a) * r + spread, y = (Math.sin(a) * r + spread) * 0.55;
                ctx.fillStyle = `rgba(${220 + rand() * 35},${200 + rand() * 55},255,${(0.15 + rand() * 0.6) * (1 - t * 0.6)})`;
                ctx.fillRect(x, y, 2 + rand() * 1.6, 2 + rand() * 1.6);
            }
            glow(ctx, 0, 0, W * 0.2, 'rgba(255,235,255,0.6)');
            glow(ctx, 0, 0, W * 0.06, 'rgba(255,255,255,0.9)');
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 260; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.8})`;
                ctx.beginPath(); ctx.arc(rand() * W, rand() * H, rand() * 2 + 0.4, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 12; i++) sparkle(ctx, rand() * W, rand() * H, 8 + rand() * 16, 'rgba(255,240,255,0.85)');
        },
    },
};

const RARITY_FRAMES = {
    rare: ['#d6ebff', '#4ea8ff', '#1d4f8c'],
    epic: ['#ecdcff', '#a855f7', '#4c1d95'],
    legendary: ['#fff4c2', '#e9b949', '#8a5a12'],
    secret: ['#ffe0f7', '#ff5fd2', '#6d28d9'],
};

function fitFont(ctx, text, weight, family, size, maxWidth, minSize) {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (s > minSize && ctx.measureText(text).width > maxWidth) {
        s -= 1;
        ctx.font = `${weight} ${s}px ${family}`;
    }
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
}

// One card, centred on (cx, cy), `w` wide, rotated by `rot` radians.
function drawCard(ctx, card, img, cx, cy, w, rot = 0) {
    const h = w * 1.4;
    const type = TYPES[card.type] || TYPES.plant;
    const rarity = RARITIES[card.rarity] || RARITIES.common;
    const frame = RARITY_FRAMES[card.rarity] || ['#ffffff', type.color, '#10261a'];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-w / 2, -h / 2);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = w * 0.09;
    ctx.shadowOffsetY = w * 0.035;
    const fg = ctx.createLinearGradient(0, 0, w, h);
    fg.addColorStop(0, frame[0]); fg.addColorStop(0.45, frame[1]); fg.addColorStop(1, frame[2]);
    ctx.fillStyle = fg;
    rrect(ctx, 0, 0, w, h, w * 0.06);
    ctx.fill();
    ctx.restore();

    const p = w * 0.04;
    ctx.fillStyle = '#f8f1df';
    rrect(ctx, p, p, w - 2 * p, h - 2 * p, w * 0.04);
    ctx.fill();

    // name and rarity
    const inner = w - 4 * p;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1e1a12';
    ctx.font = `700 ${w * 0.075}px ${SANS}`;
    const symbolWidth = ctx.measureText(rarity.symbol).width;
    const name = fitFont(ctx, card.name || '', 700, DISPLAY, w * 0.085, inner - symbolWidth - p, w * 0.06);
    ctx.textAlign = 'left';
    ctx.fillText(name, 2 * p, p + w * 0.085);
    ctx.font = `700 ${w * 0.06}px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = card.rarity === 'common' ? '#6b7280' : rarity.color;
    ctx.fillText(rarity.symbol, w - 2 * p, p + w * 0.085);

    // picture
    const ix = 2 * p, iy = p + w * 0.17, iw = w - 4 * p, ih = h * 0.56;
    ctx.save();
    rrect(ctx, ix, iy, iw, ih, w * 0.03);
    ctx.clip();
    ctx.fillStyle = type.color;
    ctx.fillRect(ix, iy, iw, ih);
    if (img) {
        const scale = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    }
    ctx.restore();
    ctx.strokeStyle = type.color;
    ctx.lineWidth = Math.max(2, w * 0.012);
    rrect(ctx, ix, iy, iw, ih, w * 0.03);
    ctx.stroke();

    // scientific name, then type pill and rarity label
    const below = iy + ih;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5c5240';
    ctx.fillText(fitFont(ctx, card.sci_name || type.label, 'italic 500', DISPLAY, w * 0.056, inner, w * 0.04), 2 * p, below + w * 0.075);
    const pillY = below + w * 0.14, pillH = w * 0.1;
    ctx.font = `700 ${w * 0.05}px ${SANS}`;
    const label = fitFont(ctx, type.label, 700, SANS, w * 0.05, inner * 0.55, w * 0.035);
    const pillW = ctx.measureText(label).width + w * 0.07;
    ctx.fillStyle = type.color;
    rrect(ctx, 2 * p, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 2 * p + w * 0.035, pillY + pillH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = card.rarity === 'common' ? '#6b7280' : frame[2];
    ctx.fillText(fitFont(ctx, rarity.label, 700, SANS, w * 0.05, inner - pillW - p, w * 0.035), w - 2 * p, pillY + pillH / 2);

    // foil sheen on the rarest cards
    if (RARITY_FRAMES[card.rarity] && card.rarity !== 'rare') {
        ctx.save();
        rrect(ctx, 0, 0, w, h, w * 0.06);
        ctx.clip();
        const sheen = ctx.createLinearGradient(0, 0, w, h);
        sheen.addColorStop(0.2, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.42, 'rgba(255,255,255,0.28)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        sheen.addColorStop(0.62, 'rgba(255,255,255,0.18)');
        sheen.addColorStop(0.8, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }
    ctx.restore();
}

// Card positions [{ x, y, w, rot }] inside the box, for each layout.
function place(layout, n, box, story) {
    const { x, y, w: W, h: H } = box;
    const out = [];
    const grid = (count, bx, by, bw, bh, gap) => {
        let best = null;
        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);
            const cw = Math.min((bw - gap * (cols - 1)) / cols, (bh - gap * (rows - 1)) / rows / 1.4);
            if (!best || cw > best.cw) best = { cols, rows, cw };
        }
        const { cols, rows, cw } = best;
        const ch = cw * 1.4, top = by + (bh - (rows * ch + (rows - 1) * gap)) / 2;
        const list = [];
        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / cols), inRow = Math.min(cols, count - r * cols), c = i % cols;
            const left = bx + (bw - (inRow * cw + (inRow - 1) * gap)) / 2;
            list.push({ x: left + c * (cw + gap) + cw / 2, y: top + r * (ch + gap) + ch / 2, w: cw, rot: 0 });
        }
        return list;
    };

    if (layout === 'eventail') {
        const perRow = story ? 4 : 5;
        const rows = Math.ceil(n / perRow);
        const sizes = Array.from({ length: rows }, (_, r) => Math.floor(n / rows) + (r < n % rows ? 1 : 0));
        const widest = Math.max(...sizes);
        const step = 0.62;
        const cw = Math.min((W * 0.92) / (1 + step * (widest - 1)), H / (rows * 1.4 * 0.86 + 0.25));
        const rowH = (H - cw * 0.3) / rows;
        let i = 0;
        sizes.forEach((k, r) => {
            const cy = y + rowH * r + rowH / 2 + cw * 0.12;
            for (let j = 0; j < k; j++, i++) {
                const t = k > 1 ? j / (k - 1) - 0.5 : 0;
                out.push({ x: x + W / 2 + t * (k - 1) * cw * step, y: cy + t * t * cw * 0.5, w: cw, rot: t * (k > 2 ? 0.5 : 0.25) });
            }
        });
        return out;
    }
    if (layout === 'vedette' && n > 1) {
        const gap = W * 0.025;
        if (story) {
            const bigW = Math.min(W * 0.62, (H * 0.55) / 1.4);
            out.push({ x: x + W / 2, y: y + (bigW * 1.4) / 2, w: bigW, rot: 0 });
            const top = y + bigW * 1.4 + gap * 1.6;
            return out.concat(grid(n - 1, x, top, W, y + H - top, gap));
        }
        const bigW = Math.min(W * 0.46, H / 1.4);
        out.push({ x: x + bigW / 2, y: y + H / 2, w: bigW, rot: 0 });
        return out.concat(grid(n - 1, x + bigW + gap * 1.6, y, W - bigW - gap * 1.6, H, gap));
    }
    if (layout === 'vedette') return [{ x: x + W / 2, y: y + H / 2, w: Math.min(W * 0.7, H / 1.4), rot: 0 }];
    return grid(n, x, y, W, H, W * 0.03);
}

const LEAF = new Path2D('M7 33C5 18 15 6 34 5c1 19-10 30-25 29z');
const VEIN = new Path2D('M8 32C14 24 20 17 29 10');

function signature(ctx, W, y, size, theme) {
    ctx.font = `600 ${size}px ${DISPLAY}`;
    const text = 'NatureDex';
    const textW = ctx.measureText(text).width;
    const icon = size * 1.3, total = icon + size * 0.35 + textW;
    const left = (W - total) / 2;
    ctx.save();
    ctx.translate(left, y - icon / 2);
    ctx.scale(icon / 40, icon / 40);
    const g = ctx.createLinearGradient(0, 40, 40, 0);
    g.addColorStop(0, '#1f8a4f'); g.addColorStop(0.6, '#4fd18b'); g.addColorStop(1, '#c8f7d9');
    ctx.fillStyle = g;
    ctx.fill(LEAF);
    ctx.strokeStyle = 'rgba(5,19,13,0.65)';
    ctx.lineWidth = 1.8;
    ctx.stroke(VEIN);
    ctx.restore();
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + icon + size * 0.35, y);
    ctx.font = `600 ${size * 0.42}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7;
    ctx.fillText('naturedex.fr', W / 2, y + size * 0.95);
    ctx.globalAlpha = 1;
}

export function drawShowcase(canvas, { format, background, layout, title, username, cards }, images) {
    const f = FORMATS[format] || FORMATS.story;
    const story = f === FORMATS.story;
    const theme = BACKGROUNDS[background] || BACKGROUNDS.foret;
    const W = f.w, H = f.h;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.save();
    theme.paint(ctx, W, H, random([...(background || 'foret')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)));
    ctx.restore();

    // header: who, then the title
    const top = story ? 150 : 70;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.accent;
    ctx.font = `700 ${story ? 30 : 24}px ${SANS}`;
    const who = `VITRINE DE ${String(username || '').toUpperCase()}`;
    ctx.save();
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${story ? 8 : 6}px`;
    ctx.fillText(who, W / 2, top);
    ctx.restore();
    ctx.fillStyle = theme.ink;
    ctx.save();
    ctx.shadowColor = theme.ink.startsWith('#f') ?'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 18;
    const heading = fitFont(ctx, title || 'Ma vitrine', 600, DISPLAY, story ? 96 : 66, W - 140, 40);
    ctx.fillText(heading, W / 2, top + (story ? 95 : 64));
    ctx.restore();

    const box = story
        ? { x: 70, y: 380, w: W - 140, h: H - 380 - 250 }
        : { x: 60, y: 200, w: W - 120, h: H - 200 - 130 };
    const spots = place(layout, cards.length, box, story);
    // in a fan the middle cards sit on top
    const order = cards.map((c, i) => i);
    if (layout === 'eventail') order.sort((a, b) => Math.abs(spots[b].rot) - Math.abs(spots[a].rot));
    for (const i of order) drawCard(ctx, cards[i], images.get(cards[i].id), spots[i].x, spots[i].y, spots[i].w, spots[i].rot);

    signature(ctx, W, story ? H - 150 : H - 78, story ? 58 : 44, theme);
}

// Pictures come from Wikimedia Commons, which allows cross-origin drawing.
const cache = new Map();
export function loadCardImage(url) {
    if (!url) return Promise.resolve(null);
    if (!cache.has(url)) {
        cache.set(url, new Promise((resolve) => {
            const tryLoad = (src, retry) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => {
                    const original = src.replace('/thumb/', '/').replace(/\/\d+px-[^/]+$/, '');
                    if (retry && original !== src) tryLoad(original, false);
                    else resolve(null);
                };
                img.src = src;
            };
            tryLoad(url, true);
        }));
    }
    return cache.get(url);
}

export async function loadFonts() {
    if (!document.fonts?.load) return;
    await Promise.all([
        document.fonts.load(`600 60px ${DISPLAY}`),
        document.fonts.load(`700 60px ${DISPLAY}`),
        document.fonts.load(`italic 500 40px ${DISPLAY}`),
        document.fonts.load(`700 30px ${SANS}`),
    ]).catch(() => {});
}
