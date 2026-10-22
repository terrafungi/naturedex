/**
 * « Exploration »: NatureDex cards appear on a real map around the player and are caught on site.
 * Spawns are deterministic: a secret-seeded hash of a ~200 m grid cell and a 30-minute window, so
 * every player sees the same cards and the server recomputes any spawn to validate a catch.
 * - Which species: the ones really recorded nearby (GBIF occurrences, ~5 km cell, matched by gbif_key).
 * - How rare: the wilder the place (ESA WorldCover land cover: forest, wetland, mountain vs city),
 *   the more rare/epic/legendary cards. Habitat also favours fitting types (fungi in woods, fish by water).
 * - Catching: be within CATCH_RADIUS, a timing throw (client), then a server roll by rarity; 3 throws
 *   then the card flees. The card goes to the collection (or adds a copy). DAILY_CATCHES a Paris day.
 * Only the player's last position is stored (anti-teleport speed check), never a track.
 */
import crypto from 'node:crypto';
import { landCover } from './worldcover.mjs';

const PARIS_DAY = `(now() AT TIME ZONE 'Europe/Paris')::date`;
const CELL = 0.0018; // degrees of latitude, ~200 m
const POOL_CELL = 0.05; // ~5 km species pools
const SLOT_MS = 30 * 60_000;
const VIEW_RADIUS = 350; // m
const CATCH_RADIUS = 50; // m, GPS is rarely better than ~15 m
const MAX_TRIES = 3;
const DAILY_CATCHES = 10;
const MAX_SPEED = 45; // m/s; faster jumps (teleport, plane) put catching on cooldown
const MAX_COOLDOWN = 2 * 3600; // s
const EXCLUDED_TYPES = ['virus', 'bacteria', 'mold', 'fossil'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
// catch chance of a good throw; a perfect one adds PERFECT_BONUS
const CATCH_CHANCE = { common: 0.9, uncommon: 0.8, rare: 0.65, epic: 0.5, legendary: 0.35 };
const PERFECT_BONUS = 0.25;

// land cover class -> habitat shown to the player, naturalness 0..1, type affinities
const HABITATS = {
    10: { key: 'forest', label: 'Forêt', wild: 1, types: { tree: 3, fungus: 3, mammal: 2, bird: 1.5, arthropod: 1.5, fish: 0.2, marine: 0.1 } },
    20: { key: 'scrub', label: 'Broussailles', wild: 0.8, types: { plant: 2, arthropod: 2, reptile: 2, bird: 1.5, mammal: 1.5, marine: 0.1 } },
    30: { key: 'meadow', label: 'Prairie', wild: 0.55, types: { plant: 2.5, arthropod: 2.5, bird: 1.5, mammal: 1.2, marine: 0.1 } },
    40: { key: 'fields', label: 'Champs', wild: 0.25, types: { plant: 2, arthropod: 2, bird: 1.5, mammal: 1.2, marine: 0.1 } },
    50: { key: 'city', label: 'Ville', wild: 0, types: { bird: 2, plant: 1.5, arthropod: 1.5, tree: 1.2, mammal: 0.6, marine: 0.1 } },
    60: { key: 'rock', label: 'Rochers', wild: 0.6, types: { plant: 2, bird: 2, mammal: 1.5, reptile: 1.5, arthropod: 1.2 } },
    70: { key: 'snow', label: 'Neiges', wild: 0.7, types: { bird: 2, mammal: 2, plant: 1.2 } },
    80: { key: 'water', label: 'Eau', wild: 0.75, types: { fish: 3, marine: 3, alga: 3, bird: 2.5, reptile: 1.5, plant: 0.8, tree: 0.3, fungus: 0.3 } },
    90: { key: 'wetland', label: 'Zone humide', wild: 1, types: { bird: 3, reptile: 2.5, fish: 2, arthropod: 2, plant: 1.5, alga: 2 } },
    95: { key: 'mangrove', label: 'Mangrove', wild: 1, types: { marine: 3, fish: 3, bird: 2.5, tree: 2, reptile: 2 } },
    100: { key: 'tundra', label: 'Lande', wild: 0.9, types: { plant: 2.5, bird: 2, mammal: 1.5, arthropod: 1 } },
};

let secret;
const seed = () => (secret ??= crypto.createHash('sha256').update(`explore:${process.env.EXPLORE_SECRET || process.env.OPENKBS_API_KEY || 'naturedex'}`).digest());
const hashBytes = (s) => crypto.createHmac('sha256', seed()).update(s).digest();
const unit = (buf, i) => buf.readUInt32BE(i) / 2 ** 32;

const rad = (d) => (d * Math.PI) / 180;
function distance(aLat, aLon, bLat, bLon) {
    const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Grid cells are ~200 m squares: the longitude step widens with latitude.
const lonStep = (row) => CELL / Math.max(0.05, Math.cos(rad((row + 0.5) * CELL)));
const cellOf = (row, col) => ({ row, col, key: `${row}:${col}`, lat: row * CELL, lon: col * lonStep(row), dLat: CELL, dLon: lonStep(row) });

function cellsAround(lat, lon, radius) {
    const dLat = radius / 111_320;
    const cells = [];
    for (let row = Math.floor((lat - dLat) / CELL); row <= Math.floor((lat + dLat) / CELL); row++) {
        const step = lonStep(row);
        const dLon = dLat / Math.max(0.05, Math.cos(rad(lat)));
        for (let col = Math.floor((lon - dLon) / step); col <= Math.floor((lon + dLon) / step); col++) cells.push(cellOf(row, col));
    }
    return cells;
}

function habitatOf(cover) {
    let dominant = 50, best = -1, wild = 0;
    for (const [cls, share] of Object.entries(cover)) {
        const h = HABITATS[cls];
        if (!h) continue;
        wild += share * h.wild;
        if (share > best) { best = share; dominant = Number(cls); }
    }
    return { ...HABITATS[dominant], wild: Math.min(1, Math.max(0, wild)) };
}

// The wilder the place, the rarer the cards: city ≈ 70/24/5/0.8/0.08 %, deep forest ≈ 35/28/20/8/2 %.
const rarityWeights = (w) => ({
    common: 70 - 35 * w,
    uncommon: 24 + 4 * w,
    rare: 5 + 15 * w,
    epic: 0.8 + 7.2 * w,
    legendary: 0.08 + 1.92 * w,
});

function pickRarity(r, weights, available) {
    // a tier with only a handful of local species is scaled down, so they do not show up everywhere
    const entries = RARITIES.filter((k) => available[k]).map((k) => [k, weights[k] * Math.min(1, available[k].length / 15)]);
    let roll = r * entries.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of entries) if ((roll -= v) < 0) return k;
    return entries[entries.length - 1][0];
}

function pickCard(r, cards, types) {
    const weight = (c) => (types[c.type] ?? 1) * (c.weight || 1);
    let roll = r * cards.reduce((s, c) => s + weight(c), 0);
    for (const c of cards) if ((roll -= weight(c)) < 0) return c;
    return cards[cards.length - 1];
}

// ---------- caches: land cover per grid cell, species pool per ~5 km cell ----------

async function coversOf(db, cells) {
    const keys = cells.map((c) => c.key);
    const { rows } = await db.query(`SELECT cell, cover FROM explore_cells WHERE cell = ANY($1)`, [keys]);
    const map = new Map(rows.map((r) => [r.cell, r.cover]));
    const missing = cells.filter((c) => !map.has(c.key));
    const computed = await Promise.all(missing.map((c) => landCover(c.lat + c.dLat / 2, c.lon + c.dLon / 2, 10).catch(() => null)));
    const fresh = [];
    missing.forEach((c, i) => {
        if (!computed[i]) return; // WorldCover unreachable: the cell spawns nothing this time
        map.set(c.key, computed[i]);
        fresh.push([c.key, computed[i]]);
    });
    if (fresh.length) {
        await db.query(
            `INSERT INTO explore_cells (cell, cover) SELECT * FROM unnest($1::text[], $2::jsonb[]) ON CONFLICT (cell) DO NOTHING`,
            [fresh.map((f) => f[0]), fresh.map((f) => JSON.stringify(f[1]))]);
    }
    return map;
}

const POOL_FIELDS = `id, num, name, sci_name, type, rarity, thumb_url`;
const pools = new Map(); // pool key -> Promise<{ [rarity]: card[] }>
let fallbackPool;

// speciesKey -> number of occurrences recorded in the box. Card rarity follows popularity, so the
// most recorded species are mostly rare/epic/legendary cards: the long tail (up to 4000 species)
// brings the common ones.
async function gbifSpecies(lat, lon, half) {
    const q = `decimalLatitude=${(lat - half).toFixed(4)},${(lat + half).toFixed(4)}&decimalLongitude=${(lon - half).toFixed(4)},${(lon + half).toFixed(4)}`;
    const pages = await Promise.all([0, 1000, 2000, 3000].map(async (offset) => {
        const res = await fetch(`https://api.gbif.org/v1/occurrence/search?${q}&limit=0&facet=speciesKey&facetLimit=1000&facetOffset=${offset}&occurrenceStatus=PRESENT&hasGeospatialIssue=false`, {
            headers: { 'User-Agent': 'NatureDex/1.0 (https://naturedex.fr)' }, signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`GBIF ${res.status}`);
        return (await res.json()).facets?.[0]?.counts || [];
    }));
    return new Map(pages.flat().map((c) => [Number(c.name), c.count]));
}

const byRarity = (cards) => {
    const out = {};
    for (const c of cards.sort((a, b) => a.id - b.id)) (out[c.rarity] ??= []).push(c);
    return out;
};

async function eligibleCards(db, where, params, tail = '', extra = '') {
    const { rows } = await db.query(
        `SELECT ${POOL_FIELDS}${extra} FROM cards WHERE ${where} AND rarity <> 'secret' AND type <> ALL($${params.length + 1}) ${tail}`, [...params, EXCLUDED_TYPES]);
    return rows;
}

// A pool is { cardId: weight }: species recorded more often nearby show up more often
// (sqrt, so the pigeon does not drown everything) within the rarity tier rolled by habitat.
async function loadPool(db, key) {
    const { rows: [cached] } = await db.query(`SELECT cards FROM explore_pools WHERE cell = $1 AND at > now() - interval '60 days'`, [key]);
    let weights = cached?.cards;
    if (!weights) {
        const [pr, pc] = key.split(':').map(Number);
        const lat = (pr + 0.5) * POOL_CELL, lon = (pc + 0.5) * POOL_CELL;
        weights = {};
        const match = async (counts) => {
            if (!counts.size) return;
            for (const c of await eligibleCards(db, `gbif_key = ANY($1)`, [[...counts.keys()]], '', ', gbif_key')) {
                weights[c.id] ??= Math.max(1, Math.round(Math.sqrt(counts.get(c.gbif_key))));
            }
        };
        await match(await gbifSpecies(lat, lon, POOL_CELL / 2));
        if (Object.keys(weights).length < 40) await match(await gbifSpecies(lat, lon, 0.25));
        await db.query(
            `INSERT INTO explore_pools (cell, cards) VALUES ($1, $2) ON CONFLICT (cell) DO UPDATE SET cards = EXCLUDED.cards, at = now()`, [key, weights]);
    }
    if (Object.keys(weights).length < 20) { // open sea, desert…: the most popular wild species
        fallbackPool ??= eligibleCards(db, `gbif_key IS NOT NULL AND rarity IN ('common', 'uncommon', 'rare')`, [], 'ORDER BY views DESC LIMIT 1500')
            .then(byRarity).catch((e) => { fallbackPool = null; throw e; });
        return fallbackPool;
    }
    const cards = await eligibleCards(db, `id = ANY($1)`, [Object.keys(weights).map(Number)]);
    return byRarity(cards.map((c) => ({ ...c, weight: weights[c.id] })));
}

function poolFor(db, lat, lon) {
    const key = `${Math.floor(lat / POOL_CELL)}:${Math.floor(lon / POOL_CELL)}`;
    if (!pools.has(key)) {
        if (pools.size > 200) pools.delete(pools.keys().next().value);
        const p = loadPool(db, key);
        p.catch(() => pools.delete(key));
        pools.set(key, p);
    }
    return pools.get(key);
}

// ---------- spawns ----------

async function spawnsOf(db, cells, slot) {
    const covers = await coversOf(db, cells);
    const out = [];
    for (const cell of cells) {
        const cover = covers.get(cell.key);
        if (!cover) continue;
        const habitat = habitatOf(cover);
        const h = hashBytes(`${cell.key}:${slot}`);
        // 0-2 cards per cell, one more is likely in wild places
        let count = unit(h, 0) < 0.3 ? 0 : unit(h, 0) < 0.8 ? 1 : 2;
        if (unit(h, 4) < habitat.wild * 0.5) count++;
        if (!count) continue;
        const pool = await poolFor(db, cell.lat + cell.dLat / 2, cell.lon + cell.dLon / 2);
        for (let i = 0; i < count; i++) {
            const s = hashBytes(`${cell.key}:${slot}:${i}`);
            const rarity = pickRarity(unit(s, 0), rarityWeights(habitat.wild), pool);
            const card = pickCard(unit(s, 4), pool[rarity], habitat.types);
            out.push({
                id: `${cell.key}:${slot}:${i}`,
                lat: cell.lat + (0.1 + 0.8 * unit(s, 8)) * cell.dLat,
                lon: cell.lon + (0.1 + 0.8 * unit(s, 12)) * cell.dLon,
                habitat: habitat.key,
                card,
            });
        }
    }
    return out;
}

async function findSpawn(db, id) {
    const m = /^(-?\d+):(-?\d+):(\d+):(\d)$/.exec(String(id || ''));
    if (!m) return null;
    const [, row, col, slot] = m.map(Number);
    const spawns = await spawnsOf(db, [cellOf(row, col)], slot);
    return spawns.find((s) => s.id === id) ? { ...spawns.find((s) => s.id === id), slot } : null;
}

function readPoint(body, HttpError) {
    const lat = Number(body.lat), lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new HttpError(400, 'Position invalide');
    return { lat, lon };
}

export function exploreActions({ requireUser, inTransaction, HttpError, publicUser }) {
    // Keeps only the last position. A jump faster than MAX_SPEED (GPS spoofing, a plane) blocks
    // catching for as long as the trip would take at that speed, capped at MAX_COOLDOWN.
    async function track(db, userId, { lat, lon }) {
        const { rows: [last] } = await db.query(`SELECT lat, lon, at, cooldown_until FROM explore_positions WHERE user_id = $1`, [userId]);
        let cooldown = last?.cooldown_until && new Date(last.cooldown_until) > new Date() ? new Date(last.cooldown_until) : null;
        if (last) {
            const d = distance(last.lat, last.lon, lat, lon);
            const dt = Math.max(1, (Date.now() - new Date(last.at).getTime()) / 1000);
            if (d > 1000 && d / dt > MAX_SPEED) {
                const until = new Date(Date.now() + Math.min(MAX_COOLDOWN, d / MAX_SPEED) * 1000);
                if (!cooldown || until > cooldown) cooldown = until;
            }
        }
        await db.query(
            `INSERT INTO explore_positions (user_id, lat, lon, at, cooldown_until) VALUES ($1, $2, $3, now(), $4)
             ON CONFLICT (user_id) DO UPDATE SET lat = $2, lon = $3, at = now(), cooldown_until = $4`, [userId, lat, lon, cooldown]);
        return cooldown;
    }

    const caughtToday = async (db, userId) => (await db.query(
        `SELECT count(*)::int AS n FROM explore_catches WHERE user_id = $1 AND caught AND (at AT TIME ZONE 'Europe/Paris')::date = ${PARIS_DAY}`,
        [userId])).rows[0].n;

    return {
        // { lat, lon } → cards around, the habitat here, daily counter
        async exploreNearby(db, body, event) {
            const user = await requireUser(db, event);
            const here = readPoint(body, HttpError);
            const cooldown = await track(db, user.id, here);
            const slot = Math.floor(Date.now() / SLOT_MS);
            const spawns = (await spawnsOf(db, cellsAround(here.lat, here.lon, VIEW_RADIUS), slot))
                .map((s) => ({ ...s, distance: Math.round(distance(here.lat, here.lon, s.lat, s.lon)) }))
                .filter((s) => s.distance <= VIEW_RADIUS);
            const { rows: mine } = await db.query(`SELECT spawn, caught, tries FROM explore_catches WHERE user_id = $1 AND spawn = ANY($2)`,
                [user.id, spawns.map((s) => s.id)]);
            const state = new Map(mine.map((m) => [m.spawn, m]));
            const { rows: owned } = await db.query(`SELECT card_id FROM user_cards WHERE user_id = $1 AND card_id = ANY($2)`,
                [user.id, spawns.map((s) => s.card.id)]);
            const ownedSet = new Set(owned.map((o) => o.card_id));
            const [cover] = (await coversOf(db, [cellOf(Math.floor(here.lat / CELL), Math.floor(here.lon / lonStep(Math.floor(here.lat / CELL))))])).values();
            const habitat = cover ? habitatOf(cover) : null;
            return {
                spawns: spawns.map((s) => {
                    const st = state.get(s.id);
                    return { ...s, owned: ownedSet.has(s.card.id), state: st?.caught ? 'caught' : st?.tries >= MAX_TRIES ? 'fled' : 'wild', tries: st?.tries || 0 };
                }),
                habitat: habitat && { key: habitat.key, label: habitat.label, wild: Math.round(habitat.wild * 100) / 100 },
                endsAt: new Date((slot + 1) * SLOT_MS).toISOString(),
                cooldownUntil: cooldown?.toISOString() || null,
                daily: { caught: await caughtToday(db, user.id), max: DAILY_CATCHES },
                catchRadius: CATCH_RADIUS,
                maxTries: MAX_TRIES,
            };
        },

        // { spawn, lat, lon, throw: 'perfect' | 'good' | 'miss' } → caught (card added) / escaped / fled
        async exploreCatch(db, body, event) {
            const user = await requireUser(db, event);
            const here = readPoint(body, HttpError);
            const spawn = await findSpawn(db, body.spawn);
            const slot = Math.floor(Date.now() / SLOT_MS);
            if (!spawn) throw new HttpError(404, 'Cette carte est introuvable');
            if (spawn.slot !== slot && !(spawn.slot === slot - 1 && Date.now() - slot * SLOT_MS < 120_000)) {
                throw new HttpError(410, "Trop tard : cette carte est repartie dans la nature");
            }
            const cooldown = await track(db, user.id, here);
            if (cooldown) throw new HttpError(429, `Déplacement trop rapide détecté : la capture reprend à ${cooldown.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`);
            if (distance(here.lat, here.lon, spawn.lat, spawn.lon) > CATCH_RADIUS) throw new HttpError(400, 'Approche-toi encore un peu de la carte');
            const quality = ['perfect', 'good', 'miss'].includes(body.throw) ? body.throw : 'miss';

            const result = await inTransaction(db, async (client) => {
                await client.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
                if (await caughtToday(client, user.id) >= DAILY_CATCHES) {
                    throw new HttpError(429, `Tu as attrapé ${DAILY_CATCHES} cartes aujourd'hui : la nature se repose, reviens demain !`);
                }
                const { rows: [row] } = await client.query(
                    `INSERT INTO explore_catches (user_id, spawn, card_id, habitat) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, spawn) DO UPDATE SET spawn = EXCLUDED.spawn RETURNING tries, caught`,
                    [user.id, spawn.id, spawn.card.id, spawn.habitat]);
                if (row.caught) throw new HttpError(409, 'Tu as déjà attrapé cette carte');
                if (row.tries >= MAX_TRIES) throw new HttpError(410, "Cette carte s'est enfuie");
                const chance = quality === 'miss' ? 0 : Math.min(0.97, CATCH_CHANCE[spawn.card.rarity] + (quality === 'perfect' ? PERFECT_BONUS : 0));
                const caught = crypto.randomInt(1_000_000) < chance * 1_000_000;
                const tries = row.tries + 1;
                await client.query(`UPDATE explore_catches SET tries = $3, caught = $4, at = now() WHERE user_id = $1 AND spawn = $2`,
                    [user.id, spawn.id, tries, caught]);
                let isNew = false;
                if (caught) {
                    const { rows: [uc] } = await client.query(
                        `INSERT INTO user_cards (user_id, card_id) VALUES ($1, $2)
                         ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_cards.count + 1 RETURNING count`, [user.id, spawn.card.id]);
                    isNew = uc.count === 1;
                }
                return { caught, isNew, tries, fled: !caught && tries >= MAX_TRIES };
            });
            let card = spawn.card;
            if (result.caught) {
                ({ rows: [card] } = await db.query(
                    `SELECT id, num, name, sci_name, type, rarity, views, image_url, thumb_url, extract, wiki_url, iucn, stats FROM cards WHERE id = $1`, [spawn.card.id]));
            }
            const { rows: [fresh] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
            return { ...result, card, maxTries: MAX_TRIES, user: await publicUser(db, fresh), daily: { caught: await caughtToday(db, user.id), max: DAILY_CATCHES } };
        },
    };
}
