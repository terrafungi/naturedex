// Game audio, synthesised with the Web Audio API (no audio files to download): short sound
// effects (recipes of oscillators and filtered noise through a shared reverb), a generative
// ambient soundtrack, and phone vibrations on the big moments. The three settings are remembered
// in localStorage; browsers only allow audio after a first tap, so the context is created lazily
// and resumed on the first pointer/key event.
import { useSyncExternalStore } from 'react';

const DEFAULTS = { sound: true, music: true, vibrate: true };
const read = (k) => { try { const v = localStorage.getItem(`nd-${k}`); return v ? v === 'on' : DEFAULTS[k]; } catch { return DEFAULTS[k]; } };
let prefs = typeof window === 'undefined' ? DEFAULTS : { sound: read('sound'), music: read('music'), vibrate: read('vibrate') };
const listeners = new Set();

export function setPref(k, v) {
    prefs = { ...prefs, [k]: v };
    try { localStorage.setItem(`nd-${k}`, v ? 'on' : 'off'); } catch { /* private mode */ }
    if (k === 'sound' && !v) stopAll();
    if (k === 'music') music.refresh();
    listeners.forEach((l) => l());
}
export const usePrefs = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => prefs, () => DEFAULTS);
// Android vibrates; iPhones ignore navigator.vibrate (Safari has no vibration API).
export const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const buzz = (pattern) => { if (prefs.vibrate && canVibrate && pattern) try { navigator.vibrate(pattern); } catch { /* blocked */ } };

let ctx, master, wet, noiseBuf, musicBus;
const live = new Set(); // sound-effect sources still playing, so long sounds (charge) can be cut

function context() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        comp.connect(ctx.destination);
        master = ctx.createGain(); master.gain.value = 0.9;
        master.connect(comp);
        musicBus = ctx.createGain(); musicBus.gain.value = 0;
        musicBus.connect(comp);
        // small hall: exponentially decaying stereo noise as the impulse response
        const len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
        }
        const verb = ctx.createConvolver(); verb.buffer = ir;
        wet = ctx.createGain(); wet.gain.value = 0.32;
        wet.connect(verb).connect(master);
        // the music gets its own, longer reverb so it sits further back
        const len2 = ctx.sampleRate * 4, ir2 = ctx.createBuffer(2, len2, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = ir2.getChannelData(c);
            for (let i = 0; i < len2; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len2) ** 2.5;
        }
        const verb2 = ctx.createConvolver(); verb2.buffer = ir2;
        musicWet = ctx.createGain(); musicWet.gain.value = 0.9;
        musicWet.connect(verb2).connect(musicBus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
}
let musicWet;
function audio() {
    const c = prefs.sound ? context() : null;
    if (c?.state === 'suspended') c.resume();
    return c;
}
if (typeof window !== 'undefined') {
    const unlock = () => { if (ctx?.state === 'suspended') ctx.resume(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
}

function stopAll() {
    for (const s of live) { try { s.stop(); } catch { /* already stopped */ } }
    live.clear();
}
function track(src, end) {
    live.add(src);
    src.onended = () => live.delete(src);
    src.start(ctx.currentTime + Math.max(0, end.start));
    src.stop(ctx.currentTime + end.start + end.dur + 0.05);
}

// Envelope gain node: quick attack, exponential decay to silence after `dur`.
function envelope(start, dur, gain, attack = 0.005, reverb = 0.3, pan = 0) {
    const t0 = ctx.currentTime + start;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(master); } else g.connect(master);
    if (reverb) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s).connect(wet); }
    return g;
}

