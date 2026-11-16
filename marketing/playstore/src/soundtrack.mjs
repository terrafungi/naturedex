// Bande-son de la vidéo promo, synthétisée (aucun échantillon externe, donc aucun droit à gérer).
// Nappe + basse + arpège, accords calés sur les scènes de video.html, petit écho stéréo.
// Usage : node soundtrack.mjs sortie.wav [durée]
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'music.wav';
const DUR = Number(process.argv[3] || 31);
const SR = 44100, N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// [début, accord en notes MIDI] : Cmaj9, Am9, Fmaj7, G6, Em7, Fmaj7, Cmaj9
const CHORDS = [[0, [48, 55, 59, 62, 64]], [3.4, [45, 52, 55, 59, 60]], [9, [41, 48, 52, 57, 60]], [13.6, [43, 50, 55, 59, 64]], [18, [40, 47, 50, 55, 59]], [22.6, [41, 48, 52, 57, 64]], [27, [48, 55, 59, 62, 67]]];

function addTone(t0, dur, f, amp, { attack = 0.02, release = 0.3, pan = 0, bright = 0, detune = 0 } = {}) {
    const s0 = Math.floor(t0 * SR), len = Math.floor((dur + release) * SR);
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < len && s0 + i < N; i++) {
        const t = i / SR;
        const env = t < attack ? t / attack : t < dur ? 1 : Math.max(0, 1 - (t - dur) / release);
        let v = Math.sin(2 * Math.PI * f * t) + bright * 0.5 * Math.sin(4 * Math.PI * f * t) + bright * 0.2 * Math.sin(6 * Math.PI * f * t);
        if (detune) v = 0.6 * v + 0.4 * Math.sin(2 * Math.PI * f * (1 + detune) * t);
        v *= env * amp;
        L[s0 + i] += v * gl; R[s0 + i] += v * gr;
    }
}

CHORDS.forEach(([a, notes], k) => {
    const b = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : DUR;
    // Nappe : notes tenues, attaque lente, léger désaccord pour l'ampleur.
    notes.slice(1).forEach((n, j) => addTone(a, b - a, midi(n), 0.045, { attack: 0.9, release: 1.2, pan: j % 2 ? 0.35 : -0.35, detune: 0.003 }));
    // Basse.
    addTone(a, b - a, midi(notes[0] - 12), 0.11, { attack: 0.3, release: 0.8 });
    // Arpège en croches (0,25 s), une octave au-dessus, notes courtes façon « carillon ».
    const arp = [notes[1], notes[2], notes[3], notes[4], notes[3] + 12, notes[4], notes[3], notes[2]].map((n) => n + 12);
    const end = k === CHORDS.length - 1 ? b - 1.5 : b;
    for (let t = a, i = 0; t < end - 0.05; t += 0.25, i++) {
        const accent = i % 4 === 0 ? 1 : 0.7;
        addTone(t, 0.06, midi(arp[i % arp.length]), 0.05 * accent, { attack: 0.004, release: 0.45, pan: Math.sin(i * 0.9) * 0.6, bright: 0.6 });
    }
});
// Note finale.
addTone(DUR - 3.8, 0.1, midi(84), 0.08, { attack: 0.004, release: 3.2, bright: 0.6 });

// Écho stéréo croisé (3 croches pointées) puis fondu d'entrée et de sortie.
const D = Math.floor(0.375 * SR);
for (let i = D; i < N; i++) { L[i] += R[i - D] * 0.28; R[i] += L[i - D] * 0.28; }
let peak = 0;
for (let i = 0; i < N; i++) {
    const t = i / SR, fade = Math.min(1, t / 0.8, (DUR - t) / 2.5);
    L[i] *= fade; R[i] *= fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.85 / peak;

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i] * gain) * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i] * gain) * 32000), 46 + i * 4);
}
writeFileSync(out, buf);
console.log(out, DUR + ' s');
