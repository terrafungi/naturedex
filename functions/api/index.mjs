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

// Two currencies: « graines » (users.coins) only open boosters, « pépites » (users.nuggets)
// are the auction-house money.
const BOOSTER_PRICE = 100; // graines for one opening once the free charges are spent
const DAILY_COINS = 100;
const MAX_CHARGES = 10;
const CHARGE_MS = 30 * 60 * 1000;
const DAILY_COOLDOWN_MS = 20 * 3600 * 1000;
const SESSION_DAYS = 60;
// pépites per recycled duplicate
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

// Free openings: `charges` as of `charges_at`, plus one every 30 minutes up to the cap.
function chargeState(user, now = Date.now()) {
    const from = new Date(user.charges_at).getTime();
    const ticks = Math.max(0, Math.floor((now - from) / CHARGE_MS));
    const charges = Math.min(MAX_CHARGES, user.charges + ticks);
    return { charges, ticks, from, nextAt: charges >= MAX_CHARGES ? null : from + (ticks + 1) * CHARGE_MS };
}

async function publicUser(db, user) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS discovered, COALESCE(SUM(count), 0)::int AS owned,
                (SELECT COUNT(*)::int FROM cards) AS total
         FROM user_cards WHERE user_id = $1`,
        [user.id]
    );
    const charge = chargeState(user);
    const nextDaily = user.last_daily ? new Date(user.last_daily).getTime() + DAILY_COOLDOWN_MS : 0;
    return {
        username: user.username,
        coins: user.coins,
        nuggets: user.nuggets,
        boosters: user.boosters,
        charges: charge.charges,
        maxCharges: MAX_CHARGES,
        chargeMinutes: CHARGE_MS / 60000,
        nextChargeAt: charge.nextAt && new Date(charge.nextAt).toISOString(),
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

const RARITY_ORDER = `CASE c.rarity WHEN 'secret' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 WHEN 'uncommon' THEN 1 ELSE 0 END`;

// ---------- trophies ----------

// Permanent achievements, in series of growing goals. Each tier pays graines and pépites.
const TYPE_NAMES = {
    mammal: 'Mammifères', bird: 'Oiseaux', reptile: 'Reptiles & amphibiens', fish: 'Poissons',
    arthropod: 'Insectes & arachnides', marine: 'Créatures marines', plant: 'Plantes', tree: 'Arbres',
    alga: 'Algues', fungus: 'Champignons', mold: 'Moisissures & levures', bacteria: 'Bactéries', virus: 'Virus', fossil: 'Fossiles',
};
const TIER_COINS = [50, 100, 200, 300, 500, 800, 1200, 2000, 3000];
const TIER_NUGGETS = [20, 50, 100, 150, 250, 400, 600, 1000, 1500];

function series(group, icon, metric, steps, text) {
    return steps.map(([goal, title], i) => ({
        key: `${metric}-${goal}`, group, icon, metric, goal, title, text: text(goal), tier: i,
        coins: TIER_COINS[i], nuggets: TIER_NUGGETS[i],
    }));
}
const n = (v) => v.toLocaleString('fr-FR');

const TROPHIES = [
    ...series('Collection', 'book', 'discovered', [
        [10, 'Premiers pas'], [50, 'Herbier de poche'], [100, 'Carnet bien rempli'], [250, 'Naturaliste en herbe'],
        [500, 'Explorateur du vivant'], [1000, 'Biologiste'], [2500, 'Encyclopédiste'], [5000, 'Gardien de l\'Arche'], [10000, 'Linné des temps modernes'],
    ], (g) => `Découvre ${n(g)} espèces différentes`),
    ...series('Collection', 'layers', 'owned', [[100, 'Petit tas'], [500, 'Classeur plein'], [2000, 'Malle aux trésors'], [5000, 'Cabinet de curiosités']],
        (g) => `Possède ${n(g)} cartes au total, doublons compris`),
    ...series('Collection', 'globe', 'types', [[14, 'Arche de Noé']], () => 'Possède au moins une carte de chaque type'),
    ...series('Collection', 'globe', 'types10', [[14, 'Tour du monde vivant']], () => 'Découvre 10 espèces de chaque type'),
    ...series('Collection', 'copy', 'maxCount', [[5, 'Coup de cœur'], [10, 'Obsession']], (g) => `Possède ${g} exemplaires d'une même carte`),
    ...series('Boosters', 'package', 'opened', [
        [1, 'Premier booster'], [10, 'Déchireur d\'emballages'], [50, 'Accro aux boosters'], [100, 'Centurion'],
        [250, 'Collectionneur compulsif'], [500, 'Montagne de papier'], [1000, 'Légende des boosters'],
    ], (g) => `Ouvre ${n(g)} booster${g > 1 ? 's' : ''}`),
    ...series('Raretés', 'star', 'rarity:rare', [[1, 'Œil vif'], [25, 'Chasseur de raretés'], [100, 'Trésor de Rares']], (g) => `Découvre ${g} espèce${g > 1 ? 's' : ''} Rare${g > 1 ? 's' : ''}`),
    ...series('Raretés', 'gem', 'rarity:epic', [[1, 'Reflet holographique'], [10, 'Galerie Épique'], [50, 'Collection Épique']], (g) => `Découvre ${g} espèce${g > 1 ? 's' : ''} Épique${g > 1 ? 's' : ''}`),
    ...series('Raretés', 'crown', 'rarity:legendary', [[1, 'Rencontre légendaire'], [5, 'Panthéon personnel'], [25, 'Mythologie vivante']], (g) => `Découvre ${g} espèce${g > 1 ? 's' : ''} Légendaire${g > 1 ? 's' : ''}`),
    ...series('Raretés', 'sparkles', 'rarity:secret', [[1, 'Le Secret'], [3, 'Initié'], [10, 'Gardien des Secrets']], (g) => `Découvre ${g} carte${g > 1 ? 's' : ''} Secrète${g > 1 ? 's' : ''}`),
    ...Object.entries(TYPE_NAMES).flatMap(([type, name]) => series('Types', `type:${type}`, `type:${type}`,
        [[5, `Curieux des ${name}`], [25, `Spécialiste des ${name}`], [100, `Maître des ${name}`]],
        (g) => `Découvre ${g} espèces de type ${name}`)),
    ...series('Défis', 'trophy', 'challenges', [[1, 'Premier défi'], [10, 'Régulier'], [50, 'Infatigable'], [150, 'Champion des défis'], [365, 'Une année de nature']],
        (g) => `Termine ${g} défi${g > 1 ? 's' : ''} du jour`),
    ...series('Enchères', 'gavel', 'sold', [[1, 'Première vente'], [10, 'Marchand'], [50, 'Négociant']], (g) => `Vends ${g} carte${g > 1 ? 's' : ''} aux enchères`),
    ...series('Enchères', 'cart', 'bought', [[1, 'Premier achat'], [10, 'Acheteur avisé'], [50, 'Grand collectionneur']], (g) => `Remporte ${g} enchère${g > 1 ? 's' : ''}`),
    ...series('Enchères', 'recycle', 'recycled', [[10, 'Tri sélectif'], [100, 'Recycleur'], [1000, 'Compost géant']], (g) => `Recycle ${n(g)} doublons`),
];

