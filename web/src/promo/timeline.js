// Shared timeline of the promo video: scene boundaries (seconds) and sound cues, used by the
// animation (Promo.jsx) and by the soundtrack generator (promo/music.mjs) so both stay in sync.
export const FPS = 30;
export const SCENES = [
    { key: 'hook', start: 0, end: 3.4 },
    { key: 'count', start: 3.4, end: 7.0 },
    { key: 'booster', start: 7.0, end: 14.2 },
    { key: 'rarities', start: 14.2, end: 18.0 },
    { key: 'arena', start: 18.0, end: 22.0 },
    { key: 'features', start: 22.0, end: 24.4 },
    { key: 'cta', start: 24.4, end: 28.0 },
];
export const DURATION = SCENES.at(-1).end;

// Booster scene beats, relative to its start.
export const BOOSTER = { drop: 0, tear: 1.5, deal: 1.9, flip0: 2.6, flipGap: 0.32, flipLen: 0.26, suspense: 4.3, reveal: 5.0 };
// Arena scene beats, relative to its start.
export const ARENA = { vs: 0.55, hit1: 1.35, hit2: 2.05, ko: 2.75 };
export const RARITY_STEP = 0.42; // one rarity card lands every … seconds

const at = (scene, dt) => SCENES.find((s) => s.key === scene).start + dt;
export const CUES = [
    ...SCENES.slice(1).map((s) => ({ t: s.start - 0.12, kind: 'whoosh' })),
    { t: at('booster', BOOSTER.tear), kind: 'tear' },
    ...[0, 1, 2, 3, 4].map((i) => ({ t: at('booster', BOOSTER.flip0 + i * BOOSTER.flipGap), kind: 'flip' })),
    { t: at('booster', BOOSTER.reveal), kind: 'reveal' },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: at('rarities', 0.35 + i * RARITY_STEP), kind: 'pop', i })),
    { t: at('arena', ARENA.vs), kind: 'hit' },
    { t: at('arena', ARENA.hit1), kind: 'hit' },
    { t: at('arena', ARENA.hit2), kind: 'hit' },
    { t: at('arena', ARENA.ko), kind: 'reveal' },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: at('features', 0.3 + i * 0.16), kind: 'pop', i })),
    { t: at('cta', 0.1), kind: 'reveal' },
];
