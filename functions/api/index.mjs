/**
 * NatureDex API
 *
 * Endpoint: https://yourdomain.com/api — POST { action, ...params }
 * Auth: `Authorization: Bearer <token>` (from register / login)
 *
 * Environment variables:
 * - DATABASE_URL (Postgres connection string)
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const BOOSTER_PRICE = 100;
const DAILY_COINS = 100;
const DAILY_COOLDOWN_MS = 20 * 3600 * 1000;
const SESSION_DAYS = 60;
const RECYCLE_VALUE = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 150, secret: 1000 };

// One booster = 6 slots, each a weighted rarity table. The last slot hides the 50 secret
// cards: 1 booster in 500 (0.2 %), so one given secret card about 1 in 25,000.
const BOOSTER_SLOTS = [
    ...Array(4).fill({ common: 70, uncommon: 30 }),
    { uncommon: 80, rare: 17, epic: 3 },
    { rare: 698, epic: 220, legendary: 80, secret: 2 },
];

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

const json = (data, statusCode = 200) => ({ statusCode, headers, body: JSON.stringify(data) });

let pool;
function getPool() {
    if (!pool) {
        pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: true },
            max: 3,
            idleTimeoutMillis: 60_000,
            connectionTimeoutMillis: 5_000,
        });
        pool.on('error', (err) => console.error('[pg] idle connection dropped:', err.message));
    }
    return pool;
}

// ---------- auth ----------

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    const [salt, hex] = stored.split(':');
    const hash = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}

async function createSession(db, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
        `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
        [token, userId]
    );
    return token;
}

async function requireUser(db, event) {
    const auth = event.headers?.authorization || event.headers?.Authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Non connecté');
    const { rows } = await db.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()`,
        [token]
    );
    if (!rows[0]) throw new HttpError(401, 'Session expirée');
    return rows[0];
}

async function publicUser(db, user) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS discovered, COALESCE(SUM(count), 0)::int AS owned,
                (SELECT COUNT(*)::int FROM cards) AS total
         FROM user_cards WHERE user_id = $1`,
        [user.id]
    );
    const nextDaily = user.last_daily ? new Date(user.last_daily).getTime() + DAILY_COOLDOWN_MS : 0;
    return {
        username: user.username,
        coins: user.coins,
        boosters: user.boosters,
        boosterPrice: BOOSTER_PRICE,
        dailyCoins: DAILY_COINS,
        nextDailyAt: nextDaily > Date.now() ? new Date(nextDaily).toISOString() : null,
        recycleValue: RECYCLE_VALUE,
        ...rows[0],
    };
}

// ---------- booster draw ----------

let rarityPools, poolsAt = 0; // { rarity: [cardId, ...] } — cached per Lambda container for 10 min
async function getRarityPools(db) {
    if (!rarityPools || Date.now() - poolsAt > 600_000) {
        const { rows } = await db.query(`SELECT rarity, array_agg(id) AS ids FROM cards GROUP BY rarity`);
        if (!rows.length) throw new HttpError(503, 'Le catalogue de cartes est en cours de préparation');
        rarityPools = Object.fromEntries(rows.map((r) => [r.rarity, r.ids]));
        poolsAt = Date.now();
    }
    return rarityPools;
}

function rollRarity(table, pools) {
    const entries = Object.entries(table).filter(([r]) => pools[r]?.length);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = crypto.randomInt(total);
    for (const [rarity, weight] of entries) {
        if ((roll -= weight) < 0) return rarity;
    }
    return entries[0][0];
}

function drawBooster(pools) {
    const picked = new Set();
    return BOOSTER_SLOTS.map((table) => {
        const ids = pools[rollRarity(table, pools)];
        let id;
        do { id = ids[crypto.randomInt(ids.length)]; } while (picked.has(id) && picked.size < ids.length);
        picked.add(id);
        return id;
    });
}

// ---------- daily challenges ----------

// Progress counts what the player pulled from boosters today. Types roughly match their
// share of the catalogue, so goals stay reachable with the daily coins.
const CHALLENGES = [
    { key: 'forest', icon: 'leaf', title: 'Gardiens de la Forêt', text: 'Obtiens 3 cartes Forêt : plante, arbre ou champignon', goal: 3, reward: 100, types: ['plant', 'tree', 'fungus', 'mold'] },
    { key: 'water', icon: 'drop', title: 'Sources de Vie', text: 'Obtiens 2 cartes Eau : poisson, créature marine ou algue', goal: 2, reward: 100, types: ['fish', 'marine', 'alga'] },
    { key: 'sky', icon: 'bird', title: 'Maîtres du Ciel', text: 'Obtiens 2 cartes Oiseau', goal: 2, reward: 80, types: ['bird'] },
    { key: 'scales', icon: 'sun', title: 'Sang-froid', text: 'Obtiens 2 cartes Reptile ou amphibien', goal: 2, reward: 80, types: ['reptile'] },
    { key: 'bugs', icon: 'bug', title: 'Petites Bêtes', text: 'Obtiens 2 cartes Insecte ou arachnide', goal: 2, reward: 80, types: ['arthropod'] },
    { key: 'wild', icon: 'paw', title: 'Instinct Sauvage', text: 'Obtiens 1 carte Mammifère', goal: 1, reward: 80, types: ['mammal'] },
    { key: 'ages', icon: 'bone', title: 'Mémoire des Âges', text: 'Obtiens 1 carte Fossile', goal: 1, reward: 80, types: ['fossil'] },
    { key: 'explorer', icon: 'compass', title: 'Explorateur', text: 'Ouvre 2 boosters', goal: 2, reward: 60, kind: 'open' },
    { key: 'expert', icon: 'gem', title: 'Œil d\'Expert', text: 'Obtiens une carte Rare ou mieux', goal: 1, reward: 60, kind: 'rare' },
    { key: 'naturalist', icon: 'sparkles', title: 'Naturaliste', text: 'Découvre 5 nouvelles espèces', goal: 5, reward: 100, kind: 'new' },
];
const DAILY_CHALLENGES = 4;

// Same picks for every player on a given day: the two "type" challenges first, then two others.
function challengesOf(day) {
    let seed = Number(day.replaceAll('-', ''));
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const shuffle = (list) => list.map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    const byType = shuffle(CHALLENGES.filter((c) => c.types));
    const others = shuffle(CHALLENGES.filter((c) => !c.types));
    return [...byType.slice(0, 2), ...others.slice(0, 1), ...byType.slice(2, DAILY_CHALLENGES - 1)];
}

async function dailyChallenges(db, userId) {
    const { rows: [{ day }] } = await db.query(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day`);
    const today = `(o.at AT TIME ZONE 'Europe/Paris')::date = $2::date`;
    const [{ rows: pulled }, { rows: [stats] }, { rows: claims }] = await Promise.all([
        db.query(`SELECT c.type, c.rarity FROM openings o CROSS JOIN unnest(o.card_ids) AS u(card_id) JOIN cards c ON c.id = u.card_id
                  WHERE o.user_id = $1 AND ${today}`, [userId, day]),
        db.query(`SELECT (SELECT COUNT(*)::int FROM openings o WHERE o.user_id = $1 AND ${today}) AS opened,
                         (SELECT COUNT(*)::int FROM user_cards uc WHERE uc.user_id = $1 AND (uc.first_at AT TIME ZONE 'Europe/Paris')::date = $2::date) AS discovered`,
        [userId, day]),
        db.query(`SELECT key FROM challenge_claims WHERE user_id = $1 AND day = $2`, [userId, day]),
    ]);
    const claimed = new Set(claims.map((r) => r.key));
    const progressOf = (c) => {
        if (c.kind === 'open') return stats.opened;
        if (c.kind === 'new') return stats.discovered;
        if (c.kind === 'rare') return pulled.filter((p) => ['rare', 'epic', 'legendary', 'secret'].includes(p.rarity)).length;
        return pulled.filter((p) => c.types.includes(p.type)).length;
    };
    return {
        day,
        challenges: challengesOf(day).map(({ types, kind, ...c }) => ({
            ...c, progress: Math.min(progressOf({ types, kind }), c.goal), claimed: claimed.has(c.key),
        })),
    };
}

const CARD_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.image_url, c.thumb_url,
                     c.extract, c.wiki_url, c.iucn, c.stats`;

const LIGHT_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.thumb_url, (c.stats->>'hp')::int AS hp`;
const RARITY_ORDER = `CASE c.rarity WHEN 'secret' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 WHEN 'uncommon' THEN 1 ELSE 0 END`;
let catalogCache, catalogAt = 0; // per Lambda container, 10 min

// The catalogue builder skips article intros (too many pages to fetch in bulk):
// fetch one the first time somebody opens the card, and keep it.
async function fillExtract(db, card) {
    const title = card.wiki_url.split('/wiki/').pop();
    const res = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${title}`, {
        headers: { 'User-Agent': 'NaturDex/0.1 (OpenKBS card game; contact via openkbs.com)' },
        signal: AbortSignal.timeout(4_000),
    }).catch(() => null);
    const extract = res?.ok ? (await res.json()).extract : null;
    if (extract) await db.query(`UPDATE cards SET extract = $2 WHERE id = $1`, [card.id, extract]);
    return extract;
}

// ---------- actions ----------

const actions = {
    async register(db, body) {
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) {
            throw new HttpError(400, 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -)');
        }
        if (password.length < 6) throw new HttpError(400, 'Mot de passe : 6 caractères minimum');
        const exists = await db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1)`, [username]);
        if (exists.rows[0]) throw new HttpError(409, 'Ce pseudo est déjà pris');
        const { rows } = await db.query(
            `INSERT INTO users (username, pass_hash) VALUES ($1, $2) RETURNING *`,
            [username, await hashPassword(password)]
        );
        return { token: await createSession(db, rows[0].id), user: await publicUser(db, rows[0]) };
    },

    async login(db, body) {
        const { rows } = await db.query(`SELECT * FROM users WHERE lower(username) = lower($1)`, [String(body.username || '').trim()]);
        if (!rows[0] || !(await verifyPassword(String(body.password || ''), rows[0].pass_hash))) {
            throw new HttpError(401, 'Pseudo ou mot de passe incorrect');
        }
        return { token: await createSession(db, rows[0].id), user: await publicUser(db, rows[0]) };
    },

    async logout(db, body, event) {
        const token = (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        await db.query(`DELETE FROM sessions WHERE token = $1`, [token]);
        return { ok: true };
    },

    async me(db, body, event) {
        return { user: await publicUser(db, await requireUser(db, event)) };
    },

    async claimDaily(db, body, event) {
        const user = await requireUser(db, event);
        const { rows } = await db.query(
            `UPDATE users SET coins = coins + $2, last_daily = now()
             WHERE id = $1 AND (last_daily IS NULL OR last_daily < now() - make_interval(secs => $3))
             RETURNING *`,
            [user.id, DAILY_COINS, DAILY_COOLDOWN_MS / 1000]
        );
        if (!rows[0]) throw new HttpError(429, 'Bonus déjà récupéré, reviens plus tard');
        return { user: await publicUser(db, rows[0]) };
    },

    async buyBooster(db, body, event) {
        const user = await requireUser(db, event);
        const { rows } = await db.query(
            `UPDATE users SET coins = coins - $2, boosters = boosters + 1
             WHERE id = $1 AND coins >= $2 RETURNING *`,
            [user.id, BOOSTER_PRICE]
        );
        if (!rows[0]) throw new HttpError(402, 'Pas assez de pièces');
        return { user: await publicUser(db, rows[0]) };
    },

    async openBooster(db, body, event) {
        const user = await requireUser(db, event);
        const pools = await getRarityPools(db);
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const { rows: [locked] } = await client.query(
                `UPDATE users SET boosters = boosters - 1 WHERE id = $1 AND boosters > 0 RETURNING *`,
                [user.id]
            );
            if (!locked) throw new HttpError(402, 'Aucun booster à ouvrir');

            const ids = drawBooster(pools);
            const { rows: before } = await client.query(
                `SELECT card_id FROM user_cards WHERE user_id = $1 AND card_id = ANY($2)`,
                [user.id, ids]
            );
            const ownedBefore = new Set(before.map((r) => r.card_id));
            for (const id of ids) {
                await client.query(
                    `INSERT INTO user_cards (user_id, card_id) VALUES ($1, $2)
                     ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_cards.count + 1`,
                    [user.id, id]
                );
            }
            await client.query(`INSERT INTO openings (user_id, card_ids) VALUES ($1, $2)`, [user.id, ids]);
            await client.query('COMMIT');

            const { rows: cards } = await db.query(`SELECT ${CARD_FIELDS} FROM cards c WHERE c.id = ANY($1)`, [ids]);
            const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
            const seen = new Set();
            const pack = ids.map((id) => {
                const isNew = !ownedBefore.has(id) && !seen.has(id);
                seen.add(id);
                return { ...byId[id], isNew };
            });
            return { cards: pack, user: await publicUser(db, locked) };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    },

    // Catalogue overview (tens of thousands of cards: never sent whole): counts per type
    // and rarity, plus a sample of cards for the landing page and the demo booster.
    async catalog(db) {
        if (!catalogCache || Date.now() - catalogAt > 600_000) {
            const { rows: counts } = await db.query(`SELECT type, rarity, COUNT(*)::int AS n FROM cards GROUP BY 1, 2`);
            const { rows: cards } = await db.query(
                `(SELECT * FROM (SELECT ${LIGHT_FIELDS}, row_number() OVER (PARTITION BY c.type, c.rarity ORDER BY c.views DESC) AS k
                    FROM cards c WHERE c.rarity IN ('legendary', 'epic')) t WHERE k <= 4)
                 UNION ALL
                 (SELECT ${LIGHT_FIELDS}, 0 FROM cards c WHERE c.rarity IN ('rare', 'uncommon', 'common') ORDER BY random() LIMIT 300)`
            );
            const types = {};
            for (const { type, rarity, n } of counts) (types[type] ||= {})[rarity] = n;
            catalogCache = { total: counts.reduce((sum, r) => sum + r.n, 0), types, cards: cards.map(({ k, ...c }) => c) };
            catalogAt = Date.now();
        }
        return catalogCache;
    },

    // One page of the collection grid. Undiscovered cards only reveal their type and rarity.
    async browse(db, body, event) {
        const user = await requireUser(db, event);
        const limit = Math.min(Number(body.limit) || 60, 120);
        const offset = Math.max(Number(body.offset) || 0, 0);
        const q = String(body.query || '').trim();
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count, COUNT(*) OVER()::int AS matches
             FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1
             WHERE ($2::text IS NULL OR c.type = $2) AND ($3::text IS NULL OR c.rarity = $3)
               AND (NOT $4 OR uc.count IS NOT NULL)
               AND ($5 = '' OR (uc.count IS NOT NULL AND (c.name ILIKE '%' || $5 || '%' OR c.sci_name ILIKE '%' || $5 || '%')))
             ORDER BY uc.count IS NULL, ${RARITY_ORDER} DESC, c.num
             LIMIT $6 OFFSET $7`,
            [user.id, body.type || null, body.rarity || null, Boolean(body.onlyOwned || q), q, limit, offset]
        );
        return {
            matches: rows[0]?.matches || 0,
            cards: rows.map(({ matches, ...c }) => (c.count ? c : { id: c.id, num: c.num, type: c.type, rarity: c.rarity })),
        };
    },

    async collection(db, body, event) {
        const user = await requireUser(db, event);
        const { rows } = await db.query(
            `SELECT uc.card_id, uc.count, c.type, c.rarity FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE uc.user_id = $1`,
            [user.id]
        );
        return {
            owned: Object.fromEntries(rows.map((r) => [r.card_id, r.count])),
            info: Object.fromEntries(rows.map((r) => [r.card_id, [r.type, r.rarity]])),
        };
    },

    async card(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [card] } = await db.query(
            `SELECT ${CARD_FIELDS}, COALESCE(uc.count, 0) AS count FROM cards c
             LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $2 WHERE c.id = $1`,
            [Number(body.id), user.id]
        );
        if (!card) throw new HttpError(404, 'Carte introuvable');
        // Undiscovered cards stay a mystery.
        if (!card.count) return { card: { id: card.id, num: card.num, type: card.type, rarity: card.rarity, count: 0 } };
        if (!card.extract) card.extract = await fillExtract(db, card);
        return { card };
    },

    async challenges(db, body, event) {
        const user = await requireUser(db, event);
        return dailyChallenges(db, user.id);
    },

    async claimChallenge(db, body, event) {
        const user = await requireUser(db, event);
        const { day, challenges } = await dailyChallenges(db, user.id);
        const challenge = challenges.find((c) => c.key === body.key);
        if (!challenge) throw new HttpError(404, 'Ce défi n\'est pas proposé aujourd\'hui');
        if (challenge.progress < challenge.goal) throw new HttpError(400, 'Défi pas encore terminé');
        const { rowCount } = await db.query(
            `INSERT INTO challenge_claims (user_id, day, key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [user.id, day, challenge.key]
        );
        if (!rowCount) throw new HttpError(409, 'Récompense déjà récupérée');
        const { rows: [updated] } = await db.query(`UPDATE users SET coins = coins + $2 WHERE id = $1 RETURNING *`, [user.id, challenge.reward]);
        return { user: await publicUser(db, updated), ...(await dailyChallenges(db, user.id)) };
    },

    async recycle(db, body, event) {
        const user = await requireUser(db, event);
        const cardId = body.cardId ? Number(body.cardId) : null; // null = every duplicate
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `WITH old AS (
                    SELECT card_id, count FROM user_cards
                    WHERE user_id = $1 AND count > 1 AND ($2::int IS NULL OR card_id = $2) FOR UPDATE
                 )
                 UPDATE user_cards uc SET count = 1 FROM old JOIN cards c ON c.id = old.card_id
                 WHERE uc.user_id = $1 AND uc.card_id = old.card_id
                 RETURNING c.rarity, old.count - 1 AS extra`,
                [user.id, cardId]
            );
            const recycled = rows.reduce((sum, r) => sum + r.extra, 0);
            const coins = rows.reduce((sum, r) => sum + r.extra * RECYCLE_VALUE[r.rarity], 0);
            const { rows: [updated] } = await client.query(
                `UPDATE users SET coins = coins + $2 WHERE id = $1 RETURNING *`,
                [user.id, coins]
            );
            await client.query('COMMIT');
            return { recycled, coins, user: await publicUser(db, updated) };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    },
};

export const handler = async (event) => {
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const fn = actions[body.action];
        if (!fn) return json({ error: 'Unknown action', available: Object.keys(actions) }, 400);
        return json(await fn(getPool(), body, event));
    } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status);
        console.error(error);
        return json({ error: 'Erreur serveur' }, 500);
    }
};
