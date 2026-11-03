// 1080×1920 promo video for Reels / TikTok / Shorts. Everything is a pure function of the time `t`
// (seconds) so promo/render.mjs can capture it frame by frame; open /promo.html to preview it live.
import { ArrowLeftRight, Brain, Crown, Gavel, Target, Trophy, Users } from 'lucide-react';
import { Card, CardBack } from '../components/Card.jsx';
import { RARITIES, TYPES } from '../game.jsx';
import CARDS from './cards.json';
import { ARENA, BOOSTER, RARITY_STEP, SCENES } from './timeline.js';

const W = 1080, H = 1920;
const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const WALL = CARDS.filter((c) => c.role === 'wall');
const FAN = [25043, 10174, 618, 619, 23945].map((id) => byId[id]); // Monstera, Phyllobates, Amanite (center), Cèpe, Dionée
const PACK = [16934, 21839, 713, 24145, 662, 618].map((id) => byId[id]); // last one = Amanite tue-mouches, ✦ secret
const LADDER = [30056, 17383, 10164, 25043, 619, 1916].map((id) => byId[id]); // common→secret
const DUEL = [byId[10174], byId[1411]]; // Phyllobates terribilis vs Lion

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const out = (x) => 1 - (1 - x) ** 3;
const inOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const back = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const RAINBOW = 'linear-gradient(90deg, #ff5fd2, #ffd36e, #7dffb0, #6ec8ff, #c18bff)';
const GOLD = 'linear-gradient(180deg, #fff3c4 0%, #f4d88f 40%, #e9c46a 60%, #b8862f 100%)';

function Abs({ x = 0, y = 0, w, style, children }) {
    return <div style={{ position: 'absolute', left: x, top: y, width: w, ...style }}>{children}</div>;
}

/** A card of width w whose centre sits at (cx, cy). `flip` 0 → back, 1 → front (horizontal squash). */
function PCard({ card, w, cx, cy, rot = 0, scale = 1, opacity = 1, flip = 1, z, glow, extra = '' }) {
    const front = flip >= 0.5;
    const sx = Math.max(0.02, Math.abs(Math.cos(flip * Math.PI)));
    return (
        <div style={{
            position: 'absolute', left: cx - w / 2, top: cy - (w * 1.4) / 2, width: w, opacity, zIndex: z,
            transform: `${extra} rotate(${rot}deg) scale(${scale}) scaleX(${sx})`,
            filter: glow ? `drop-shadow(0 0 ${glow}px ${glow > 0 ? 'rgb(255 95 210 / 0.9)' : 'transparent'})` : 'drop-shadow(0 24px 40px rgb(0 0 0 / 0.55))',
        }}>
            {front ? <Card card={card} /> : <CardBack />}
        </div>
    );
}

function Rays({ t, color = '#e9c46a', rainbow = false, opacity = 1, size = 1900, cx = W / 2, cy = H / 2 }) {
    const bg = rainbow
        ? 'repeating-conic-gradient(from 0deg, #ff5fd255 0deg 6deg, transparent 6deg 15deg, #6ec8ff44 15deg 21deg, transparent 21deg 30deg, #ffd36e44 30deg 36deg, transparent 36deg 45deg)'
        : `repeating-conic-gradient(from 0deg, ${color}40 0deg 7deg, transparent 7deg 18deg)`;
    return (
        <div style={{
            position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, opacity,
            background: bg, transform: `rotate(${t * 14}deg)`, borderRadius: '50%',
            WebkitMaskImage: 'radial-gradient(circle, black 8%, transparent 62%)', maskImage: 'radial-gradient(circle, black 8%, transparent 62%)',
        }} />
    );
}

function Sparkles({ t, n = 26, color = '#fff', seed = 1, area = [0, 0, W, H] }) {
    const dots = [];
    for (let i = 0; i < n; i++) {
        const r = (k) => { const s = Math.sin((i + 1) * 12.9898 * (k + seed) + seed * 78.233) * 43758.5453; return s - Math.floor(s); };
        const x = area[0] + r(1) * (area[2] - area[0]);
        const y = area[1] + r(2) * (area[3] - area[1]) - ((t * (30 + r(3) * 60)) % 260);
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (2 + r(4) * 3) + i));
        const s = 4 + r(5) * 9;
        dots.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: color, opacity: tw, boxShadow: `0 0 ${s * 2}px ${color}` }} />);
    }
    return <>{dots}</>;
}

