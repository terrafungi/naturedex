// Daily nature quiz: questions are generated from the card catalogue, so the pool is huge
// (~10 000 well-known species × 12 kinds of questions) and a player rarely sees the same one twice.
import crypto from 'node:crypto';

export const QUIZ_PER_DAY = 3;
export const QUIZ_LENGTH = 10;
export const LEVELS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2]; // difficulty of each question, easy → expert
export const LEVEL_COINS = [2, 3, 5]; // graines per right answer
export const PERFECT_COINS = 20;
export const PERFECT_NUGGETS = 10;
export const CARD_SCORE = 8; // right answers needed to win a card
const GRACE_MS = 4000; // network latency allowance on the timer
export const LOAD_MAX_MS = 8000; // the timer waits at most this long for the photos to load

// Game modes. Classic and daily keep the 10 rising questions; survival goes on until three
// mistakes; blitz is one minute against the clock (right answers add time, wrong ones cost some).
const JOKERS = { fifty: 1, time: 1, skip: 1 };
export const MODES = {
    classic: { label: 'Classique', length: 10, themes: true, jokers: JOKERS },
    daily: { label: 'Défi du jour', length: 10, perDay: 1, jokers: JOKERS },
    survival: { label: 'Survie', lives: 3, perDay: 2, passBonus: 1, themes: true, jokers: JOKERS },
    blitz: { label: 'Blitz', seconds: 60, perDay: 3, passBonus: 2, themes: true, jokers: JOKERS },
};
export const BLITZ = { correctMs: 2000, wrongMs: 5000, timeJokerMs: 10000 };
export const TIME_JOKER_MS = 10000;
const BLITZ_KINDS = ['photo_name', 'name_photo', 'type', 'true_false', 'sci_name', 'odd', 'heavier'];
// Endless modes get harder as the run goes on.
export const levelAt = (mode, i) => (mode === 'blitz' ? (i < 6 ? 0 : i < 16 ? 1 : 2) : i < 5 ? 0 : i < 12 ? 1 : 2);
export const kindsFor = (mode) => (mode === 'blitz' ? BLITZ_KINDS : null);

// Endless-mode rewards: graines per right answer, bonuses at milestones, a card past `card`.
export const RUN_REWARDS = {
    survival: { perCorrect: 1, every: 10, everyCoins: 5, nuggets: [[20, 5], [40, 10]], card: 15 },
    blitz: { perCorrect: 1, every: 15, everyCoins: 10, nuggets: [[25, 10]], card: 15 },
};

// Points: level base + speed bonus, multiplied by the combo of right answers in a row.
export const COMBO_STEPS = [[8, 3], [5, 2], [3, 1.5]];
export const multiplier = (combo) => (COMBO_STEPS.find(([n]) => combo >= n) || [0, 1])[1];
const BASE_POINTS = [100, 150, 200];
export function questionPoints(level, speed, combo, fifty) {
    const s = Math.max(0, Math.min(1, speed));
    return Math.round((BASE_POINTS[level] + 100 * s) * multiplier(combo) * (fifty ? 0.5 : 1));
}

// Naturalist level from all the quiz points ever earned: level L starts at STEP × L(L−1)/2.
const STEP = 3000;
const RANKS = [[40, 'Légende vivante'], [30, 'Professeur'], [20, 'Savant'], [15, 'Explorateur'], [10, 'Naturaliste'], [5, 'Observateur'], [1, 'Promeneur']];
export function quizLevel(points) {
    const level = Math.floor((1 + Math.sqrt(1 + (8 * points) / STEP)) / 2);
    return {
        level, points, from: (STEP * level * (level - 1)) / 2, to: (STEP * (level + 1) * level) / 2,
        title: RANKS.find(([l]) => level >= l)[1], next: [...RANKS].reverse().find(([l]) => l > level) || null,
    };
}

export const THEMES = {
    all: { label: 'Tout le vivant', types: null },
    faune: { label: 'Faune', types: ['mammal', 'bird', 'reptile', 'fish'] },
    flore: { label: 'Flore & champignons', types: ['plant', 'tree', 'fungus', 'alga', 'mold'] },
    petites: { label: 'Petites bêtes & océans', types: ['arthropod', 'terrestrial', 'aquatic', 'marine', 'fish'] },
    origines: { label: 'Préhistoire, microbes & minéraux', types: ['fossil', 'mineral', 'bacteria', 'virus', 'mold', 'alga'] },
};

