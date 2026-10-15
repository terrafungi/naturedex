// Procedural soundtrack for the promo video (royalty-free by construction): a light I–V–vi–IV
// groove at 105 BPM plus sound effects on the timeline cues. Writes a 48 kHz stereo 16-bit WAV.
import { writeFileSync } from 'node:fs';
import { CUES, SCENES } from '../src/promo/timeline.js';

const SR = 48000;
const BPM = 105, BEAT = 60 / BPM, BAR = BEAT * 4;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [
    { bass: 36, notes: [60, 64, 67, 72] }, // C
    { bass: 43, notes: [59, 62, 67, 71] }, // G
    { bass: 45, notes: [60, 64, 69, 72] }, // Am
    { bass: 41, notes: [60, 65, 69, 72] }, // F
];
const DROP = SCENES[1].start; // drums come in with the second scene

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

export function writeSoundtrack(path, duration) {
    const n = Math.ceil((duration + 0.5) * SR);
    const L = new Float32Array(n), R = new Float32Array(n);
    const add = (t0, len, fn, pan = 0, gain = 1) => {
        const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(n, s0 + Math.round(len * SR));
        const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
        for (let s = s0; s < s1; s++) { const v = fn((s - s0) / SR); L[s] += v * gl; R[s] += v * gr; }
    };
    const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);

    const bars = Math.ceil(duration / BAR);
    for (let b = 0; b < bars; b++) {
        const t0 = b * BAR, ch = CHORDS[b % 4];
        const last = t0 + BAR > duration - BAR; // final chord rings longer
        // pad: two detuned soft saw-ish voices per note
        for (const [k, m] of ch.notes.entries()) {
            for (const det of [-0.12, 0.12]) {
                const f = hz(m - 12) * 2 ** (det / 12);
                add(t0, BAR * (last ? 2.2 : 1.15), (t) => {
                    const a = Math.min(1, t / 0.35) * (last ? Math.exp(-t / 2.4) : Math.min(1, (BAR * 1.15 - t) / 0.3));
                    let v = 0;
                    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t + h) / (h * h);
                    return v * a;
                }, det > 0 ? 0.35 : -0.35, 0.028 - k * 0.003);
            }
        }
        // bass on beats 1 and 3 (after the drop), held root before
        for (const beat of t0 >= DROP ? [0, 2, 2.5] : [0]) {
            const f = hz(ch.bass);
            add(t0 + beat * BEAT, t0 >= DROP ? BEAT * 1.4 : BAR, (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env(t, 0.008, t0 >= DROP ? 0.35 : 1.2), 0, 0.16);
        }
        // pluck arpeggio, eighth notes
        for (let e = 0; e < 8; e++) {
            const m = ch.notes[[0, 1, 2, 3, 2, 1, 2, 3][e]] + 12;
            const f = hz(m);
            add(t0 + e * BEAT / 2, 0.6, (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t)) * env(t, 0.003, 0.16), e % 2 ? 0.3 : -0.3, 0.05);
        }
        // drums
        if (t0 >= DROP && !last) {
            for (let beat = 0; beat < 4; beat++) {
                add(t0 + beat * BEAT, 0.4, (t) => Math.sin(2 * Math.PI * (45 * t + 90 * (1 - Math.exp(-t * 30)) / 30)) * env(t, 0.002, 0.13), 0, 0.33);
                let lp = 0;
                add(t0 + (beat + 0.5) * BEAT, 0.08, (t) => { const x = rand(); const hp = x - lp; lp = x; return hp * env(t, 0.001, 0.025); }, 0.2, 0.05);
                if (beat % 2 === 1) {
                    let lp2 = 0;
                    add(t0 + beat * BEAT, 0.25, (t) => { lp2 += (rand() - lp2) * 0.35; return (lp2 * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * env(t, 0.002, 0.07); }, -0.1, 0.14);
                }
            }
        }
    }

    // sound effects
    const noise = (cut) => { let lp = 0; return () => { lp += (rand() - lp) * cut; return lp; }; };
    for (const c of CUES) {
        if (c.kind === 'whoosh') {
            const nz = noise(0.08);
            add(c.t - 0.25, 0.6, (t) => nz() * Math.sin(Math.PI * Math.min(1, t / 0.6)) ** 2 * 2.2, 0, 0.16);
        } else if (c.kind === 'tear') {
            const nz = noise(0.5);
            add(c.t, 0.35, (t) => nz() * env(t, 0.004, 0.09) * (1 + 0.5 * Math.sin(2 * Math.PI * 38 * t)), 0, 0.32);
        } else if (c.kind === 'flip') {
            const nz = noise(0.7);
            add(c.t + 0.1, 0.12, (t) => (nz() * 0.6 + Math.sin(2 * Math.PI * 1800 * t) * 0.4) * env(t, 0.001, 0.02), rand() * 0.5, 0.22);
        } else if (c.kind === 'pop') {
            const f = hz(72 + [0, 2, 4, 7, 9, 12][c.i % 6]);
            add(c.t + 0.15, 0.35, (t) => Math.sin(2 * Math.PI * f * t * (1 + 0.15 * Math.exp(-t * 40))) * env(t, 0.002, 0.08), 0, 0.12);
        } else if (c.kind === 'hit') {
            const nz = noise(0.25);
            add(c.t, 0.5, (t) => (Math.sin(2 * Math.PI * (50 * t + 140 * (1 - Math.exp(-t * 25)) / 25)) + nz() * 0.8) * env(t, 0.002, 0.12), 0, 0.42);
        } else if (c.kind === 'reveal') {
            // riser into it, then a bell arpeggio with shimmer
            const nz = noise(0.2);
            add(c.t - 0.7, 0.7, (t) => nz() * (t / 0.7) ** 2 * 1.6, 0, 0.12);
            [84, 88, 91, 96].forEach((m, i) => {
                const f = hz(m);
                add(c.t + i * 0.07, 2.4, (t) => (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3) + 0.2 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 6)) * env(t, 0.002, 0.7), i % 2 ? 0.4 : -0.4, 0.09);
            });
            add(c.t, 0.6, (t) => Math.sin(2 * Math.PI * (40 * t + 120 * (1 - Math.exp(-t * 20)) / 20)) * env(t, 0.002, 0.25), 0, 0.4);
        }
    }

    // master: fade out, soft clip, normalise to -1 dBFS
    const fadeFrom = (duration - 1.2) * SR, fadeTo = (duration + 0.3) * SR;
    let peak = 0;
    for (let s = 0; s < n; s++) {
        const g = s < fadeFrom ? 1 : Math.max(0, 1 - (s - fadeFrom) / (fadeTo - fadeFrom));
        L[s] = Math.tanh(L[s] * 1.2) * g; R[s] = Math.tanh(R[s] * 1.2) * g;
        peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
    }
    const norm = 0.89 / (peak || 1);
    const buf = Buffer.alloc(44 + n * 4);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
    for (let s = 0; s < n; s++) {
        buf.writeInt16LE(Math.round(L[s] * norm * 32767), 44 + s * 4);
        buf.writeInt16LE(Math.round(R[s] * norm * 32767), 46 + s * 4);
    }
    writeFileSync(path, buf);
}