/** Headline whose words rise one after another. */
function Title({ t, lines, y, size = 112, delay = 0, gap = 0.07, align = 'center', font = 'display' }) {
    let k = 0;
    return (
        <Abs x={60} y={y} w={W - 120} style={{ textAlign: align }}>
            {lines.map((line, li) => (
                <div key={li} style={{
                    fontFamily: font === 'display' ? 'Playfair Display, serif' : 'Plus Jakarta Sans, sans-serif',
                    fontWeight: font === 'display' ? 800 : 800, fontSize: line.size || size, lineHeight: 1.04, letterSpacing: '-0.015em',
                    color: '#f3f7f1', textShadow: '0 6px 30px rgb(0 0 0 / 0.55)',
                }}>
                    {line.words.map((w, wi) => {
                        const p = out(prog(t, delay + k++ * gap, delay + k * gap + 0.45));
                        const style = w.gold
                            ? { background: GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', fontStyle: 'italic' }
                            : w.rainbow ? { background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: w.color };
                        return (
                            <span key={wi} style={{ display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 60}px)`, ...style }}>
                                {w.text}
                            </span>
                        );
                    })}
                </div>
            ))}
        </Abs>
    );
}
const words = (s, opts = {}) => ({ words: s.split(' ').map((text) => ({ text, ...opts })), ...('size' in opts ? { size: opts.size } : {}) });

function Kicker({ t, text, y, delay = 0, color = '#a8f0c6' }) {
    const p = out(prog(t, delay, delay + 0.5));
    return (
        <Abs x={0} y={y} w={W} style={{ textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 34, letterSpacing: '0.32em', color, textTransform: 'uppercase' }}>{text}</span>
        </Abs>
    );
}

function LeafLogo({ size }) {
    return (
        <svg viewBox="0 0 40 40" width={size} height={size} style={{ filter: 'drop-shadow(0 0 30px rgb(79 209 139 / 0.6))' }}>
            <defs>
                <linearGradient id="promo-leaf" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#1f8a4f" /><stop offset="0.6" stopColor="#4fd18b" /><stop offset="1" stopColor="#c8f7d9" />
                </linearGradient>
            </defs>
            <path d="M7 33C5 18 15 6 34 5c1 19-10 30-25 29z" fill="url(#promo-leaf)" />
            <path d="M8 32C14 24 20 17 29 10" stroke="#05130d" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.65" />
            <path d="M15 24l-1-6M19 20l4 0M22 16l-1-4" stroke="#05130d" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
        </svg>
    );
}

// ── scenes (t = seconds since the scene started) ────────────────────────────────────────────

function Hook({ t }) {
    return (
        <>
            <Rays t={t} opacity={0.5 * out(prog(t, 0.6, 1.6))} cy={1250} />
            <Kicker t={t} text="Le jeu de cartes nature" y={300} delay={0.05} />
            <Title t={t} y={370} delay={0.2} lines={[words('Collectionne'), words('le vivant.', { gold: true })]} size={132} />
            {FAN.map((c, i) => {
                const d = i - 2;
                const p = back(prog(t, 0.55 + Math.abs(d) * 0.1, 1.25 + Math.abs(d) * 0.1));
                const breathe = Math.sin(t * 1.6 + i) * 1.5;
                return (
                    <PCard key={c.id} card={c} w={380} z={10 - Math.abs(d)}
                        cx={W / 2 + d * 158 * p} cy={lerp(2300, 1230 + Math.abs(d) * 46, p)}
                        rot={d * 11 * p + breathe} scale={d === 0 ? 1.08 : 1} />
                );
            })}
        </>
    );
}

function Count({ t }) {
    const n = Math.round(60106 * out(prog(t, 0.3, 1.9)));
    const cols = 4, cw = 300, gap = 26;
    const kinds = ['mammal', 'bird', 'fish', 'arthropod', 'plant', 'tree', 'fungus', 'alga', 'bacteria', 'virus', 'fossil', 'marine', 'aquatic', 'terrestrial', 'reptile', 'mold', 'mineral'];
    return (
        <>
            <div style={{ position: 'absolute', inset: -400, transform: `rotate(-14deg) translateY(${-t * 150}px)`, opacity: 0.55 }}>
                {WALL.map((c, i) => {
                    const col = i % cols, row = Math.floor(i / cols);
                    return (
                        <div key={c.id} style={{ position: 'absolute', left: 260 + col * (cw + gap), top: 120 + row * (cw * 1.4 + gap) + (col % 2) * 180, width: cw }}>
                            <Card card={c} />
                        </div>
                    );
                })}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 45% at 50% 48%, rgb(5 19 13 / 0.94), rgb(5 19 13 / 0.6) 70%, rgb(5 19 13 / 0.3))' }} />
            <Kicker t={t} text="Des espèces bien réelles" y={600} delay={0.1} />
            <Abs x={0} y={650} w={W} style={{ textAlign: 'center' }}>
                <div style={{
                    fontFamily: 'Playfair Display', fontWeight: 900, fontSize: 250, lineHeight: 1.1, letterSpacing: '-0.02em',
                    background: GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                    filter: 'drop-shadow(0 10px 40px rgb(233 196 106 / 0.35))', fontVariantNumeric: 'tabular-nums',
                }}>{n.toLocaleString('fr-FR')}</div>
            </Abs>
            <Title t={t} y={950} delay={0.5} size={84} lines={[words('cartes à découvrir')]} />
            <Abs x={90} y={1130} w={W - 180} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 22 }}>
                {kinds.map((k, i) => {
                    const ty = TYPES[k];
                    const p = back(prog(t, 1.1 + i * 0.07, 1.45 + i * 0.07));
                    return (
                        <span key={k} className="nd-type-icon" style={{ '--type': ty.color, width: 100, height: 100, transform: `scale(${p})`, opacity: clamp(p * 2) }}>
                            <ty.Icon style={{ width: 56, height: 56 }} />
                        </span>
                    );
                })}
            </Abs>
            <Abs x={0} y={1400} w={W} style={{ textAlign: 'center', opacity: out(prog(t, 2.2, 2.7)) }}>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 600, fontSize: 40, color: '#a3b5a9' }}>
                    Animaux, plantes, champignons, bactéries, fossiles…<br />tirés de Wikipédia
                </span>
            </Abs>
        </>
    );
}

function PackArt({ w, tear, t }) {
    // Booster pack (same look as the site's), cut in two when it tears open.
    const h = w * 1.6, cut = 0.13;
    const art = (
        <div className="nd-pack" style={{ width: w, borderRadius: 26 }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
                <LeafLogo size={120} />
                <div style={{ fontFamily: 'Playfair Display', fontWeight: 700, fontSize: 78, color: '#f4d88f', lineHeight: 1 }}>NatureDex</div>
                <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 22, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgb(255 255 255 / 0.85)' }}>Booster · 6 cartes</div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', left: `${lerp(-60, 160, (t * 0.45) % 1)}%`, background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.35), transparent)', transform: 'rotate(20deg)' }} />
        </div>
    );
    return (
        <div style={{ position: 'relative', width: w, height: h }}>
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${cut * 100}% 0 0 0)` }}>{art}</div>
            <div style={{
                position: 'absolute', inset: 0, clipPath: `inset(0 0 ${(1 - cut) * 100}% 0)`,
                transform: `translate(${tear * 260}px, ${-tear * 520}px) rotate(${tear * 38}deg)`, opacity: 1 - prog(tear, 0.6, 1),
            }}>{art}</div>
        </div>
    );
}

function Booster({ t }) {
    const B = BOOSTER;
    const drop = back(prog(t, B.drop, B.drop + 0.6));
    const wiggle = t > 0.7 && t < B.tear ? Math.sin(t * 38) * 4 * prog(t, 0.7, B.tear) : 0;
    const tear = out(prog(t, B.tear, B.tear + 0.5));
    const deal = inOut(prog(t, B.deal, B.deal + 0.6));
    const reveal = out(prog(t, B.reveal, B.reveal + 0.7));
    const flash = Math.max(prog(t, B.tear - 0.05, B.tear) * (1 - prog(t, B.tear, B.tear + 0.35)), prog(t, B.reveal - 0.05, B.reveal) * (1 - prog(t, B.reveal, B.reveal + 0.35)));
    const cw = 300, gx = 330, gy = 450;
    return (
        <>
            <Rays t={t} rainbow opacity={reveal} cy={1000} size={2200} />
            {reveal > 0 && <Sparkles t={t} n={34} color="#ffd6f4" seed={3} area={[60, 500, 1020, 1700]} />}
            <div style={{ opacity: 1 - out(prog(t, B.suspense + 0.5, B.reveal)) }}>
                <Kicker t={t} text="Chaque jour" y={290} delay={0} />
                <Title t={t} y={345} delay={0.1} size={112} lines={[words('Ouvre des'), words('boosters', { gold: true })]} />
            </div>
            {deal < 1 && (
                <div style={{
                    position: 'absolute', left: W / 2 - 240, top: lerp(-900, 1100 - 384, drop) + deal * 700, opacity: 1 - deal,
                    transform: `rotate(${wiggle}deg) scale(${1 + prog(t, 0.7, B.tear) * 0.05})`,
                    filter: `drop-shadow(0 0 ${30 + prog(t, 0.7, B.tear) * 60}px rgb(233 196 106 / 0.7))`,
                }}>
                    <PackArt w={480} tear={tear} t={t} />
                </div>
            )}
            {PACK.map((c, i) => {
                const col = i % 3, row = Math.floor(i / 3);
                const isSecret = i === 5;
                const fx = W / 2 + (col - 1) * gx, fy = 1090 + (row - 0.5) * gy;
                const f = isSecret ? inOut(prog(t, B.reveal, B.reveal + B.flipLen)) : inOut(prog(t, B.flip0 + i * B.flipGap, B.flip0 + i * B.flipGap + B.flipLen));
                const shake = isSecret && t > B.suspense && t < B.reveal ? Math.sin(t * 60) * 5 * prog(t, B.suspense, B.reveal) : 0;
                const glow = isSecret && t > B.suspense ? 20 + 40 * prog(t, B.suspense, B.reveal) : 0;
                // after the reveal the secret card takes the stage and the others step back
                const cx = isSecret ? lerp(fx, W / 2, reveal) : fx;
                const cy = isSecret ? lerp(fy, 980, reveal) : fy + reveal * 60;
                return (
                    <PCard key={c.id} card={c} w={cw} flip={f} glow={glow} z={isSecret ? 20 : 1}
                        cx={lerp(W / 2, cx, deal)} cy={lerp(1100, cy, deal)}
                        rot={lerp((i - 2.5) * 6, 0, deal) + shake + (isSecret ? Math.sin(t * 1.4) * 2 * reveal : 0)}
                        scale={isSecret ? lerp(1, 2.05, back(prog(t, B.reveal, B.reveal + 0.7))) : lerp(0.5, 1, deal) * (1 - reveal * 0.25)}
                        opacity={(deal > 0 ? 1 : 0) * (isSecret ? 1 : 1 - reveal * 0.75)} />
                );
            })}
            <Abs x={0} y={1640} w={W} style={{ textAlign: 'center', opacity: reveal, transform: `scale(${lerp(0.7, 1, back(prog(t, B.reveal + 0.15, B.reveal + 0.75)))})` }}>
                <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 64, letterSpacing: '0.18em', background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 24px rgb(255 95 210 / 0.6))' }}>
                    ✦ CARTE SECRÈTE ✦
                </div>
            </Abs>
            <Abs x={0} y={320} w={W} style={{ textAlign: 'center', opacity: out(prog(t, B.reveal + 0.4, B.reveal + 0.9)) }}>
                <div style={{ fontFamily: 'Playfair Display', fontWeight: 800, fontSize: 92, color: '#fff', textShadow: '0 6px 30px rgb(0 0 0 / 0.6)' }}>Jackpot !</div>
            </Abs>
            <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash * 0.6, zIndex: 50 }} />
        </>
    );
}

function Rarities({ t }) {
    const landed = Math.floor(clamp((t - 0.35) / RARITY_STEP + 1e-6, -1, 5.999));
    const r = landed >= 0 ? RARITIES[LADDER[landed].rarity] : null;
    const pop = landed >= 0 ? back(prog(t, 0.35 + landed * RARITY_STEP, 0.35 + landed * RARITY_STEP + 0.3)) : 0;
    const secret = landed === 5;
    return (
        <>
            <Rays t={t} color={r?.color || '#e9c46a'} opacity={0.35 + (secret ? 0.4 : 0)} rainbow={secret} cy={1080} />
            <Kicker t={t} text="Les stars du vivant sont rares" y={300} delay={0} color="#a3b5a9" />
            <Title t={t} y={360} delay={0.05} size={104} lines={[words('6 niveaux'), words('de rareté', { gold: true })]} />
            {LADDER.map((c, i) => {
                const p = back(prog(t, 0.35 + i * RARITY_STEP, 0.35 + i * RARITY_STEP + 0.4));
                const d = i - 2.5;
                return (
                    <PCard key={c.id} card={c} w={300} z={i}
                        cx={W / 2 + d * 138} cy={lerp(2300, 1110 + Math.abs(d) ** 2 * 14, p)}
                        rot={d * 7 * p} scale={i === landed ? 1.12 : 1} opacity={p > 0 ? 1 : 0} />
                );
            })}
            {r && (
                <Abs x={0} y={1440} w={W} style={{ textAlign: 'center', transform: `scale(${lerp(0.6, 1, pop)})` }}>
                    <span style={{
                        fontFamily: 'Playfair Display', fontWeight: 800, fontSize: 108,
                        ...(secret ? { background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: r.color }),
                        filter: `drop-shadow(0 0 30px ${r.color}88)`,
                    }}>{r.symbol} {r.label}</span>
                </Abs>
            )}
        </>
    );
}

function HpBar({ x, y, w, hp, color }) {
    return (
        <Abs x={x} y={y} w={w}>
            <div style={{ height: 30, borderRadius: 15, background: 'rgb(255 255 255 / 0.12)', overflow: 'hidden', boxShadow: '0 0 0 2px rgb(255 255 255 / 0.18) inset' }}>
                <div style={{ height: '100%', width: `${hp * 100}%`, borderRadius: 15, background: hp > 0.35 ? color : '#e76f51' }} />
            </div>
        </Abs>
    );
}

function Arena({ t }) {
    const A = ARENA;
    const inL = out(prog(t, 0, 0.5)), inR = out(prog(t, 0.1, 0.6));
    const vs = back(prog(t, A.vs, A.vs + 0.35));
    const lunge1 = Math.sin(Math.PI * prog(t, A.hit1 - 0.2, A.hit1 + 0.15)) * 90;
    const lunge2 = Math.sin(Math.PI * prog(t, A.hit2 - 0.2, A.hit2 + 0.15)) * 90;
    const hpL = 1 - 0.42 * out(prog(t, A.hit2, A.hit2 + 0.3));
    const hpR = 1 - 0.55 * out(prog(t, A.hit1, A.hit1 + 0.3)) - 0.45 * out(prog(t, A.ko, A.ko + 0.3));
    const ko = out(prog(t, A.ko, A.ko + 0.5));
    const shakeR = t > A.hit1 && t < A.hit1 + 0.25 ? Math.sin(t * 90) * 10 : t > A.ko && t < A.ko + 0.25 ? Math.sin(t * 90) * 14 : 0;
    const shakeL = t > A.hit2 && t < A.hit2 + 0.25 ? Math.sin(t * 90) * 10 : 0;
    const dmg = (at, x, value) => {
        const p = prog(t, at, at + 0.8);
        if (p <= 0 || p >= 1) return null;
        return (
            <Abs x={x - 150} y={720 - out(p) * 120} w={300} style={{ textAlign: 'center', opacity: 1 - prog(p, 0.6, 1), zIndex: 30 }}>
                <span style={{ fontFamily: 'Playfair Display', fontWeight: 900, fontSize: 110, color: '#ff6b5a', WebkitTextStroke: '4px #fff', textShadow: '0 8px 30px rgb(0 0 0 / 0.6)' }}>-{value}</span>
            </Abs>
        );
    };
    return (
        <>
            <Rays t={t} color="#e76f51" opacity={0.3} cy={1000} />
            <Kicker t={t} text="Arène · saisons mensuelles" y={290} delay={0} color="#f4d88f" />
            <Title t={t} y={345} delay={0.05} size={108} lines={[words('Affronte'), words('tes amis', { gold: true })]} />
            <PCard card={DUEL[0]} w={420} cx={lerp(-300, 285, inL) + lunge1 + shakeL} cy={1010} rot={-4} z={2} />
            <PCard card={DUEL[1]} w={420} cx={lerp(W + 300, 795, inR) - lunge2 + shakeR} cy={1010 + ko * 40} rot={4 + ko * 10} opacity={1 - ko * 0.55} z={1} />
            <Abs x={W / 2 - 120} y={890} w={240} style={{ textAlign: 'center', transform: `scale(${vs})`, opacity: clamp(vs) * (1 - ko), zIndex: 10 }}>
                <span style={{ fontFamily: 'Playfair Display', fontWeight: 900, fontStyle: 'italic', fontSize: 150, background: GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 6px 24px rgb(0 0 0 / 0.8))' }}>VS</span>
            </Abs>
            {dmg(A.hit1, 795, 96)}
            {dmg(A.hit2, 285, 74)}
            {dmg(A.ko, 795, 81)}
            <HpBar x={85} y={1330} w={400} hp={hpL} color="#4fd18b" />
            <HpBar x={595} y={1330} w={400} hp={Math.max(0, hpR)} color="#4fd18b" />
            <Abs x={0} y={1440} w={W} style={{ textAlign: 'center', opacity: ko, transform: `scale(${lerp(0.6, 1, back(prog(t, A.ko, A.ko + 0.5)))})` }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 22, padding: '20px 44px', borderRadius: 999, background: 'linear-gradient(135deg, #fbe7b0, #e9c46a 45%, #c99a3c)', color: '#1d1606', boxShadow: '0 16px 50px -10px rgb(233 196 106 / 0.9)' }}>
                    <Crown style={{ width: 64, height: 64 }} strokeWidth={2.4} />
                    <span style={{ fontFamily: 'Playfair Display', fontWeight: 800, fontSize: 64 }}>Champion de saison</span>
                </div>
            </Abs>
        </>
    );
}

const FEATURES = [
    [ArrowLeftRight, 'Échanges', '#4ea8ff'], [Gavel, 'Enchères', '#e9c46a'], [Brain, 'Quiz nature', '#b46bff'],
    [Users, 'Amis & messages', '#4fd18b'], [Trophy, 'Trophées', '#ffc53d'], [Target, 'Défis du jour', '#e76f51'],
];

function Features({ t }) {
    return (
        <>
            <Sparkles t={t} n={22} color="#a8f0c6" seed={7} />
            <Title t={t} y={400} delay={0} size={112} lines={[words('Et bien'), words('plus encore', { gold: true })]} />
            <Abs x={90} y={760} w={W - 180} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 30 }}>
                {FEATURES.map(([Icon, label, color], i) => {
                    const p = back(prog(t, 0.3 + i * 0.16, 0.7 + i * 0.16));
                    return (
                        <div key={label} className="nd-glass" style={{
                            display: 'flex', alignItems: 'center', gap: 34, padding: '22px 36px', borderRadius: 34,
                            opacity: clamp(p * 1.5), transform: `translateX(${(1 - p) * (i % 2 ? 300 : -300)}px)`,
                        }}>
                            <span style={{ display: 'grid', placeItems: 'center', width: 92, height: 92, borderRadius: 26, background: `${color}26`, color }}>
                                <Icon style={{ width: 54, height: 54 }} strokeWidth={2.2} />
                            </span>
                            <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 56, color: '#eef5ef' }}>{label}</span>
                        </div>
                    );
                })}
            </Abs>
        </>
    );
}