async function trophyList(db, userId) {
    const [{ rows: [m] }, { rows: groups }, { rows: claims }] = await Promise.all([
        db.query(`SELECT
                    (SELECT COUNT(*)::int FROM user_cards WHERE user_id = $1) AS discovered,
                    (SELECT COALESCE(SUM(count), 0)::int FROM user_cards WHERE user_id = $1) AS owned,
                    (SELECT COALESCE(MAX(count), 0)::int FROM user_cards WHERE user_id = $1) AS "maxCount",
                    (SELECT COUNT(*)::int FROM openings WHERE user_id = $1) AS opened,
                    (SELECT COUNT(*)::int FROM challenge_claims WHERE user_id = $1) AS challenges,
                    (SELECT COUNT(*)::int FROM auctions WHERE seller_id = $1 AND status = 'sold') AS sold,
                    (SELECT COUNT(*)::int FROM auctions WHERE bidder_id = $1 AND status = 'sold') AS bought,
                    recycled FROM users WHERE id = $1`, [userId]),
        db.query(`SELECT c.type, c.rarity, COUNT(*)::int AS n FROM user_cards uc JOIN cards c ON c.id = uc.card_id
                  WHERE uc.user_id = $1 GROUP BY 1, 2`, [userId]),
        db.query(`SELECT key FROM trophy_claims WHERE user_id = $1`, [userId]),
    ]);
    const perType = {};
    for (const { type, rarity, n } of groups) {
        perType[type] = (perType[type] || 0) + n;
        m[`rarity:${rarity}`] = (m[`rarity:${rarity}`] || 0) + n;
    }
    for (const [type, count] of Object.entries(perType)) m[`type:${type}`] = count;
    m.types = Object.keys(perType).length;
    m.types10 = Object.values(perType).filter((count) => count >= 10).length;
    const claimed = new Set(claims.map((r) => r.key));
    return TROPHIES.map(({ metric, ...t }) => ({ ...t, progress: Math.min(m[metric] || 0, t.goal), claimed: claimed.has(t.key) }));
}