const TYPE_ONE = {
    mammal: 'un mammifère', bird: 'un oiseau', reptile: 'un reptile ou un amphibien', fish: 'un poisson',
    arthropod: 'un insecte ou un arachnide', terrestrial: 'un mollusque ou une petite bête terrestre (escargot, limace, ver de terre…)', aquatic: 'un mollusque aquatique (coquillage, pieuvre…)', marine: 'une créature aquatique (corail, méduse, crabe…)', plant: 'une plante', tree: 'un arbre',
    alga: 'une algue', fungus: 'un champignon', mold: 'une moisissure ou une levure', bacteria: 'une bactérie',
    virus: 'un virus', fossil: 'une espèce fossile', mineral: 'un minéral ou une roche',
};
// Groups players tend to mix up: used for "which group?" and "odd one out" questions.
const CONFUSABLE = {
    mammal: ['reptile', 'bird', 'fossil', 'marine', 'fish'], bird: ['reptile', 'mammal', 'fossil'],
    reptile: ['fish', 'mammal', 'fossil', 'bird'], fish: ['marine', 'reptile', 'mammal', 'fossil'],
    arthropod: ['marine', 'terrestrial', 'reptile', 'fossil'], marine: ['fish', 'aquatic', 'arthropod', 'alga', 'mammal'],
    terrestrial: ['aquatic', 'arthropod', 'fossil'], aquatic: ['marine', 'terrestrial', 'fish', 'fossil'],
    plant: ['tree', 'fungus', 'alga'], tree: ['plant', 'fungus'], alga: ['plant', 'bacteria', 'marine', 'mold'],
    fungus: ['mold', 'plant', 'bacteria'], mold: ['fungus', 'bacteria', 'alga'], bacteria: ['virus', 'mold', 'alga'],
    virus: ['bacteria', 'mold'], fossil: ['reptile', 'mammal', 'marine', 'fish', 'mineral'], mineral: ['fossil'],
};
export const IUCN_LABELS = {
    LC: 'Préoccupation mineure', NT: 'Quasi menacée', VU: 'Vulnérable', CR: 'En danger critique',
    EW: 'Éteinte à l\'état sauvage', EX: 'Éteinte',
};

// Popularity bands (yearly fr.wikipedia views): stars, known species, connoisseur species.
const BANDS = [[15000, Infinity], [3000, 15000], [800, 3000]];
const bandOf = (views) => BANDS.findIndex(([lo, hi]) => views >= lo && views < hi);

let pool, poolAt = 0; // per Lambda container, 30 min
async function getPool(db) {
    if (!pool || Date.now() - poolAt > 1_800_000) {
        const { rows } = await db.query(
            `SELECT id, name, sci_name, type, rarity, views::int AS views, thumb_url, iucn,
                    CASE WHEN stats->>'mass_checked' = 'ok' THEN (stats->>'mass_kg')::float END AS mass, -- see mass-check.mjs
                    extract IS NOT NULL AND length(extract) > 80 AS has_extract
             FROM cards WHERE views >= 800 AND art IS DISTINCT FROM 'illus'`
        );
        for (const c of rows) {
            c.band = bandOf(c.views);
            // a mineral's sci_name is its chemical formula, not a Latin name
            c.hasSci = !!c.sci_name && c.sci_name !== c.name && c.type !== 'mineral';
            c.genus = c.hasSci && c.sci_name.includes(' ') ? c.sci_name.split(' ')[0] : null;
        }
        const byGenus = new Map();
        for (const c of rows) if (c.genus) byGenus.set(c.genus, [...(byGenus.get(c.genus) || []), c]);
        pool = { cards: rows, byGenus };
        poolAt = Date.now();
    }
    return pool;
}

const rand = (n) => crypto.randomInt(n);
const pick = (list) => list[rand(list.length)];
function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
// Random distinct sample of n items passing `ok`, without scanning more than needed.
function sample(list, n, ok = () => true) {
    const out = [];
    for (const c of shuffle(list)) {
        if (ok(c, out)) out.push(c);
        if (out.length === n) break;
    }
    return out;
}