function Cta({ t }) {
    const logo = back(prog(t, 0.05, 0.6));
    const fade = (a) => out(prog(t, a, a + 0.45));
    return (
        <>
            <Rays t={t} opacity={0.6} cy={760} size={2000} />
            <Sparkles t={t} n={30} color="#f4d88f" seed={11} />
            {[byId[25043], byId[618], byId[10270]].map((c, i) => {
                const d = i - 1;
                const p = out(prog(t, 0.9 + i * 0.08, 1.5 + i * 0.08));
                return <PCard key={c.id} card={c} w={300} cx={W / 2 + d * 230} cy={lerp(2200, 1450 + Math.abs(d) * 40, p)} rot={d * 12} z={2 - Math.abs(d)} opacity={0.95} />;
            })}
            <Abs x={0} y={330} w={W} style={{ display: 'flex', justifyContent: 'center', transform: `scale(${logo})` }}>
                <LeafLogo size={190} />
            </Abs>
            <Abs x={0} y={540} w={W} style={{ textAlign: 'center', opacity: fade(0.25), transform: `translateY(${(1 - fade(0.25)) * 40}px)` }}>
                <div style={{ fontFamily: 'Playfair Display', fontWeight: 800, fontSize: 150, color: '#fff', lineHeight: 1, textShadow: '0 8px 40px rgb(0 0 0 / 0.6)' }}>NatureDex</div>
                <div style={{ marginTop: 26, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 46, color: '#a8f0c6' }}>Le vivant en cartes à collectionner</div>
            </Abs>
            <Abs x={0} y={850} w={W} style={{ textAlign: 'center', opacity: fade(0.55), transform: `scale(${lerp(0.8, 1, back(prog(t, 0.55, 1)))})` }}>
                <span className="nd-btn" style={{ display: 'inline-block', padding: '30px 70px', borderRadius: 999, fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 60 }}>
                    Joue gratuitement
                </span>
                <div style={{ marginTop: 34, fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 84, color: '#f4d88f', letterSpacing: '-0.01em', textShadow: '0 4px 24px rgb(0 0 0 / 0.6)' }}>naturedex.fr</div>
                <div style={{ marginTop: 10, fontFamily: 'Plus Jakarta Sans', fontWeight: 600, fontSize: 38, color: '#c9d6cd' }}>10 boosters offerts à l'inscription</div>
            </Abs>
        </>
    );
}