// ---------- auction house ----------

const AUCTION_HOURS = [1, 6, 12, 24, 48];
const AUCTION_FEE = 0.05; // taken from the seller's earnings
const MAX_LISTINGS = 10;
const MAX_PRICE = 1_000_000;

const minBid = (a) => (a.bid == null ? a.start_price : a.bid + Math.max(1, Math.ceil(a.bid * 0.05)));

async function giveCard(client, userId, cardId) {
    await client.query(
        `INSERT INTO user_cards (user_id, card_id) VALUES ($1, $2)
         ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_cards.count + 1`,
        [userId, cardId]
    );
}

// Sold: card to the high bidder, bid minus the fee to the seller. Unsold: card back to the seller.
async function closeAuction(client, a) {
    if (a.bidder_id) {
        await giveCard(client, a.bidder_id, a.card_id);
        await client.query(`UPDATE users SET nuggets = nuggets + $2 WHERE id = $1`, [a.seller_id, a.bid - Math.floor(a.bid * AUCTION_FEE)]);
    } else {
        await giveCard(client, a.seller_id, a.card_id);
    }
    await client.query(`UPDATE auctions SET status = $2, settled_at = now() WHERE id = $1`, [a.id, a.bidder_id ? 'sold' : 'expired']);
}

// Ended auctions are settled every minute by the schedule, and also by whichever request
// comes first after they end. Each batch is one transaction: card, nuggets and status move together.
async function settleAuctions(db) {
    for (;;) {
        const { rows: due } = await db.query(`SELECT 1 FROM auctions WHERE status = 'open' AND ends_at <= now() LIMIT 1`);
        if (!due.length) return;
        const settled = await inTransaction(db, async (client) => {
            const { rows } = await client.query(
                `SELECT * FROM auctions WHERE status = 'open' AND ends_at <= now() ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`
            );
            for (const a of rows) await closeAuction(client, a);
            return rows.length;
        });
        if (settled < 50) return; // the rest (if any) is locked by a concurrent request settling it
    }
}

async function inTransaction(db, fn) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

const AUCTION_FIELDS = `a.id, a.start_price, a.buyout, a.bid, a.bids, a.status, a.ends_at, a.created_at,
    a.settled_at, a.seller_id = $1 AS mine, a.bidder_id = $1 AS leading, s.username AS seller,
    (SELECT username FROM users WHERE id = a.bidder_id) AS leader,
    (SELECT MAX(amount) FROM auction_bids b WHERE b.auction_id = a.id AND b.user_id = $1) AS my_bid,
    COALESCE(uc.count, 0) AS have,
    json_build_object('id', c.id, 'num', c.num, 'name', c.name, 'sci_name', c.sci_name, 'type', c.type, 'rarity', c.rarity,
                      'views', c.views, 'thumb_url', c.thumb_url, 'hp', (c.stats->>'hp')::int) AS card`;
const AUCTION_SORTS = {
    ending: 'a.ends_at',
    new: 'a.created_at DESC',
    cheap: 'COALESCE(a.bid, a.start_price)',
    rarity: `${RARITY_ORDER} DESC, a.ends_at`,
};
const shapeAuction = ({ bid, start_price, ...a }) => ({ ...a, bid, start_price, minBid: minBid({ bid, start_price }) });