export function formatMass(kg) {
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} t`;
    if (kg >= 1) return `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
    return `${(kg * 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
}

// First sentences of an article intro, at most ~`max` characters.
export function intro(text, max = 300) {
    if (!text) return null;
    // A sentence ends with . ! ? followed by a capital (so "L., 1753" or "env. 3 m" do not split).
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«])/);
    let out = '';
    for (const s of sentences) {
        if (out && (out + ' ' + s).length > max) break;
        out += (out ? ' ' : '') + s;
    }
    return out.trim().slice(0, max + 80);
}

// Hide every word that would give the answer away (names, genus, plurals).
// Words too common to give the answer away: masking them only makes the text unreadable.
const GENERIC = new Set(['virus', 'bactérie', 'champignon', 'plante', 'arbre', 'oiseau', 'poisson', 'algue', 'commun', 'commune',
    'grand', 'grande', 'petit', 'petite', 'europe', 'européen', 'européenne', 'sauvage', 'famille', 'espèce', 'genre', 'avec', 'dans']);

const ACCENTS = { a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' };

function maskText(text, card) {
    const words = new Set([card.name, card.sci_name]);
    for (const w of `${card.name} ${card.sci_name || ''}`.split(/[\s'’,()-]+/)) if (w.length > 3 && !GENERIC.has(w.toLowerCase())) words.add(w);
    let t = text;
    for (const w of [...words].filter(Boolean).sort((a, b) => b.length - a.length)) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Accent-insensitive, so "Dimetrodon" also hides "dimétrodon".
        const loose = esc.normalize('NFD').replace(/\p{M}/gu, '').replace(/[aeiouc]/gi, (ch) => ACCENTS[ch.toLowerCase()]);
        t = t.replace(new RegExp(`(?<!\\p{L})${loose}[\\p{L}]*`, 'giu'), '▢▢▢');
    }
    return t.replace(/▢▢▢(?:[\s-]*▢▢▢)+/g, '▢▢▢');
}

// ---------- question builders ----------
// Each returns { kind, prompt, media?, options[], answer, cardId, cardIds[], facts? } or null.
// Distractors are picked from the same group and a similar popularity so the choice is fair.

function nearBand(level) {
    return level === 0 ? [0, 1] : level === 1 ? [0, 1, 2] : [1, 2];
}
function distractors(ctx, target, n, extra = () => true) {
    const bands = nearBand(ctx.level);
    const sameGenus = ctx.level === 2 && target.genus ? (ctx.pool.byGenus.get(target.genus) || []) : [];
    const used = new Set([target.name.toLowerCase()]);
    const ok = (c) => c.id !== target.id && !used.has(c.name.toLowerCase()) && extra(c) && used.add(c.name.toLowerCase());
    // Expert questions try close relatives first: same genus is the hardest decoy.
    const out = sample(sameGenus, Math.min(n, 2), ok);
    out.push(...sample(ctx.byType.get(target.type) || [], n - out.length, (c) => bands.includes(c.band) && ok(c)));
    if (out.length < n) out.push(...sample(ctx.themed, n - out.length, ok));
    return out.length === n ? out : null;
}
const nameOption = (c) => ({ label: c.name });
const photoOption = (c) => ({ image: c.thumb_url, label: c.name });

function withAnswer(target, decoys, toOption) {
    const cards = shuffle([target, ...decoys]);
    return { options: cards.map(toOption), answer: cards.indexOf(target), cardIds: cards.map((c) => c.id) };
}

const BUILDERS = {
    photo_name: {
        seconds: 20,
        target: () => true,
        build(ctx, t) {
            const d = distractors(ctx, t, 3);
            return d && { prompt: 'Quelle est cette espèce ?', media: { image: t.thumb_url }, ...withAnswer(t, d, nameOption) };
        },
    },
    name_photo: {
        seconds: 20, levels: [0, 1, 2],
        target: () => true,
        build(ctx, t) {
            const d = distractors(ctx, t, 3, (c) => c.thumb_url !== t.thumb_url);
            return d && { prompt: `Où se cache : ${t.name} ?`, ...withAnswer(t, d, photoOption), hideLabels: true };
        },
    },
    name_sci: {
        seconds: 20,
        target: (c) => c.hasSci,
        build(ctx, t) {
            const d = distractors(ctx, t, 3, (c) => c.hasSci && c.sci_name !== t.sci_name);
            return d && {
                prompt: `Quel est le nom scientifique de : ${t.name} ?`, media: { image: t.thumb_url },
                ...withAnswer(t, d, (c) => ({ label: c.sci_name, italic: true })),
            };
        },
    },
    sci_name: {
        seconds: 20,
        target: (c) => c.hasSci,
        build(ctx, t) {
            const d = distractors(ctx, t, 3);
            return d && { prompt: 'À quelle espèce correspond ce nom scientifique ?', media: { sci: t.sci_name }, ...withAnswer(t, d, nameOption) };
        },
    },
    extract: {
        seconds: 35,
        target: (c) => c.has_extract,
        build(ctx, t) {
            const text = t.extract && maskText(intro(t.extract, 320), t);
            if (!text || text.length < 60) return null;
            const d = distractors(ctx, t, 3);
            return d && { prompt: 'De quelle espèce parle ce texte ?', media: { text }, ...withAnswer(t, d, nameOption) };
        },
    },
    type: {
        seconds: 15, levels: [0, 1],
        target: (c) => CONFUSABLE[c.type],
        build(ctx, t) {
            const others = shuffle(CONFUSABLE[t.type]).slice(0, 3);
            for (const k of shuffle(Object.keys(TYPE_ONE))) if (others.length < 3 && k !== t.type && !others.includes(k)) others.push(k);
            const types = shuffle([t.type, ...others]);
            return {
                prompt: `À quel groupe appartient : ${t.name} ?`, media: { image: t.thumb_url },
                options: types.map((type) => ({ type })), answer: types.indexOf(t.type), cardIds: [t.id],
            };
        },
    },
    odd: {
        seconds: 20,
        target: (c) => CONFUSABLE[c.type],
        build(ctx, t) {
            // t is the intruder; the three others share a group t could be mistaken for.
            const group = pick(CONFUSABLE[t.type].filter((k) => ctx.byType.get(k)?.length >= 3) || []);
            if (!group) return null;
            const bands = nearBand(ctx.level);
            const names = new Set([t.name]);
            const d = sample(ctx.byType.get(group), 3, (c) => bands.includes(c.band) && !names.has(c.name) && names.add(c.name));
            if (d.length < 3) return null;
            return {
                prompt: `Trouve l'intrus : laquelle n'est pas ${TYPE_ONE[group]} ?`, ...withAnswer(t, d, photoOption),
                group,
            };
        },
    },
    iucn: {
        seconds: 20,
        target: (c) => IUCN_LABELS[c.iucn] && c.type !== 'fossil' && (c.iucn !== 'LC' || rand(3) === 0),
        build(ctx, t) {
            const codes = ['LC', 'NT', 'VU', 'CR', t.iucn === 'EW' ? 'EW' : 'EX'];
            const others = shuffle(codes.filter((c) => c !== t.iucn)).slice(0, 3);
            const list = shuffle([t.iucn, ...others]);
            return {
                prompt: `Quel est le statut de conservation de : ${t.name} ?`, media: { image: t.thumb_url },
                options: list.map((iucn) => ({ iucn, label: IUCN_LABELS[iucn] })), answer: list.indexOf(t.iucn), cardIds: [t.id],
            };
        },
    },
    extinct: {
        seconds: 20,
        target: (c) => c.iucn === 'EX' || c.iucn === 'EW',
        build(ctx, t) {
            const d = distractors(ctx, t, 3, (c) => c.iucn === 'LC');
            return d && { prompt: 'Laquelle de ces espèces a disparu à l\'état sauvage ?', ...withAnswer(t, d, photoOption) };
        },
    },
    threatened: {
        seconds: 20,
        target: (c) => c.iucn === 'CR',
        build(ctx, t) {
            const d = distractors(ctx, t, 3, (c) => c.iucn === 'LC');
            return d && { prompt: 'Laquelle de ces espèces est en danger critique d\'extinction ?', ...withAnswer(t, d, photoOption) };
        },
    },
    heavier: {
        seconds: 20,
        target: (c) => c.mass > 0 && ['mammal', 'bird', 'fossil', 'reptile', 'fish'].includes(c.type),
        build(ctx, t) {
            // Clear-cut only: the answer weighs at least 3× more than every other option.
            const d = sample(ctx.byType.get(t.type) || [], 3, (c, out) => c.mass > 0 && c.mass * 3 <= t.mass
                && c.name !== t.name && !out.some((o) => o.name === c.name));
            if (d.length < 3) return null;
            const q = withAnswer(t, d, photoOption);
            const byId = new Map([t, ...d].map((c) => [c.id, c]));
            return { prompt: 'Laquelle de ces espèces est la plus lourde ?', ...q, facts: q.cardIds.map((id) => formatMass(byId.get(id).mass)) };
        },
    },
    genus: {
        seconds: 25, levels: [1, 2],
        target: (c, ctx) => c.genus && ctx.pool.byGenus.get(c.genus).length >= 2,
        build(ctx, t) {
            const cousin = sample(ctx.pool.byGenus.get(t.genus), 1, (c) => c.id !== t.id && c.name !== t.name && c.hasSci)[0];
            if (!cousin) return null;
            const d = distractors(ctx, cousin, 3, (c) => c.genus !== t.genus);
            if (!d) return null;
            return {
                prompt: `Laquelle de ces espèces est une proche cousine de : ${t.name} (même genre, ${t.genus}) ?`,
                media: { image: t.thumb_url }, ...withAnswer(cousin, d, photoOption), about: t.id,
            };
        },
    },
    true_false: {
        seconds: 12,
        target: (c) => c.hasSci || CONFUSABLE[c.type],
        build(ctx, t) {
            const truth = rand(2) === 0;
            let prompt;
            if (t.hasSci && rand(2) === 0) {
                const decoy = !truth && distractors(ctx, t, 1, (c) => c.hasSci && c.genus !== t.genus)?.[0];
                if (!truth && !decoy) return null;
                prompt = `« ${truth ? t.sci_name : decoy.sci_name} » est le nom scientifique de : ${t.name}.`;
            } else {
                if (!CONFUSABLE[t.type]) return null;
                prompt = `${t.name} est ${TYPE_ONE[truth ? t.type : pick(CONFUSABLE[t.type])]}.`;
            }
            return {
                prompt: `Vrai ou faux ? ${prompt}`, media: { image: t.thumb_url },
                options: [{ label: 'Vrai', tf: true }, { label: 'Faux', tf: false }], answer: truth ? 0 : 1, cardIds: [t.id],
            };
        },
    },
    famous: {
        seconds: 20, levels: [1, 2],
        target: () => true,
        build(ctx, t) {
            // Clear-cut only: the answer is read at least twice as much as every other option.
            const d = sample(ctx.byType.get(t.type) || [], 3, (c, out) => c.views * 2 <= t.views && c.views >= 800
                && c.name !== t.name && !out.some((o) => o.name === c.name));
            if (d.length < 3) return null;
            const q = withAnswer(t, d, photoOption);
            const byId = new Map([t, ...d].map((c) => [c.id, c]));
            return {
                prompt: 'Laquelle de ces espèces est la plus célèbre (la plus lue sur Wikipédia) ?', ...q,
                facts: q.cardIds.map((id) => `${byId.get(id).views.toLocaleString('fr-FR')} lectures/an`),
            };
        },
    },
};

const KIND_WEIGHT = { photo_name: 1.6, name_photo: 1.3, name_sci: 1.2, extract: 1.5, sci_name: 1.1, true_false: 0.9, famous: 0.8 };

export const KIND_LABELS = {
    photo_name: 'Reconnaître une photo', name_photo: 'Trouver la bonne photo', name_sci: 'Noms scientifiques',
    sci_name: 'Latin → français', extract: 'Lecture Wikipédia', type: 'Groupes du vivant', odd: 'Trouver l\'intrus',
    iucn: 'Conservation', extinct: 'Espèces disparues', threatened: 'Espèces menacées', heavier: 'Poids', genus: 'Cousins de genre',
    true_false: 'Vrai ou faux', famous: 'Célébrités du vivant',
};

// Builds a list of questions, one per entry of `levels`. `seen` maps cardId → last time the player
// met it in a quiz: unseen species come first, then the ones seen longest ago. `kinds` limits the
// question kinds (blitz keeps the quick ones); `exclude` holds species already used in this game.
export async function buildQuiz(db, theme, seen, { levels = LEVELS, kinds: allowed = null, exclude = [] } = {}) {
    const p = await getPool(db);
    const types = THEMES[theme]?.types;
    const themed = types ? p.cards.filter((c) => types.includes(c.type)) : p.cards;
    const byType = new Map();
    for (const c of p.cards) byType.set(c.type, [...(byType.get(c.type) || []), c]);

    const usedCards = new Set(exclude);
    const kindCount = {};
    const questions = [];
    let last = null;
    const maxKind = Math.max(2, Math.ceil(levels.length / 4));
    for (const level of levels) {
        const ctx = { pool: p, level, themed, byType };
        // Weighted random order: photos, names and texts come up a bit more often than the rest.
        const kinds = Object.keys(BUILDERS)
            .filter((k) => k !== last && (kindCount[k] || 0) < maxKind && (!allowed || allowed.includes(k))
                && (!BUILDERS[k].levels || BUILDERS[k].levels.includes(level)))
            .map((k) => [k, Math.random() * (KIND_WEIGHT[k] || 1)]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
        let q = null;
        for (const kind of kinds) {
            const B = BUILDERS[kind];
            const candidates = themed.filter((c) => c.band === level && !usedCards.has(c.id) && B.target(c, ctx));
            if (!candidates.length) continue;
            const fresh = candidates.filter((c) => !seen.has(c.id));
            const ordered = fresh.length >= 3 ? shuffle(fresh).slice(0, 6)
                : [...shuffle(fresh), ...candidates.filter((c) => seen.has(c.id)).sort((a, b) => seen.get(a.id) - seen.get(b.id)).slice(0, 6)];
            for (const target of ordered) {
                if (kind === 'extract') {
                    const { rows: [r] } = await db.query(`SELECT extract FROM cards WHERE id = $1`, [target.id]);
                    target.extract = r?.extract;
                }
                const built = B.build(ctx, target);
                if (built) {
                    // Single-card questions (type, conservation…) carry one id whatever the answer index.
                    const cardId = built.cardIds.length === 1 ? built.cardIds[0] : built.cardIds[built.answer];
                    q = { kind, level, seconds: B.seconds, cardId, about: built.about || cardId, ...built };
                    break;
                }
            }
            if (q) break;
        }
        if (!q) continue;
        for (const id of q.cardIds) usedCards.add(id);
        usedCards.add(q.about);
        kindCount[q.kind] = (kindCount[q.kind] || 0) + 1;
        last = q.kind;
        questions.push(q);
    }
    return questions;
}

// Time allowed on a question: its own timer (+ the time joker), or the end of the blitz.
// The timer starts once the question is on screen (loadMs = time spent loading its photos).
export function deadlineOf(q, askedAt, cur = {}, endsAt = null) {
    if (endsAt) return new Date(endsAt).getTime();
    return new Date(askedAt).getTime() + (cur.loadMs || 0) + q.seconds * 1000 + (cur.extraMs || 0);
}

// What the browser may see before answering: no answer, no card ids.
export function publicQuestion(q, index, askedAt, cur = {}, endsAt = null) {
    return {
        index, kind: q.kind, level: q.level, seconds: q.seconds + (cur.extraMs || 0) / 1000, prompt: q.prompt, media: q.media || null,
        options: q.options.map((o) => (q.hideLabels ? { image: o.image } : o)),
        removed: cur.removed || [],
        deadline: askedAt ? new Date(deadlineOf(q, askedAt, cur, endsAt)).toISOString() : null,
    };
}

export function isLate(q, askedAt, cur, endsAt, now = Date.now()) {
    return now > deadlineOf(q, askedAt, cur, endsAt) + GRACE_MS;
}