const COMPONENTS = { hook: Hook, count: Count, booster: Booster, rarities: Rarities, arena: Arena, features: Features, cta: Cta };
const FADE = 0.28;

export default function Promo({ t }) {
    // holographic foil sweeps on its own (it follows the pointer on the site)
    const foil = { '--pmx': `${50 + Math.sin(t * 1.3) * 45}%`, '--pmy': `${50 + Math.cos(t * 0.9) * 40}%` };
    return (
        <div className="nd-promo" style={{
            position: 'relative', width: W, height: H, overflow: 'hidden', ...foil,
            background: 'radial-gradient(900px 700px at 85% 5%, rgb(46 140 90 / 0.28), transparent 60%), radial-gradient(800px 700px at 0% 55%, rgb(233 196 106 / 0.10), transparent 60%), radial-gradient(1000px 800px at 50% 110%, rgb(30 110 80 / 0.35), transparent 60%), #05130d',
        }}>
            {SCENES.map((s) => {
                if (t < s.start - 0.01 || t > s.end + FADE) return null;
                const last = s === SCENES.at(-1);
                const o = Math.min(s.start === 0 ? 1 : prog(t, s.start, s.start + FADE), last ? 1 : 1 - prog(t, s.end, s.end + FADE));
                const S = COMPONENTS[s.key];
                return (
                    <div key={s.key} style={{ position: 'absolute', inset: 0, opacity: o, transform: `scale(${lerp(1, 1.04, prog(t, s.end, s.end + FADE))})` }}>
                        <S t={t - s.start} />
                    </div>
                );
            })}
        </div>
    );
}