const CARD_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.image_url, c.thumb_url,
                     c.extract, c.wiki_url, c.iucn, c.stats`;

const LIGHT_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.thumb_url, (c.stats->>'hp')::int AS hp`;
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

    // Pays with a free charge first, then a bonus booster (trophies), then graines if `pay`.
    async openBooster(db, body, event) {
        const user = await requireUser(db, event);
        const pools = await getRarityPools(db);
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const { rows: [current] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const now = Date.now();
            const charge = chargeState(current, now);
            let update, params, paidWith;
            if (charge.charges > 0) {
                // A full gauge starts its 30-minute timer at this opening; otherwise keep the timer running.
                const since = charge.charges >= MAX_CHARGES ? now : charge.from + charge.ticks * CHARGE_MS;
                [update, params, paidWith] = [`charges = $2, charges_at = $3`, [charge.charges - 1, new Date(since)], 'charge'];
            } else if (current.boosters > 0) {
                [update, params, paidWith] = [`boosters = boosters - 1`, [], 'booster'];
            } else if (body.pay && current.coins >= BOOSTER_PRICE) {
                [update, params, paidWith] = [`coins = coins - $2`, [BOOSTER_PRICE], 'coins'];
            } else {
                throw new HttpError(402, body.pay ? 'Pas assez de graines' : 'Plus de charge : attends la prochaine ou paie en graines');
            }
            const { rows: [locked] } = await client.query(`UPDATE users SET ${update} WHERE id = $1 RETURNING *`, [user.id, ...params]);

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
            return { cards: pack, paidWith, user: await publicUser(db, locked) };
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

    async trophies(db, body, event) {
        const user = await requireUser(db, event);
        return { trophies: await trophyList(db, user.id) };
    },

    async claimTrophy(db, body, event) {
        const user = await requireUser(db, event);
        const trophy = (await trophyList(db, user.id)).find((t) => t.key === body.key);
        if (!trophy) throw new HttpError(404, 'Trophée inconnu');
        if (trophy.progress < trophy.goal) throw new HttpError(400, 'Trophée pas encore obtenu');
        const { rowCount } = await db.query(
            `INSERT INTO trophy_claims (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, trophy.key]
        );
        if (!rowCount) throw new HttpError(409, 'Récompense déjà récupérée');
        const { rows: [updated] } = await db.query(
            `UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1 RETURNING *`,
            [user.id, trophy.coins, trophy.nuggets]
        );
        return { user: await publicUser(db, updated), trophies: await trophyList(db, user.id) };
    },

    async claimAllTrophies(db, body, event) {
        const user = await requireUser(db, event);
        const ready = (await trophyList(db, user.id)).filter((t) => !t.claimed && t.progress >= t.goal);
        const { rows: inserted } = await db.query(
            `INSERT INTO trophy_claims (user_id, key) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING RETURNING key`,
            [user.id, ready.map((t) => t.key)]
        );
        const won = ready.filter((t) => inserted.some((r) => r.key === t.key));
        const coins = won.reduce((sum, t) => sum + t.coins, 0);
        const nuggets = won.reduce((sum, t) => sum + t.nuggets, 0);
        const { rows: [updated] } = await db.query(
            `UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1 RETURNING *`, [user.id, coins, nuggets]
        );
        return { claimed: won.length, coins, nuggets, user: await publicUser(db, updated), trophies: await trophyList(db, user.id) };
    },

    // view: market (every open auction) | selling (mine) | bidding (auctions I bid on)
    async auctions(db, body, event) {
        const user = await requireUser(db, event);
        const view = ['selling', 'bidding'].includes(body.view) ? body.view : 'market';
        const q = String(body.query || '').trim();
        const where = {
            market: `a.status = 'open'`,
            selling: `a.seller_id = $1`,
            bidding: `EXISTS (SELECT 1 FROM auction_bids b WHERE b.auction_id = a.id AND b.user_id = $1)`,
        }[view];
        const order = view === 'market' ? AUCTION_SORTS[body.sort] || AUCTION_SORTS.ending : `a.status <> 'open', a.ends_at DESC`;
        const { rows } = await db.query(
            `SELECT ${AUCTION_FIELDS}, COUNT(*) OVER()::int AS matches
             FROM auctions a JOIN cards c ON c.id = a.card_id JOIN users s ON s.id = a.seller_id
             LEFT JOIN user_cards uc ON uc.card_id = a.card_id AND uc.user_id = $1
             WHERE ${where} AND ($2::text IS NULL OR c.type = $2) AND ($3::text IS NULL OR c.rarity = $3)
               AND ($4 = '' OR c.name ILIKE '%' || $4 || '%' OR c.sci_name ILIKE '%' || $4 || '%')
             ORDER BY ${order} LIMIT 60 OFFSET $5`,
            [user.id, body.type || null, body.rarity || null, q, Math.max(Number(body.offset) || 0, 0)]
        );
        return {
            matches: rows[0]?.matches || 0,
            auctions: rows.map(({ matches, ...a }) => shapeAuction(a)),
            hours: AUCTION_HOURS, fee: AUCTION_FEE, maxListings: MAX_LISTINGS,
        };
    },

    // One auction with its bid history, polled by the live view.
    async auction(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [a] } = await db.query(
            `SELECT ${AUCTION_FIELDS}
             FROM auctions a JOIN cards c ON c.id = a.card_id JOIN users s ON s.id = a.seller_id
             LEFT JOIN user_cards uc ON uc.card_id = a.card_id AND uc.user_id = $1
             WHERE a.id = $2`,
            [user.id, Number(body.id)]
        );
        if (!a) throw new HttpError(404, 'Enchère introuvable');
        const { rows: bids } = await db.query(
            `SELECT b.amount, b.at, u.username AS user, b.user_id = $2 AS me
             FROM auction_bids b JOIN users u ON u.id = b.user_id
             WHERE b.auction_id = $1 ORDER BY b.amount DESC, b.at DESC LIMIT 50`,
            [a.id, user.id]
        );
        const bidders = new Set(bids.map((b) => b.user)).size;
        return { auction: shapeAuction(a), bids, bidders, serverNow: new Date().toISOString() };
    },

    // Every owned card can be put up for auction, even the last copy.
    async sellable(db, body, event) {
        const user = await requireUser(db, event);
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count FROM user_cards uc JOIN cards c ON c.id = uc.card_id
             WHERE uc.user_id = $1 ORDER BY c.id = $2 DESC, ${RARITY_ORDER} DESC, c.views DESC LIMIT 400`,
            [user.id, Number(body.cardId) || 0]
        );
        return { cards: rows, hours: AUCTION_HOURS, fee: AUCTION_FEE, recycleValue: RECYCLE_VALUE };
    },

    async createAuction(db, body, event) {
        const user = await requireUser(db, event);
        const start = Number(body.startPrice);
        const buyout = body.buyout ? Number(body.buyout) : null;
        const hours = Number(body.hours);
        if (!Number.isInteger(start) || start < 1 || start > MAX_PRICE) throw new HttpError(400, 'Mise de départ invalide');
        if (buyout != null && (!Number.isInteger(buyout) || buyout <= start || buyout > MAX_PRICE)) {
            throw new HttpError(400, 'Le prix d\'achat immédiat doit dépasser la mise de départ');
        }
        if (!AUCTION_HOURS.includes(hours)) throw new HttpError(400, 'Durée invalide');
        return inTransaction(db, async (client) => {
            await client.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const { rows: [{ open }] } = await client.query(
                `SELECT COUNT(*)::int AS open FROM auctions WHERE seller_id = $1 AND status = 'open'`, [user.id]
            );
            if (open >= MAX_LISTINGS) throw new HttpError(429, `${MAX_LISTINGS} ventes en cours au maximum`);
            const { rows: [left] } = await client.query(
                `UPDATE user_cards SET count = count - 1 WHERE user_id = $1 AND card_id = $2 AND count >= 1 RETURNING count`,
                [user.id, Number(body.cardId)]
            );
            if (!left) throw new HttpError(400, 'Tu ne possèdes pas cette carte');
            // Selling the last copy removes it from the collection (it comes back if unsold).
            if (left.count === 0) await client.query(`DELETE FROM user_cards WHERE user_id = $1 AND card_id = $2`, [user.id, Number(body.cardId)]);
            const { rows: [auction] } = await client.query(
                `INSERT INTO auctions (seller_id, card_id, start_price, buyout, ends_at)
                 VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING id`,
                [user.id, Number(body.cardId), start, buyout, hours]
            );
            return { id: auction.id };
        });
    },

    // Bidding debits the bid right away and refunds whoever is outbid. Reaching the buy-now
    // price (or calling with `buyNow`) closes the auction at once.
    async bid(db, body, event) {
        const user = await requireUser(db, event);
        const sold = await inTransaction(db, async (client) => {
            const { rows: [a] } = await client.query(`SELECT * FROM auctions WHERE id = $1 FOR UPDATE`, [Number(body.id)]);
            if (!a) throw new HttpError(404, 'Enchère introuvable');
            if (a.status !== 'open' || new Date(a.ends_at) <= new Date()) throw new HttpError(409, 'Cette enchère est terminée');
            if (a.seller_id === user.id) throw new HttpError(400, 'Tu ne peux pas enchérir sur ta propre vente');
            let amount = body.buyNow ? a.buyout : Number(body.amount);
            if (!Number.isInteger(amount)) throw new HttpError(400, body.buyNow ? 'Pas d\'achat immédiat sur cette vente' : 'Montant invalide');
            const buyNow = a.buyout != null && amount >= a.buyout;
            if (buyNow) amount = a.buyout;
            else if (amount < minBid(a)) throw new HttpError(400, `Offre minimum : ${minBid(a)} pépites`);
            if (amount > MAX_PRICE) throw new HttpError(400, 'Montant trop élevé');

            const own = a.bidder_id === user.id ? a.bid : 0; // raising my own bid only costs the difference
            const { rows: [me] } = await client.query(
                `UPDATE users SET nuggets = nuggets - $2 WHERE id = $1 AND nuggets >= $2 RETURNING id`, [user.id, amount - own]
            );
            if (!me) throw new HttpError(402, 'Pas assez de pépites');
            if (a.bidder_id && a.bidder_id !== user.id) {
                await client.query(`UPDATE users SET nuggets = nuggets + $2 WHERE id = $1`, [a.bidder_id, a.bid]);
            }
            await client.query(`INSERT INTO auction_bids (auction_id, user_id, amount) VALUES ($1, $2, $3)`, [a.id, user.id, amount]);
            // A late bid pushes the end back to 2 minutes so nobody wins by sniping.
            const { rows: [updated] } = await client.query(
                `UPDATE auctions SET bid = $2, bidder_id = $3, bids = bids + 1,
                        ends_at = GREATEST(ends_at, now() + interval '2 minutes')
                 WHERE id = $1 RETURNING *`,
                [a.id, amount, user.id]
            );
            if (buyNow) await closeAuction(client, updated);
            return buyNow;
        });
        const { rows: [fresh] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return { sold, user: await publicUser(db, fresh) };
    },

    async cancelAuction(db, body, event) {
        const user = await requireUser(db, event);
        await inTransaction(db, async (client) => {
            const { rows: [a] } = await client.query(
                `SELECT * FROM auctions WHERE id = $1 AND seller_id = $2 FOR UPDATE`, [Number(body.id), user.id]
            );
            if (!a || a.status !== 'open') throw new HttpError(404, 'Vente introuvable ou terminée');
            if (a.bidder_id) throw new HttpError(409, 'Impossible d\'annuler : il y a déjà une offre');
            await giveCard(client, user.id, a.card_id);
            await client.query(`UPDATE auctions SET status = 'cancelled', settled_at = now() WHERE id = $1`, [a.id]);
        });
        return { ok: true };
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
            const nuggets = rows.reduce((sum, r) => sum + r.extra * RECYCLE_VALUE[r.rarity], 0);
            const { rows: [updated] } = await client.query(
                `UPDATE users SET nuggets = nuggets + $2, recycled = recycled + $3 WHERE id = $1 RETURNING *`,
                [user.id, nuggets, recycled]
            );
            await client.query('COMMIT');
            return { recycled, nuggets, user: await publicUser(db, updated) };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    },
};

const PUBLIC_ACTIONS = new Set(['catalog', 'register', 'login', 'logout']);

export const handler = async (event) => {
    if (event.source === 'schedule') {
        await settleAuctions(getPool());
        return { ok: true };
    }
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const fn = actions[body.action];
        if (!fn) return json({ error: 'Unknown action', available: Object.keys(actions) }, 400);
        if (!PUBLIC_ACTIONS.has(body.action)) await settleAuctions(getPool());
        return json(await fn(getPool(), body, event));
    } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status);
        console.error(error);
        return json({ error: 'Erreur serveur' }, 500);
    }
};
