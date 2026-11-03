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
const GRACE_MS = 3000; // network latency allowance on the timer

export const THEMES = {
    all: { label: 'Tout le vivant', types: null },
    faune: { label: 'Faune', types: ['mammal', 'bird', 'reptile', 'fish'] },
    flore: { label: 'Flore & champignons', types: ['plant', 'tree', 'fungus', 'alga', 'mold'] },
    petites: { label: 'Petites bêtes & océans', types: ['arthropod', 'marine', 'fish'] },
    origines: { label: 'Préhistoire & microbes', types: ['fossil', 'bacteria', 'virus', 'mold', 'alga'] },
};

const TYPE_ONE = {
    mammal: 'un mammifère', bird: 'un oiseau', reptile: 'un reptile ou un amphibien', fish: 'un poisson',
    arthropod: 'un insecte ou un arachnide', marine: 'une créature marine', plant: 'une plante', tree: 'un arbre',
    alga: 'une algue', fungus: 'un champignon', mold: 'une moisissure ou une levure', bacteria: 'une bactérie',
    virus: 'un virus', fossil: 'une espèce fossile',
};
// Groups players tend to mix up: used for "which group?" and "odd one out" questions.
const CONFUSABLE = {
    mammal: ['reptile', 'bird', 'fossil', 'marine', 'fish'], bird: ['reptile', 'mammal', 'fossil'],
    reptile: ['fish', 'mammal', 'fossil', 'bird'], fish: ['marine', 'reptile', 'mammal', 'fossil'],
    arthropod: ['marine', 'reptile', 'fossil'], marine: ['fish', 'arthropod', 'alga', 'mammal'],
    plant: ['tree', 'fungus', 'alga'], tree: ['plant', 'fungus'], alga: ['plant', 'bacteria', 'marine', 'mold'],
    fungus: ['mold', 'plant', 'bacteria'], mold: ['fungus', 'bacteria', 'alga'], bacteria: ['virus', 'mold', 'alga'],
    virus: ['bacteria', 'mold'], fossil: ['reptile', 'mammal', 'marine', 'fish'],
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
                    (stats->>'mass_kg')::float AS mass, extract IS NOT NULL AND length(extract) > 80 AS has_extract
             FROM cards WHERE views >= 800 AND art IS DISTINCT FROM 'illus'`
        );
        for (const c of rows) {
            c.band = bandOf(c.views);
            c.hasSci = !!c.sci_name && c.sci_name !== c.name;
            c.genus = c.sci_name?.includes(' ') ? c.sci_name.split(' ')[0] : null;
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
};

const KIND_WEIGHT = { photo_name: 1.6, name_photo: 1.3, name_sci: 1.2, extract: 1.5, sci_name: 1.1 };

export const KIND_LABELS = {
    photo_name: 'Reconnaître une photo', name_photo: 'Trouver la bonne photo', name_sci: 'Noms scientifiques',
    sci_name: 'Latin → français', extract: 'Lecture Wikipédia', type: 'Groupes du vivant', odd: 'Trouver l\'intrus',
    iucn: 'Conservation', extinct: 'Espèces disparues', threatened: 'Espèces menacées', heavier: 'Poids', genus: 'Cousins de genre',
};

// Builds a full quiz. `seen` maps cardId → last time the player met it in a quiz:
// unseen species come first, then the ones seen longest ago.
export async function buildQuiz(db, theme, seen) {
    const p = await getPool(db);
    const types = THEMES[theme]?.types;
    const themed = types ? p.cards.filter((c) => types.includes(c.type)) : p.cards;
    const byType = new Map();
    for (const c of p.cards) byType.set(c.type, [...(byType.get(c.type) || []), c]);

    const usedCards = new Set();
    const kindCount = {};
    const questions = [];
    let last = null;
    for (const level of LEVELS) {
        const ctx = { pool: p, level, themed, byType };
        // Weighted random order: photos, names and texts come up a bit more often than the rest.
        const kinds = Object.keys(BUILDERS)
            .filter((k) => k !== last && (kindCount[k] || 0) < 2 && (!BUILDERS[k].levels || BUILDERS[k].levels.includes(level)))
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

// What the browser may see before answering: no answer, no card ids.
export function publicQuestion(q, index, askedAt) {
    return {
        index, kind: q.kind, level: q.level, seconds: q.seconds, prompt: q.prompt, media: q.media || null,
        options: q.options.map((o) => (q.hideLabels ? { image: o.image } : o)),
        deadline: askedAt ? new Date(new Date(askedAt).getTime() + q.seconds * 1000).toISOString() : null,
    };
}

export function isLate(q, askedAt, now = Date.now()) {
    return now - new Date(askedAt).getTime() > q.seconds * 1000 + GRACE_MS;
}