/** One oscillator note. `to` = pitch at the end (glide). */
function tone({ f, to, start = 0, dur = 0.3, type = 'sine', gain = 0.2, attack, reverb, pan, detune = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    const t0 = ctx.currentTime + start;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    o.connect(envelope(start, dur, gain, attack, reverb, pan));
    track(o, { start, dur });
}

/** Filtered noise burst; `sweep` moves the filter frequency over the duration. */
function noise({ start = 0, dur = 0.2, filter = 'bandpass', f = 2000, sweep, q = 1, gain = 0.2, attack, reverb, pan }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = filter; bq.Q.value = q;
    const t0 = ctx.currentTime + start;
    bq.frequency.setValueAtTime(f, t0);
    if (sweep) bq.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    src.connect(bq).connect(envelope(start, dur, gain, attack, reverb, pan));
    track(src, { start, dur });
}

/** Bell: sine plus inharmonic partials that die faster. */
function bell(f, start = 0, gain = 0.12, dur = 1.4, pan = 0) {
    tone({ f, start, dur, gain, reverb: 0.6, pan });
    tone({ f: f * 2.76, start, dur: dur * 0.4, gain: gain * 0.35, reverb: 0.6, pan });
    tone({ f: f * 5.4, start, dur: dur * 0.2, gain: gain * 0.15, reverb: 0.6, pan });
}
const boom = (start = 0, gain = 0.6, f = 120) => {
    tone({ f, to: 38, start, dur: 0.7, gain, reverb: 0.2 });
    noise({ start, dur: 0.25, filter: 'lowpass', f: 900, sweep: 120, gain: gain * 0.5, reverb: 0.2 });
};
const sparkle = (start, n, base = 2200, spread = 2600, gain = 0.035) => {
    for (let i = 0; i < n; i++) tone({ f: base + ((i * 977) % spread), start: start + i * 0.045, dur: 0.25, gain, reverb: 0.8, pan: ((i % 5) - 2) / 2.5 });
};
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// `vib`: vibration pattern (ms), or a function of the same arguments returning one
function play(fn, vib) {
    return (...a) => {
        buzz(typeof vib === 'function' ? vib(...a) : vib);
        if (audio()) fn(...a);
    };
}
// heartbeats of the legendary/secret suspense: same timing as the sound
function heartbeats(d) {
    const out = [1, 49];
    let t = 0.05, gap = 0.55;
    while (t < d - 0.2) { out.push(45, 115, 35, Math.round((gap - 0.195) * 1000)); t += gap; gap = Math.max(0.28, gap * 0.82); }
    return out;
}
const REVEAL_VIB = { rare: 25, epic: [40, 60, 40], legendary: [70, 50, 70, 50, 160], secret: [100, 60, 100, 60, 100, 60, 400] };

export const sfx = {
    tap: play(() => tone({ f: 900, to: 600, dur: 0.06, type: 'triangle', gain: 0.08, reverb: 0 })),

    // booster torn open: paper rip + low thump + a little sparkle
    tear: play(() => {
        noise({ dur: 0.38, f: 1800, sweep: 6500, q: 0.8, gain: 0.45, attack: 0.01, reverb: 0.15 });
        noise({ start: 0.05, dur: 0.22, filter: 'highpass', f: 3000, gain: 0.2, reverb: 0.1 });
        boom(0.02, 0.35, 90);
        sparkle(0.18, 6, 2600, 2000, 0.03);
    }, 25),

    // card tossed aside / dealt: airy swish
    swish: play((pan = -0.3) => noise({ dur: 0.28, f: 700, sweep: 3200, q: 1.4, gain: 0.4, attack: 0.06, reverb: 0.1, pan })),

    // card turned over: paper snap
    flip: play(() => {
        noise({ dur: 0.07, filter: 'highpass', f: 2500, gain: 0.5, reverb: 0.1 });
        tone({ f: 1500, to: 900, dur: 0.05, type: 'triangle', gain: 0.12, reverb: 0 });
    }),

    // suspense before a big pull (rare and up): riser, heartbeat from legendary, drum roll for secret
    charge: play((level, ms) => {
        const d = ms / 1000;
        noise({ dur: d, f: 400, sweep: 5000 + level * 1000, q: 2, gain: 0.05 + level * 0.03, attack: d * 0.9, reverb: 0.4 });
        tone({ f: hz(48 + level), to: hz(60 + level * 2), dur: d, type: 'sawtooth', gain: 0.015 + level * 0.008, attack: d * 0.85, reverb: 0.5 });
        if (level >= 3) tone({ f: hz(55), to: hz(67), dur: d, type: 'triangle', gain: 0.05, attack: d * 0.8, reverb: 0.5, detune: 8 });
        if (level >= 4) {
            // heartbeats speeding up
            let t = 0.05, gap = 0.55;
            while (t < d - 0.2) { tone({ f: 70, to: 45, start: t, dur: 0.18, gain: 0.35, reverb: 0 }); tone({ f: 62, to: 40, start: t + 0.16, dur: 0.16, gain: 0.25, reverb: 0 }); t += gap; gap = Math.max(0.28, gap * 0.82); }
        }
        if (level >= 5) {
            for (let t = d * 0.35; t < d - 0.05; t += 0.06) noise({ start: t, dur: 0.08, filter: 'lowpass', f: 500, gain: 0.05 + 0.2 * (t / d), reverb: 0.2 });
        }
    }, (level, ms) => level >= 4 && heartbeats(ms / 1000)),

    // a secret's seal cracks (step 1..3): glassy snap, thump and a rising chime, bigger each time
    crack: play((step) => {
        noise({ dur: 0.1, filter: 'highpass', f: 2800, gain: 0.55, reverb: 0.3 });
        noise({ start: 0.02, dur: 0.4, f: 2500 + step * 900, sweep: 9000, q: 4, gain: 0.12 + step * 0.04, reverb: 0.6 });
        boom(0, 0.3 + step * 0.15, 80 + step * 20);
        bell(hz(79 + step * 4), 0.04, 0.09, 1.4, (step - 2) * 0.4);
        sparkle(0.08, 3 + step * 3, 2600, 3000, 0.03);
    }, (step) => [50 + step * 40]),

    // the card shows its face: one recipe per rarity, each bigger than the last
    reveal: play((rarity) => {
        switch (rarity) {
        case 'uncommon':
            bell(hz(76), 0, 0.12, 1); bell(hz(81), 0.09, 0.12, 1.2);
            break;
        case 'rare':
            [79, 83, 86, 91].forEach((m, i) => bell(hz(m), i * 0.07, 0.11, 1.4, i % 2 ? 0.3 : -0.3));
            sparkle(0.2, 8);
            break;
        case 'epic':
            boom(0, 0.45, 100);
            [69, 72, 76, 79, 84].forEach((m, i) => bell(hz(m), 0.05 + i * 0.08, 0.11, 1.8, (i - 2) / 3));
            [57, 64, 69].forEach((m) => tone({ f: hz(m), dur: 2.2, type: 'triangle', gain: 0.06, attack: 0.15, reverb: 0.7, detune: 6 }));
            sparkle(0.3, 12);
            break;
        case 'legendary':
            boom(0, 0.9);
            noise({ dur: 1.6, filter: 'highpass', f: 5000, gain: 0.12, attack: 0.01, reverb: 0.5 }); // cymbal
            // brass-like fanfare: G – C – E – G, then a held C major chord
            [[67, 0], [72, 0.12], [76, 0.24]].forEach(([m, s]) => tone({ f: hz(m), start: 0.05 + s, dur: 0.18, type: 'sawtooth', gain: 0.12, reverb: 0.4 }));
            [60, 64, 67, 72, 79].forEach((m, i) => tone({ f: hz(m), start: 0.41, dur: 2.4, type: i < 3 ? 'sawtooth' : 'triangle', gain: 0.07, attack: 0.04, reverb: 0.6, detune: i * 3 - 6 }));
            [84, 88, 91, 96].forEach((m, i) => bell(hz(m), 0.45 + i * 0.09, 0.09, 1.8, i % 2 ? 0.4 : -0.4));
            sparkle(0.5, 16, 2400, 3200, 0.04);
            break;
        case 'secret':
            // the seal shatters: a shower of glass before the rainbow
            for (let i = 0; i < 14; i++) noise({ start: i * 0.025, dur: 0.12, filter: 'highpass', f: 3000 + (i * 733) % 5000, gain: 0.18, reverb: 0.5, pan: Math.sin(i * 1.7) * 0.7 });
            boom(0, 0.8, 140); boom(0.12, 0.4, 70);
            noise({ dur: 2.4, filter: 'highpass', f: 4500, gain: 0.16, attack: 0.01, reverb: 0.6 });
            // rainbow glissando: pentatonic run over two octaves, then a shimmering major-7 pad
            [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96].forEach((m, i) => bell(hz(m), 0.08 + i * 0.055, 0.08, 1.6, Math.sin(i) * 0.6));
            [48, 60, 64, 67, 71, 76].forEach((m, i) => {
                tone({ f: hz(m), start: 0.1, dur: 3.2, type: i ? 'triangle' : 'sine', gain: i ? 0.05 : 0.12, attack: 0.3, reverb: 0.8, detune: -7 });
                tone({ f: hz(m), start: 0.1, dur: 3.2, type: 'sine', gain: 0.04, attack: 0.3, reverb: 0.8, detune: 7 });
            });
            sparkle(0.6, 28, 2000, 4000, 0.04);
            break;
        default: // common: soft wooden pluck
            tone({ f: hz(72), dur: 0.3, type: 'triangle', gain: 0.3, reverb: 0.25 });
            tone({ f: hz(79), start: 0.04, dur: 0.25, type: 'sine', gain: 0.12, reverb: 0.25 });
        }
    }, (rarity) => REVEAL_VIB[rarity]),

    // « Nouveau ! » badge pops up
    newCard: play(() => { tone({ f: hz(84), to: hz(96), dur: 0.12, type: 'square', gain: 0.06, reverb: 0.3 }); bell(hz(96), 0.08, 0.12, 0.6); }),

    // seeds / nuggets / prize collected
    coin: play(() => { tone({ f: hz(83), dur: 0.09, type: 'square', gain: 0.1, reverb: 0.2 }); tone({ f: hz(88), start: 0.08, dur: 0.5, type: 'square', gain: 0.1, reverb: 0.3 }); }, 20),

    // garden: seed pressed into the soil, watering drops
    plant: play(() => { tone({ f: 140, to: 70, dur: 0.15, gain: 0.5, reverb: 0 }); noise({ start: 0.02, dur: 0.18, filter: 'lowpass', f: 1200, sweep: 300, gain: 0.15, reverb: 0.1 }); bell(hz(84), 0.12, 0.05, 0.5); }),
    water: play(() => [0, 0.09, 0.16, 0.27].forEach((s, i) => tone({ f: 700 + i * 180, to: 1500 + i * 250, start: s, dur: 0.08, gain: 0.09, reverb: 0.4, pan: (i % 2 ? 0.3 : -0.3) }))),

    // quiz
    correct: play(() => { bell(hz(76), 0, 0.12, 0.8); bell(hz(83), 0.1, 0.13, 1.1); }, 25),
    wrong: play(() => { tone({ f: 220, to: 150, dur: 0.35, type: 'sawtooth', gain: 0.16, reverb: 0.1 }); tone({ f: 233, to: 155, dur: 0.35, type: 'sawtooth', gain: 0.12, reverb: 0.1 }); }, [60, 40, 60]),

    // battle
    attack: play((pan) => noise({ dur: 0.18, f: 900, sweep: 3500, q: 1.2, gain: 0.5, attack: 0.03, reverb: 0.1, pan })),
    special: play((pan) => {
        noise({ dur: 0.45, f: 500, sweep: 6000, q: 3, gain: 0.18, attack: 0.08, reverb: 0.4, pan });
        [72, 76, 79, 84].forEach((m, i) => tone({ f: hz(m), start: 0.05 + i * 0.05, dur: 0.4, type: 'triangle', gain: 0.05, reverb: 0.6, pan }));
    }, 20),
    hit: play((mult = 1, pan = 0) => {
        const big = mult > 1;
        tone({ f: big ? 160 : 130, to: 45, dur: 0.25, gain: big ? 0.6 : 0.45, reverb: 0.1, pan });
        noise({ dur: big ? 0.2 : 0.12, filter: 'lowpass', f: big ? 4000 : 2500, sweep: 300, gain: big ? 0.45 : 0.3, reverb: 0.15, pan });
        if (big) noise({ start: 0.02, dur: 0.1, filter: 'highpass', f: 3500, gain: 0.2, reverb: 0.2, pan });
    }, (mult) => (mult > 1 ? 60 : 30)),
    heal: play((pan) => [72, 76, 79].forEach((m, i) => tone({ f: hz(m), start: i * 0.07, dur: 0.5, gain: 0.12, attack: 0.03, reverb: 0.6, pan }))),
    shield: play((pan) => { tone({ f: 880, dur: 0.6, type: 'triangle', gain: 0.2, reverb: 0.5, pan }); tone({ f: 1320, dur: 0.4, gain: 0.12, reverb: 0.5, pan }); }),
    debuff: play((pan) => tone({ f: 500, to: 180, dur: 0.4, type: 'triangle', gain: 0.08, reverb: 0.4, pan })),
    dodge: play((pan) => noise({ dur: 0.25, f: 3000, sweep: 800, q: 2, gain: 0.2, attack: 0.02, reverb: 0.2, pan })),
    ko: play((pan) => { tone({ f: 400, to: 60, dur: 0.7, type: 'sawtooth', gain: 0.08, reverb: 0.3, pan }); boom(0.15, 0.5, 90); }, 150),
    win: play(() => {
        [[67, 0], [72, 0.13], [76, 0.26], [79, 0.39]].forEach(([m, s]) => tone({ f: hz(m), start: s, dur: 0.2, type: 'sawtooth', gain: 0.07, reverb: 0.4 }));
        [60, 64, 67, 72, 76].forEach((m) => tone({ f: hz(m), start: 0.55, dur: 2, type: 'triangle', gain: 0.07, attack: 0.03, reverb: 0.6 }));
        boom(0.55, 0.4); sparkle(0.6, 14);
    }, [60, 60, 60, 60, 250]),
    lose: play(() => [[67, 0], [63, 0.3], [60, 0.6]].forEach(([m, s], i) => tone({ f: hz(m), to: i === 2 ? hz(58) : undefined, start: s, dur: i === 2 ? 1.2 : 0.35, type: 'triangle', gain: 0.16, reverb: 0.5 })), 300),

    stop: () => { if (ctx) stopAll(); if (canVibrate) try { navigator.vibrate(0); } catch { /* blocked */ } },
};

// Generative ambient soundtrack: slow Cmaj7 – Am7 – Fmaj7 – G chords on a warm pad, a soft wind
// bed, a few pentatonic bell notes and some birdsong now and then — never the same twice.
// Scheduled a few seconds ahead; quieter during booster openings and battles, silent when the
// tab is hidden.
const PAD = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]];
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88, 91];
const BAR = 8;
export const music = (() => {
    let timer = null, next = 0, bar = 0, wanted = false, ducks = 0, target = -1;
    const on = () => wanted && prefs.music && !(typeof document !== 'undefined' && document.hidden);

    function out(gain, pan, wetAmount) {
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        if (p.pan) p.pan.value = pan;
        gain.connect(p).connect(musicBus);
        const w = ctx.createGain(); w.gain.value = wetAmount; gain.connect(w).connect(musicWet);
    }
    function pad(f, t0, dur, gain, type, pan, detune = 0) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + 2.5);
        g.gain.setValueAtTime(gain, t0 + dur - 2.5);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        o.connect(lp).connect(g); out(g, pan, 0.6);
        o.start(t0); o.stop(t0 + dur + 0.1);
    }
    function pluck(f, t0, gain, pan) {
        for (const [mul, k, d] of [[1, 1, 3], [2.76, 0.25, 0.8]]) {
            const o = ctx.createOscillator(); o.frequency.value = f * mul;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(gain * k, t0 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
            o.connect(g); out(g, pan, 1);
            o.start(t0); o.stop(t0 + d + 0.1);
        }
    }
    let lastBird = -99;
    function bird(t0) {
        const pan = Math.random() * 1.4 - 0.7, base = 2600 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const s = t0 + i * (0.11 + Math.random() * 0.05);
            const o = ctx.createOscillator(); o.frequency.setValueAtTime(base, s);
            o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.07);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, s);
            g.gain.exponentialRampToValueAtTime(0.008, s + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
            o.connect(g); out(g, pan, 0.8);
            o.start(s); o.stop(s + 0.12);
        }
    }
    function wind(t0) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(300, t0);
        bp.frequency.linearRampToValueAtTime(500 + Math.random() * 400, t0 + BAR / 2);
        bp.frequency.linearRampToValueAtTime(300, t0 + BAR + 2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.025, t0 + BAR / 2);
        g.gain.linearRampToValueAtTime(0, t0 + BAR + 2);
        src.connect(bp).connect(g); out(g, 0, 0.3);
        src.start(t0, Math.random()); src.stop(t0 + BAR + 2.1);
    }
    function scheduleBar(t0, b) {
        const chord = PAD[b % PAD.length];
        chord.forEach((m, i) => {
            pad(hz(m), t0, BAR + 2, 0.022, 'triangle', (i % 2 ? 0.4 : -0.4), -6);
            pad(hz(m), t0, BAR + 2, 0.022, 'triangle', (i % 2 ? -0.4 : 0.4), 6);
        });
        pad(hz(chord[0] - 12), t0, BAR + 2, 0.06, 'sine', 0);
        if (b % 2 === 0) wind(t0);
        const notes = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < notes; i++) pluck(hz(SCALE[Math.floor(Math.random() * SCALE.length)]), t0 + 0.5 + Math.random() * (BAR - 1), 0.035, Math.random() * 1.2 - 0.6);
        // un oiseau de temps en temps : au moins ~30 s entre deux chants
        if (b - lastBird >= 4 && Math.random() < 0.35) { lastBird = b; bird(t0 + 1 + Math.random() * (BAR - 2)); }
    }
    function level() {
        if (!musicBus) return;
        const g = on() ? (ducks > 0 ? 0.06 : 0.2) : 0;
        if (g === target) return;
        target = g;
        musicBus.gain.cancelScheduledValues(ctx.currentTime);
        musicBus.gain.setTargetAtTime(g, ctx.currentTime, g ? 0.8 : 0.25);
    }
    function tick() {
        if (!ctx || ctx.state !== 'running') return;
        level();
        if (!on()) return;
        if (next < ctx.currentTime) next = ctx.currentTime + 0.1;
        while (next < ctx.currentTime + 3) { scheduleBar(next, bar++); next += BAR; }
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => tick());
    return {
        start() {
            if (wanted || !context()) return;
            wanted = true;
            timer = setInterval(tick, 1000);
            tick();
        },
        stop() { wanted = false; clearInterval(timer); timer = null; tick(); if (musicBus) level(); },
        /** quieter while something with its own sound effects is on screen; returns the release */
        duck() { ducks++; level(); return () => { ducks--; level(); }; },
        refresh: () => tick(),
    };
})();
