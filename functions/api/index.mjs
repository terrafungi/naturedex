/**
 * NatureDex API
 *
 * Endpoint: https://yourdomain.com/api — POST { action, ...params }
 * Auth: `Authorization: Bearer <token>` (from register / login)
 *
 * Environment variables:
 * - DATABASE_URL (Postgres connection string)
 * - STRIPE_SECRET_KEY (shop; without it the shop shows payments as unavailable)
 * - STRIPE_WEBHOOK_SECRET (optional; Stripe webhook → POST <function url>/stripe-webhook)
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import {
    CARD_SCORE, IUCN_LABELS, KIND_LABELS, LEVEL_COINS, PERFECT_COINS, PERFECT_NUGGETS, QUIZ_PER_DAY, THEMES,
    buildQuiz, intro, isLate, publicQuestion,
} from './quiz.mjs';
import {
    ASSOCIATIONS, DONATION_SHARE, PACKS, createCheckout, donationOf, getCheckout, stripeReady, stripeTestMode, verifyWebhook,
} from './shop.mjs';
import { DAILY_BATTLES, DAILY_REWARDS, SEASON_MIN_RATING, arenaActions, seasonLabel, seasonRollover } from './arena.mjs';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RARITY_STYLE, renderShareImage } from './share-image.mjs';

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
const CHARGE_MS = 60 * 60 * 1000; // a full refill takes 10 h: one in the evening, one in the morning
const DAILY_COOLDOWN_MS = 20 * 3600 * 1000;
const SESSION_DAYS = 60;
// Invitations and sharing. The sponsor is paid only once the invitee has really played
// (INVITE_DAYS different days), and at most INVITE_CAP times, so fake accounts don't pay.
const INVITE_REWARD = { coins: 1000, nuggets: 150 };
const INVITEE_BONUS = { coins: 300, nuggets: 50 };
const INVITE_DAYS = 2;
const INVITE_CAP = 30;
const SHARE_COINS = 100; // once per account, for sharing the game link
// pépites per recycled duplicate
const RECYCLE_VALUE = { common: 2, uncommon: 4, rare: 10, epic: 25, legendary: 60, secret: 400 };

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

// Free openings: `charges` as of `charges_at`, plus one every hour up to the cap.
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
        social: await socialCounts(db, user.id),
        quizPerDay: QUIZ_PER_DAY,
        ...rows[0],
    };
}

// Friend requests and trade offers waiting for this player (badge in the navigation).
async function socialCounts(db, userId) {
    const { rows: [c] } = await db.query(
        `SELECT (SELECT COUNT(*)::int FROM friendships WHERE addressee_id = $1 AND status = 'pending') AS "friendRequests",
                (SELECT COUNT(*)::int FROM trades WHERE to_id = $1 AND status = 'pending') AS "tradeOffers",
                (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND day = (now() AT TIME ZONE 'Europe/Paris')::date) AS "quizPlayed",
                (SELECT COUNT(*)::int FROM messages WHERE to_id = $1 AND read_at IS NULL) AS "unreadMessages"`,
        [userId]
    );
    return c;
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
    { key: 'forest', icon: 'leaf', title: 'Gardiens de la Forêt', text: 'Obtiens 3 cartes Forêt : plante, arbre ou champignon', goal: 3, reward: 60, types: ['plant', 'tree', 'fungus', 'mold'] },
    { key: 'water', icon: 'drop', title: 'Sources de Vie', text: 'Obtiens 2 cartes Eau : poisson, créature marine ou algue', goal: 2, reward: 60, types: ['fish', 'marine', 'alga'] },
    { key: 'sky', icon: 'bird', title: 'Maîtres du Ciel', text: 'Obtiens 2 cartes Oiseau', goal: 2, reward: 50, types: ['bird'] },
    { key: 'scales', icon: 'sun', title: 'Sang-froid', text: 'Obtiens 2 cartes Reptile ou amphibien', goal: 2, reward: 50, types: ['reptile'] },
    { key: 'bugs', icon: 'bug', title: 'Petites Bêtes', text: 'Obtiens 2 cartes Insecte ou arachnide', goal: 2, reward: 50, types: ['arthropod'] },
    { key: 'wild', icon: 'paw', title: 'Instinct Sauvage', text: 'Obtiens 1 carte Mammifère', goal: 1, reward: 50, types: ['mammal'] },
    { key: 'ages', icon: 'bone', title: 'Mémoire des Âges', text: 'Obtiens 1 carte Fossile', goal: 1, reward: 50, types: ['fossil'] },
    { key: 'explorer', icon: 'compass', title: 'Explorateur', text: 'Ouvre 2 boosters', goal: 2, reward: 40, kind: 'open' },
    { key: 'expert', icon: 'gem', title: 'Œil d\'Expert', text: 'Obtiens une carte Rare ou mieux', goal: 1, reward: 40, kind: 'rare' },
    { key: 'naturalist', icon: 'sparkles', title: 'Naturaliste', text: 'Découvre 5 nouvelles espèces', goal: 5, reward: 60, kind: 'new' },
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
const TIER_COINS = [30, 60, 120, 200, 300, 500, 800, 1200, 2000];
const TIER_NUGGETS = [10, 25, 50, 80, 120, 200, 300, 500, 800];

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
    ...series('Amis', 'users', 'friends', [[1, 'Premier ami'], [5, 'Petite bande'], [20, 'Club des naturalistes']], (g) => `Aie ${g} ami${g > 1 ? 's' : ''}`),
    ...series('Amis', 'swap', 'trades', [[1, 'Premier échange'], [10, 'Troqueur'], [50, 'Roi du troc']], (g) => `Réussis ${g} échange${g > 1 ? 's' : ''} de cartes`),
    ...series('Quiz', 'brain', 'quizzes', [[1, 'Premier quiz'], [10, 'Curieux de nature'], [50, 'Érudit'], [200, 'Puits de science'], [500, 'Encyclopédie vivante']],
        (g) => `Termine ${n(g)} quiz`),
    ...series('Quiz', 'lightbulb', 'quizCorrect', [[25, 'Bonne pioche'], [100, 'Esprit vif'], [500, 'Savant'], [2000, 'Professeur'], [5000, 'Sage de la forêt']],
        (g) => `Donne ${n(g)} bonnes réponses au quiz`),
    ...series('Quiz', 'target', 'quizPerfect', [[1, 'Sans faute'], [10, 'Infaillible'], [50, 'Oracle']], (g) => `Réussis ${g} quiz parfait${g > 1 ? 's' : ''} (10/10)`),
    ...series('Quiz', 'flame', 'quizDays', [[7, 'Une semaine de savoir'], [30, 'Un mois d\'apprentissage'], [100, 'Cent jours'], [365, 'Une année de quiz']],
        (g) => `Joue au quiz ${g} jours différents`),
    ...series('Boutique', 'heart', 'patron', [[1, 'Mécène de la nature'], [5, 'Ami des associations']],
        (g) => g > 1 ? `Soutiens ${g} fois une association nature via la boutique` : 'Soutiens une association nature via la boutique'),
    ...series('Combat', 'swords', 'battleWins', [[1, 'Premier combat'], [10, 'Combattant'], [50, 'Gladiateur'], [200, 'Champion de l\'arène'], [500, 'Légende de l\'arène']],
        (g) => `Gagne ${n(g)} combat${g > 1 ? 's' : ''}`),
    ...series('Combat', 'map', 'campaign', [[5, 'Explorateur'], [10, 'Aventurier'], [15, 'Maître de la campagne']], (g) => `Termine l'étape ${g} de la campagne`),
    ...series('Combat', 'medal', 'seasonTop10', [[1, 'Élite de la saison'], [3, 'Habitué du top 10'], [10, 'Pilier de l\'arène']],
        (g) => g > 1 ? `Termine ${g} saisons d'arène dans le top 10` : 'Termine une saison d\'arène dans le top 10'),
    ...series('Combat', 'podium', 'seasonPodium', [[1, 'Sur le podium'], [3, 'Abonné au podium'], [10, 'Médaillé perpétuel']],
        (g) => g > 1 ? `Termine ${g} saisons d'arène sur le podium` : 'Termine une saison d\'arène sur le podium (top 3)'),
    ...series('Combat', 'champion', 'seasonChampion', [[1, 'Champion de saison'], [3, 'Triple champion'], [6, 'Dynastie']],
        (g) => g > 1 ? `Termine ${g} saisons d'arène à la 1re place` : 'Termine une saison d\'arène à la 1re place'),
    ...series('Enchères', 'recycle', 'recycled', [[10, 'Tri sélectif'], [100, 'Recycleur'], [1000, 'Compost géant']], (g) => `Recycle ${n(g)} doublons`),
];

// Leaderboards: one (user_id, score, extra) query per board; `extra` breaks ties.
const RARITY_POINTS = `CASE c.rarity WHEN 'secret' THEN 100 WHEN 'legendary' THEN 25 WHEN 'epic' THEN 8 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 1 ELSE 0 END`;
const BOARDS = {
    quiz: (week) => `SELECT user_id, SUM(score)::int AS score,
                            COUNT(*) FILTER (WHERE score = jsonb_array_length(questions))::int AS extra
                     FROM quizzes WHERE status = 'done' ${week ? `AND day >= current_date - 6` : ''} GROUP BY 1`,
    species: () => `SELECT user_id, COUNT(*)::int AS score, SUM(count)::int AS extra FROM user_cards GROUP BY 1`,
    cards: () => `SELECT user_id, SUM(count)::int AS score, COUNT(*)::int AS extra FROM user_cards GROUP BY 1`,
    prestige: () => `SELECT uc.user_id, SUM(${RARITY_POINTS})::int AS score,
                            COUNT(*) FILTER (WHERE c.rarity IN ('legendary', 'secret'))::int AS extra
                     FROM user_cards uc JOIN cards c ON c.id = uc.card_id GROUP BY 1`,
    trophies: () => `SELECT user_id, COUNT(*)::int AS score, 0 AS extra FROM trophy_claims GROUP BY 1`,
    arena: () => `SELECT user_id, rating AS score, wins AS extra FROM arena WHERE wins + losses > 0`,
};

// Best final arena rank of a player (top 10, rated seasons only), shown as a badge next to the name.
// `times` counts the seasons finished in the same tier: champion (1st), podium (2-3), top 10.
const SEASON_BADGE = (userCol) => `(SELECT jsonb_build_object('rank', b.rank, 'season', b.season, 'times', b.times) FROM (
        SELECT rank, season, COUNT(*) OVER (PARTITION BY CASE WHEN rank = 1 THEN 1 WHEN rank <= 3 THEN 2 ELSE 3 END)::int AS times
        FROM season_results WHERE user_id = ${userCol} AND rank <= 10 AND rating >= ${SEASON_MIN_RATING}) b
    ORDER BY b.rank, b.season DESC LIMIT 1) AS badge`;
const withBadge = (row) => {
    if (row.badge) row.badge.label = seasonLabel(row.badge.season);
    return row;
};

async function findSponsor(db, code) {
    const { rows } = await db.query(`SELECT id, username FROM users WHERE invite_code = $1`, [String(code).trim().toLowerCase()]);
    return rows[0] || null;
}

// The player's invite code, created the first time it is needed.
async function inviteCode(db, user) {
    if (user.invite_code) return user.invite_code;
    for (;;) {
        const code = crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 7);
        if (code.length < 6) continue;
        const { rows } = await db.query(
            `UPDATE users SET invite_code = $2 WHERE id = $1 AND invite_code IS NULL
             AND NOT EXISTS (SELECT 1 FROM users WHERE invite_code = $2) RETURNING invite_code`, [user.id, code]);
        if (rows[0]) return rows[0].invite_code;
        const { rows: [again] } = await db.query(`SELECT invite_code FROM users WHERE id = $1`, [user.id]);
        if (again.invite_code) return again.invite_code;
    }
}

const PARIS_DAY = `(now() AT TIME ZONE 'Europe/Paris')::date`;

// Facebook share page (GET /api/partage/:cardId?v=2&u=username): Open Graph tags for the preview,
// then a JS redirect to the site carrying the sharer's invite code. No <meta refresh>: Facebook's
// crawler follows it and would read the site's generic tags instead. `v` busts Facebook's scrape
// cache of links shared before that fix.
const SITE = 'https://naturedex.fr';
const SHARE_RARITIES = { rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', secret: 'Secrète' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Custom 1200×630 preview, rendered once per card and cached in storage (served by CloudFront under /media).
const SHARE_IMAGE_KEY = (id) => `media/share/v1/${id}.png`;
let s3;
async function shareImage(card) {
    if (!RARITY_STYLE[card.rarity] || !process.env.STORAGE_BUCKET) return null;
    const Bucket = process.env.STORAGE_BUCKET, Key = SHARE_IMAGE_KEY(card.id);
    s3 ??= new S3Client({});
    try {
        await s3.send(new HeadObjectCommand({ Bucket, Key }));
    } catch (e) {
        if (e?.$metadata?.httpStatusCode !== 404 && e?.name !== 'NotFound') throw e;
        const Body = await renderShareImage(card);
        await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: 'image/png', CacheControl: 'public, max-age=31536000, immutable' }));
    }
    return `${SITE}/${Key}`;
}

async function sharePage(db, cardId, username) {
    const { rows: [card] } = await db.query(
        `SELECT id, name, sci_name, type, rarity, image_url, thumb_url, extract FROM cards WHERE id = $1`, [cardId]);
    const { rows: [sharer] } = username
        ? await db.query(`SELECT id, username, invite_code FROM users WHERE lower(username) = lower($1)`, [username])
        : { rows: [] };
    const code = sharer && await inviteCode(db, sharer);
    const target = card ? `${SITE}/carte/${card.id}${code ? `?parrain=${code}` : ''}` : `${SITE}/${code ? `?parrain=${code}` : ''}`;
    const rarity = card && (SHARE_RARITIES[card.rarity] || 'nouvelle');
    const title = card
        ? `${sharer ? `${sharer.username} a découvert` : 'Découverte :'} ${card.name}, carte ${rarity}${card.rarity === 'secret' ? ' ✦' : ' !'}`
        : 'NatureDex : collectionne le vivant';
    const extract = card?.extract ? (card.extract.length > 180 ? `${card.extract.slice(0, 177).trimEnd()}…` : card.extract) : '';
    const description = `${extract} Collectionne ${card ? 'toi aussi ' : ''}60 000 espèces du vivant sur NatureDex.`.trim();
    const custom = card && await shareImage(card).catch((e) => (console.error('share image', card.id, e), null));
    const image = custom || card?.image_url || `${SITE}/og.png`;
    const self = `${SITE}/api/partage/${card?.id ?? cardId}?v=2${sharer ? `&u=${encodeURIComponent(sharer.username)}` : ''}`;
    const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NatureDex">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${esc(self)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">${custom ? `
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">` : ''}
<meta property="og:image:alt" content="${esc(card?.name || 'NatureDex')}">
<meta name="twitter:card" content="summary_large_image">
</head><body style="background:#04100a;color:#e7ece8;font-family:sans-serif;text-align:center;padding:3em">
<p><a style="color:#a8f0c6" href="${esc(target)}">Ouvrir NatureDex</a></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</body></html>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }, body };
}

async function inviteState(db, user) {
    const code = await inviteCode(db, user);
    const { rows: invitees } = await db.query(
        `SELECT u.username, u.created_at, u.invite_rewarded_at IS NOT NULL AS rewarded,
                (SELECT COUNT(DISTINCT d)::int FROM (
                    SELECT (at AT TIME ZONE 'Europe/Paris')::date AS d FROM openings WHERE user_id = u.id
                    UNION SELECT day FROM quizzes WHERE user_id = u.id AND status = 'done') x) AS days
         FROM users u WHERE u.invited_by = $1 ORDER BY u.created_at DESC LIMIT 200`, [user.id]);
    const { rows: [me] } = await db.query(`SELECT last_share IS NOT NULL AS shared FROM users WHERE id = $1`, [user.id]);
    const rewarded = invitees.filter((i) => i.rewarded).length;
    return {
        code,
        reward: INVITE_REWARD, inviteeBonus: INVITEE_BONUS, days: INVITE_DAYS, cap: INVITE_CAP, shareCoins: SHARE_COINS,
        rewarded,
        shared: me.shared,
        invitees: invitees.map((i) => ({ ...i, ready: !i.rewarded && i.days >= INVITE_DAYS && rewarded < INVITE_CAP })),
    };
}

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
                    (SELECT COUNT(*)::int FROM friendships WHERE status = 'accepted' AND $1 IN (requester_id, addressee_id)) AS friends,
                    (SELECT COUNT(*)::int FROM trades WHERE status = 'accepted' AND $1 IN (from_id, to_id)) AS trades,
                    (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND status = 'done') AS quizzes,
                    (SELECT COALESCE(SUM(score), 0)::int FROM quizzes WHERE user_id = $1 AND status = 'done') AS "quizCorrect",
                    (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND status = 'done' AND score = jsonb_array_length(questions)) AS "quizPerfect",
                    (SELECT COUNT(DISTINCT day)::int FROM quizzes WHERE user_id = $1 AND status = 'done') AS "quizDays",
                    (SELECT COUNT(*)::int FROM purchases WHERE user_id = $1 AND status = 'paid') AS patron,
                    (SELECT COUNT(*)::int FROM battles WHERE user_id = $1 AND status = 'won') AS "battleWins",
                    (SELECT COALESCE(MAX(campaign), 0)::int FROM arena WHERE user_id = $1) AS campaign,
                    (SELECT COUNT(*) FILTER (WHERE rank <= 10)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonTop10",
                    (SELECT COUNT(*) FILTER (WHERE rank <= 3)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonPodium",
                    (SELECT COUNT(*) FILTER (WHERE rank = 1)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonChampion",
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

// What is waiting for the player, per page (red counters on the navigation icons).
async function badgeCounts(db, user, pub) {
    const [trophies, { challenges }, { rows: [inv] }, { rows: [fight] }] = await Promise.all([
        trophyList(db, user.id),
        dailyChallenges(db, user.id),
        db.query(`SELECT COUNT(*) FILTER (WHERE invite_rewarded_at IS NOT NULL)::int AS rewarded,
                         COUNT(*) FILTER (WHERE invite_rewarded_at IS NULL AND (SELECT COUNT(DISTINCT d) FROM (
                             SELECT (at AT TIME ZONE 'Europe/Paris')::date AS d FROM openings WHERE user_id = u.id
                             UNION SELECT day FROM quizzes WHERE user_id = u.id AND status = 'done') x) >= $2)::int AS ready
                  FROM users u WHERE invited_by = $1`, [user.id, INVITE_DAYS]),
        db.query(`SELECT EXISTS (SELECT 1 FROM battles WHERE user_id = $1 AND status = 'active') AS active,
                         (SELECT COUNT(*)::int FROM battles WHERE user_id = $1 AND (reward->>'daily')::boolean
                            AND (ended_at AT TIME ZONE 'Europe/Paris')::date = ${PARIS_DAY}) AS rewarded,
                         (SELECT COUNT(*)::int FROM battles WHERE user_id = $1 AND NOT paid
                            AND (created_at AT TIME ZONE 'Europe/Paris')::date = ${PARIS_DAY}) AS started,
                         (SELECT COUNT(*)::int FROM season_results WHERE user_id = $1 AND claimed_at IS NULL) AS seasons`, [user.id]),
    ]);
    const s = pub.social;
    return {
        '/booster': (pub.nextDailyAt ? 0 : 1) + (pub.charges >= pub.maxCharges ? 1 : 0),
        '/quiz': Math.max(0, QUIZ_PER_DAY - s.quizPlayed),
        '/defis': challenges.filter((c) => !c.claimed && c.progress >= c.goal).length,
        '/trophees': trophies.filter((t) => !t.claimed && t.progress >= t.goal).length,
        '/inviter': Math.min(inv.ready, Math.max(0, INVITE_CAP - inv.rewarded)),
        '/amis': s.friendRequests + s.tradeOffers,
        '/messages': s.unreadMessages,
        // rewarded wins are only worth showing while free battles remain to play them
        '/combat': fight.active ? 1 : fight.seasons + (fight.started < DAILY_BATTLES ? Math.min(DAILY_BATTLES - fight.started, Math.max(0, DAILY_REWARDS - fight.rewarded)) : 0),
    };
}

// ---------- private messages ----------

const MESSAGE_MAX = 1000;
const MESSAGES_PER_MINUTE = 20;
const THREAD_LIMIT = 100;

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

const LIGHT_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.thumb_url, (c.stats->>'hp')::int AS hp,
    (c.stats->>'atk')::int AS atk, (c.stats->>'def')::int AS def, (c.stats->>'spd')::int AS spd`;
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

// ---- Daily quiz ----

const parisDay = async (db) => (await db.query(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day`)).rows[0].day;

// Consecutive days with a finished quiz, ending today (or yesterday if today is not played yet).
function quizStreak(days, today) {
    const set = new Set(days);
    const d = new Date(`${today}T12:00:00Z`);
    if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
    let streak = 0;
    while (set.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
    return streak;
}

async function quizState(db, userId) {
    const day = await parisDay(db);
    const [{ rows: today }, { rows: active }, { rows: days }, { rows: kinds }, { rows: [totals] }] = await Promise.all([
        db.query(`SELECT id, theme, score, coins, nuggets, status, jsonb_array_length(questions) AS total, finished_at
                  FROM quizzes WHERE user_id = $1 AND day = $2 ORDER BY id`, [userId, day]),
        db.query(`SELECT id, theme, current, score, jsonb_array_length(questions) AS total FROM quizzes
                  WHERE user_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`, [userId]),
        db.query(`SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day FROM quizzes WHERE user_id = $1 AND status = 'done'
                  ORDER BY 1 DESC LIMIT 400`, [userId]),
        db.query(`SELECT q.questions -> (a.i::int - 1) ->> 'kind' AS kind, COUNT(*)::int AS answered,
                         COUNT(*) FILTER (WHERE (a.v ->> 'correct')::boolean)::int AS correct
                  FROM quizzes q CROSS JOIN jsonb_array_elements(q.answers) WITH ORDINALITY AS a(v, i)
                  WHERE q.user_id = $1 GROUP BY 1`, [userId]),
        db.query(`SELECT COUNT(*) FILTER (WHERE status = 'done')::int AS quizzes,
                         COALESCE(SUM(score) FILTER (WHERE status = 'done'), 0)::int AS correct,
                         COALESCE(SUM(jsonb_array_length(questions)) FILTER (WHERE status = 'done'), 0)::int AS questions,
                         COUNT(*) FILTER (WHERE status = 'done' AND score = jsonb_array_length(questions))::int AS perfect,
                         (SELECT COUNT(*)::int FROM quiz_seen WHERE user_id = $1) AS species
                  FROM quizzes WHERE user_id = $1`, [userId]),
    ]);
    return {
        day,
        perDay: QUIZ_PER_DAY,
        left: Math.max(0, QUIZ_PER_DAY - today.length),
        today,
        active: active[0] || null,
        streak: quizStreak(days.map((r) => r.day), day),
        stats: totals,
        kinds: Object.entries(KIND_LABELS).map(([kind, label]) => ({ kind, label, ...(kinds.find((k) => k.kind === kind) || { answered: 0, correct: 0 }) })),
        themes: Object.entries(THEMES).map(([key, t]) => ({ key, label: t.label })),
        rewards: { levelCoins: LEVEL_COINS, perfectCoins: PERFECT_COINS, perfectNuggets: PERFECT_NUGGETS, cardScore: CARD_SCORE },
    };
}

// The species behind a question, shown after the answer so the player learns something.
async function learnCard(db, cardId, userId) {
    const { rows: [c] } = await db.query(
        `SELECT c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.views, c.thumb_url, c.image_url, c.iucn, c.wiki_url, c.extract,
                c.stats, (c.stats->>'hp')::int AS hp, COALESCE(uc.count, 0) AS count
         FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $2 WHERE c.id = $1`,
        [cardId, userId]
    );
    if (!c) return null;
    if (!c.extract) c.extract = await fillExtract(db, c);
    const { extract, ...card } = c;
    return { ...card, fact: intro(extract, 340), iucnLabel: IUCN_LABELS[c.iucn] || null };
}

async function lockQuiz(client, userId, id) {
    const { rows: [q] } = await client.query(`SELECT * FROM quizzes WHERE id = $1 AND user_id = $2 FOR UPDATE`, [Number(id), userId]);
    if (!q) throw new HttpError(404, 'Quiz introuvable');
    return q;
}

const quizProgress = (q) => ({
    id: q.id, theme: q.theme, themeLabel: THEMES[q.theme]?.label, current: q.current, total: q.questions.length,
    score: q.score, coins: q.coins, nuggets: q.nuggets, results: q.answers.map((a) => a.correct),
});

// ---- Friends & trades ----
const MAX_TRADE_ITEMS = 10;
const MAX_PENDING_TRADES = 20;

async function findUser(db, username) {
    const { rows: [u] } = await db.query(`SELECT id, username FROM users WHERE lower(username) = lower($1)`, [String(username || '').trim()]);
    if (!u) throw new HttpError(404, 'Aucun joueur avec ce pseudo');
    return u;
}

async function relation(db, meId, otherId) {
    const { rows: [f] } = await db.query(
        `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
        [meId, otherId]
    );
    return f || null;
}

async function requireFriend(db, meId, username) {
    const other = await findUser(db, username);
    const f = await relation(db, meId, other.id);
    if (!f || f.status !== 'accepted') throw new HttpError(403, `${other.username} n'est pas (encore) ton ami`);
    return other;
}

// Moves qty copies of a card between players; fails if the owner no longer has them.
async function moveCard(client, fromId, toId, cardId, qty) {
    const { rows: [left] } = await client.query(
        `UPDATE user_cards SET count = count - $3 WHERE user_id = $1 AND card_id = $2 AND count >= $3 RETURNING count`,
        [fromId, cardId, qty]
    );
    if (!left) return false;
    if (left.count === 0) await client.query(`DELETE FROM user_cards WHERE user_id = $1 AND card_id = $2`, [fromId, cardId]);
    await client.query(
        `INSERT INTO user_cards (user_id, card_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_cards.count + $3`,
        [toId, cardId, qty]
    );
    return true;
}

const TRADE_CARD = `json_build_object('id', c.id, 'num', c.num, 'name', c.name, 'sci_name', c.sci_name, 'type', c.type, 'rarity', c.rarity,
                                      'views', c.views, 'thumb_url', c.thumb_url, 'hp', (c.stats->>'hp')::int)`;

async function loadTrades(db, userId, where) {
    const { rows } = await db.query(
        `SELECT t.id, t.status, t.message, t.created_at, t.resolved_at, t.from_id = $1 AS mine,
                f.username AS from_user, d.username AS to_user,
                COALESCE((SELECT json_agg(json_build_object('fromSide', i.owner_id = t.from_id, 'qty', i.qty,
                    'have', COALESCE((SELECT count FROM user_cards x WHERE x.user_id = i.owner_id AND x.card_id = i.card_id), 0),
                    'mineCount', COALESCE((SELECT count FROM user_cards x WHERE x.user_id = $1 AND x.card_id = i.card_id), 0),
                    'card', ${TRADE_CARD}))
                    FROM trade_items i JOIN cards c ON c.id = i.card_id WHERE i.trade_id = t.id), '[]') AS items
         FROM trades t JOIN users f ON f.id = t.from_id JOIN users d ON d.id = t.to_id
         WHERE ${where} ORDER BY t.created_at DESC LIMIT 50`,
        [userId]
    );
    // give / get are from the current player's point of view.
    return rows.map(({ items, from_user, to_user, ...t }) => ({
        ...t,
        other: t.mine ? to_user : from_user,
        give: items.filter((i) => i.fromSide === t.mine),
        get: items.filter((i) => i.fromSide !== t.mine),
    }));
}

// ---------- shop (real money, Stripe) ----------

const SITE_ORIGINS = ['https://diuqx6knr7is6.cloudfront.net', 'https://naturedex.fr', 'https://www.naturedex.fr', 'http://localhost:6100', 'http://localhost:5173'];

// Credit a purchase once Stripe says it is paid. Idempotent: the webhook and the
// return page may both call this, only the first one flips pending → paid.
async function grantPurchase(db, session) {
    const id = Number(session.metadata?.purchase_id || session.client_reference_id);
    if (!id || session.payment_status !== 'paid') return null;
    return inTransaction(db, async (client) => {
        const { rows: [p] } = await client.query(
            `UPDATE purchases SET status = 'paid', paid_at = now(), stripe_payment = $3, livemode = $4
             WHERE id = $1 AND stripe_session = $2 AND status <> 'paid' AND amount_cents = $5 AND currency = $6 RETURNING *`,
            [id, session.id, session.payment_intent, !!session.livemode, session.amount_total, session.currency]
        );
        if (!p) return null;
        if (p.user_id) await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1`, [p.user_id, p.coins, p.nuggets]);
        return p;
    });
}

// A purchase left pending (closed tab, missed webhook): ask Stripe again.
async function refreshPurchase(db, p) {
    const session = await getCheckout(p.stripe_session);
    if (session.payment_status === 'paid') return grantPurchase(db, session);
    if (session.status === 'expired') await db.query(`UPDATE purchases SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [p.id]);
    return null;
}

const shapePurchase = (p) => ({
    id: p.id, pack: p.pack, label: PACKS[p.pack]?.label || p.pack, amount: p.amount_cents, donation: p.donation_cents,
    association: p.association, coins: p.coins, nuggets: p.nuggets, status: p.status, createdAt: p.created_at, paidAt: p.paid_at,
});

async function stripeWebhook(event) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    const payload = verifyWebhook(raw, event.headers?.['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (!payload) return json({ error: 'Signature invalide' }, 400);
    const session = payload.data?.object;
    if (payload.type === 'checkout.session.completed' || payload.type === 'checkout.session.async_payment_succeeded') {
        await grantPurchase(getPool(), session);
    } else if (payload.type === 'checkout.session.expired') {
        await getPool().query(`UPDATE purchases SET status = 'expired' WHERE stripe_session = $1 AND status = 'pending'`, [session.id]);
    }
    return json({ received: true });
}

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
        const sponsor = body.invite ? await findSponsor(db, body.invite) : null;
        let { rows } = await db.query(
            `INSERT INTO users (username, pass_hash, invited_by) VALUES ($1, $2, $3) RETURNING *`,
            [username, await hashPassword(password), sponsor?.id || null]
        );
        if (sponsor) {
            ({ rows } = await db.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1 RETURNING *`,
                [rows[0].id, INVITEE_BONUS.coins, INVITEE_BONUS.nuggets]));
        }
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

    // Top 50 of a board (everyone or friends only) plus the caller's own row.
    async leaderboard(db, body, event) {
        const user = await requireUser(db, event);
        const board = BOARDS[body.board] ? body.board : 'quiz';
        const week = board === 'quiz' && body.period === 'week';
        const friends = body.scope === 'friends';
        const { rows } = await db.query(
            `WITH s AS (${BOARDS[board](week)}),
             r AS (
                SELECT u.username, s.score, s.extra, u.id = $1 AS me, ${SEASON_BADGE('u.id')},
                       RANK() OVER (ORDER BY s.score DESC, s.extra DESC)::int AS rank,
                       COUNT(*) OVER ()::int AS players
                FROM s JOIN users u ON u.id = s.user_id
                WHERE s.score > 0
                  AND (u.username NOT LIKE 'zz\\_test\\_%' OR u.id = $1)
                  AND (NOT $2 OR u.id = $1 OR EXISTS (
                        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                          AND ((f.requester_id = $1 AND f.addressee_id = u.id) OR (f.addressee_id = $1 AND f.requester_id = u.id))))
             )
             SELECT * FROM r WHERE rank <= 50 OR me ORDER BY rank, username`,
            [user.id, friends]
        );
        const me = rows.find((r) => r.me) || null;
        return {
            board, period: week ? 'week' : 'all', scope: friends ? 'friends' : 'all',
            players: rows[0]?.players || 0,
            top: rows.filter((r) => r.rank <= 50).slice(0, 50).map(({ players, ...r }) => withBadge(r)),
            me: me && (({ players, ...r }) => withBadge(r))(me),
        };
    },

    // Public profile of a player: collection, arena, season badge and history.
    async player(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [p] } = await db.query(
            `SELECT u.id, u.username, u.created_at, u.id = $1 AS me,
                    (SELECT COUNT(*)::int FROM user_cards WHERE user_id = u.id) AS discovered,
                    (SELECT COALESCE(SUM(count), 0)::int FROM user_cards WHERE user_id = u.id) AS owned,
                    (SELECT COUNT(*)::int FROM trophy_claims WHERE user_id = u.id) AS trophies,
                    (SELECT COUNT(*)::int FROM battles WHERE user_id = u.id AND status = 'won') AS "battleWins",
                    a.rating, a.wins, a.losses, COALESCE(a.campaign, 0) AS campaign,
                    (SELECT f.status FROM friendships f WHERE (f.requester_id = $1 AND f.addressee_id = u.id)
                        OR (f.requester_id = u.id AND f.addressee_id = $1)) AS friendship,
                    ${SEASON_BADGE('u.id')}
             FROM users u LEFT JOIN arena a ON a.user_id = u.id
             WHERE lower(u.username) = lower($2)`,
            [user.id, String(body.username || '').trim()]
        );
        if (!p) throw new HttpError(404, 'Joueur introuvable');
        const { rows: seasons } = await db.query(
            `SELECT season, rank, rating, wins, losses, rating >= $2 AS ranked FROM season_results
             WHERE user_id = $1 ORDER BY season DESC LIMIT 24`, [p.id, SEASON_MIN_RATING]);
        const { id, ...rest } = withBadge(p);
        return { player: { ...rest, seasons: seasons.map((r) => ({ ...r, label: seasonLabel(r.season) })) } };
    },

    // Public: who sent this invite link (shown on the sign-up page).
    async inviteInfo(db, body) {
        const sponsor = body.code ? await findSponsor(db, body.code) : null;
        if (!sponsor) throw new HttpError(404, 'Lien d\'invitation inconnu');
        return { username: sponsor.username, bonus: INVITEE_BONUS };
    },

    async invites(db, body, event) {
        const user = await requireUser(db, event);
        return inviteState(db, user);
    },

    // Pays the sponsor for every invitee who has played INVITE_DAYS days, within the cap.
    async claimInvites(db, body, event) {
        const user = await requireUser(db, event);
        const paid = await inTransaction(db, async (client) => {
            const { rows: [u] } = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const { rows: [{ n }] } = await client.query(`SELECT COUNT(*)::int AS n FROM users WHERE invited_by = $1 AND invite_rewarded_at IS NOT NULL`, [u.id]);
            const room = Math.max(0, INVITE_CAP - n);
            if (!room) return 0;
            const { rowCount } = await client.query(
                `UPDATE users SET invite_rewarded_at = now() WHERE id IN (
                    SELECT u.id FROM users u WHERE u.invited_by = $1 AND u.invite_rewarded_at IS NULL
                      AND (SELECT COUNT(DISTINCT d) FROM (
                            SELECT (at AT TIME ZONE 'Europe/Paris')::date AS d FROM openings WHERE user_id = u.id
                            UNION SELECT day FROM quizzes WHERE user_id = u.id AND status = 'done') x) >= $2
                    ORDER BY u.created_at LIMIT $3)`, [u.id, INVITE_DAYS, room]);
            if (rowCount) {
                await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1`,
                    [u.id, rowCount * INVITE_REWARD.coins, rowCount * INVITE_REWARD.nuggets]);
            }
            return rowCount;
        });
        if (!paid) throw new HttpError(400, 'Aucune récompense à récupérer pour l\'instant');
        const { rows: [updated] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return { paid, coins: paid * INVITE_REWARD.coins, nuggets: paid * INVITE_REWARD.nuggets, user: await publicUser(db, updated), invites: await inviteState(db, updated) };
    },

    // Sharing can't be verified, so it pays little and only once per account.
    async shareReward(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [updated] } = await db.query(
            `UPDATE users SET coins = coins + $2, last_share = ${PARIS_DAY}
             WHERE id = $1 AND last_share IS NULL RETURNING *`, [user.id, SHARE_COINS]);
        if (!updated) throw new HttpError(409, 'Bonus de partage déjà reçu');
        return { coins: SHARE_COINS, user: await publicUser(db, updated), invites: await inviteState(db, updated) };
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

    // ---- Friends ----
    async friends(db, body, event) {
        const user = await requireUser(db, event);
        const { rows } = await db.query(
            `SELECT u.username, f.status, f.requester_id = $1 AS outgoing, f.created_at, f.accepted_at,
                    (SELECT COUNT(*)::int FROM user_cards WHERE user_id = u.id) AS discovered, ${SEASON_BADGE('u.id')}
             FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
             WHERE $1 IN (f.requester_id, f.addressee_id)
             ORDER BY f.accepted_at DESC NULLS LAST, f.created_at DESC`,
            [user.id]
        );
        rows.forEach(withBadge);
        return {
            friends: rows.filter((r) => r.status === 'accepted'),
            incoming: rows.filter((r) => r.status === 'pending' && !r.outgoing),
            outgoing: rows.filter((r) => r.status === 'pending' && r.outgoing),
        };
    },

    // Pseudo suggestions while typing, with the current relation to each player.
    async searchPlayers(db, body, event) {
        const user = await requireUser(db, event);
        const q = String(body.query || '').trim();
        if (q.length < 2) return { players: [] };
        const { rows } = await db.query(
            `SELECT u.username, f.status, f.requester_id = $1 AS outgoing
             FROM users u LEFT JOIN friendships f
               ON (f.requester_id = $1 AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = $1)
             WHERE u.id <> $1 AND u.username ILIKE $2 || '%'
             ORDER BY lower(u.username) = lower($2) DESC, length(u.username), u.username LIMIT 8`,
            [user.id, q.replace(/[%_\\]/g, '\\$&')]
        );
        return { players: rows };
    },

    // Sending a request to someone who already asked you simply accepts theirs.
    async friendRequest(db, body, event) {
        const user = await requireUser(db, event);
        const other = await findUser(db, body.username);
        if (other.id === user.id) throw new HttpError(400, 'Tu ne peux pas t\'ajouter toi-même');
        const f = await relation(db, user.id, other.id);
        if (f?.status === 'accepted') throw new HttpError(409, `${other.username} est déjà ton ami`);
        if (f && f.requester_id === user.id) throw new HttpError(409, `Demande déjà envoyée à ${other.username}`);
        if (f) {
            await db.query(`UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE requester_id = $1 AND addressee_id = $2`, [other.id, user.id]);
            return { status: 'accepted', username: other.username };
        }
        await db.query(`INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, other.id]);
        return { status: 'pending', username: other.username };
    },

    async respondFriend(db, body, event) {
        const user = await requireUser(db, event);
        const other = await findUser(db, body.username);
        const { rowCount } = body.accept
            ? await db.query(`UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`, [other.id, user.id])
            : await db.query(`DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`, [other.id, user.id]);
        if (!rowCount) throw new HttpError(404, 'Demande introuvable');
        return { ok: true, user: await publicUser(db, user) };
    },

    // Removes a friend, or withdraws a request. Pending trades between the two are cancelled.
    async removeFriend(db, body, event) {
        const user = await requireUser(db, event);
        const other = await findUser(db, body.username);
        await db.query(
            `DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
            [user.id, other.id]
        );
        await db.query(
            `UPDATE trades SET status = 'cancelled', resolved_at = now()
             WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
            [user.id, other.id]
        );
        return { ok: true };
    },

    // ---- Badges & messages ----
    async badges(db, body, event) {
        const user = await requireUser(db, event);
        const pub = await publicUser(db, user);
        return { user: pub, badges: await badgeCounts(db, user, pub) };
    },

    // One row per correspondent (last message, unread count), plus friends not written to yet.
    async conversations(db, body, event) {
        const user = await requireUser(db, event);
        const [{ rows: conversations }, { rows: friends }] = await Promise.all([
            db.query(
                `SELECT u.username, m.body, m.created_at, m.from_id = $1 AS mine,
                        (SELECT COUNT(*)::int FROM messages WHERE from_id = u.id AND to_id = $1 AND read_at IS NULL) AS unread,
                        EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                                AND ((f.requester_id = $1 AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = $1))) AS friend
                 FROM (SELECT DISTINCT ON (other) * FROM (
                          SELECT *, CASE WHEN from_id = $1 THEN to_id ELSE from_id END AS other FROM messages WHERE $1 IN (from_id, to_id)
                       ) x ORDER BY other, id DESC) m
                 JOIN users u ON u.id = m.other
                 ORDER BY m.id DESC LIMIT 100`, [user.id]),
            db.query(
                `SELECT u.username FROM friendships f
                 JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
                 WHERE f.status = 'accepted' AND $1 IN (f.requester_id, f.addressee_id) ORDER BY lower(u.username)`, [user.id]),
        ]);
        const talked = new Set(conversations.map((c) => c.username));
        return { conversations, friends: friends.map((f) => f.username).filter((u) => !talked.has(u)) };
    },

    // The last messages with one player (or those after `after`), marking theirs as read.
    async thread(db, body, event) {
        const user = await requireUser(db, event);
        const other = await findUser(db, body.username);
        const after = Number(body.after) || 0;
        const { rows } = await db.query(
            `SELECT * FROM (
                SELECT id, body, created_at, read_at, from_id = $1 AS mine FROM messages
                WHERE ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) AND id > $3
                ORDER BY id DESC LIMIT ${THREAD_LIMIT}) t ORDER BY id`,
            [user.id, other.id, after]
        );
        const { rowCount: read } = await db.query(
            `UPDATE messages SET read_at = now() WHERE from_id = $2 AND to_id = $1 AND read_at IS NULL`, [user.id, other.id]);
        const f = await relation(db, user.id, other.id);
        return { username: other.username, friend: f?.status === 'accepted', messages: rows, read };
    },

    async sendMessage(db, body, event) {
        const user = await requireUser(db, event);
        const text = String(body.body || '').replace(/\r\n/g, '\n').trim();
        if (!text) throw new HttpError(400, 'Message vide');
        if (text.length > MESSAGE_MAX) throw new HttpError(400, `Message trop long (${MESSAGE_MAX} caractères maximum)`);
        const other = await requireFriend(db, user.id, body.username);
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM messages WHERE from_id = $1 AND created_at > now() - interval '1 minute'`, [user.id]);
        if (n >= MESSAGES_PER_MINUTE) throw new HttpError(429, 'Doucement ! Attends un peu avant d\'envoyer d\'autres messages');
        const { rows: [message] } = await db.query(
            `INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at, read_at, true AS mine`,
            [user.id, other.id, text]
        );
        return { message };
    },

    // ---- Trades ----
    // Cards to pick from when building a trade: mine, or a friend's (with how many I already have).
    async tradeCards(db, body, event) {
        const user = await requireUser(db, event);
        const owner = body.username ? await requireFriend(db, user.id, body.username) : user;
        const q = String(body.query || '').trim();
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count, COALESCE(mine.count, 0) AS have, COUNT(*) OVER()::int AS matches
             FROM user_cards uc JOIN cards c ON c.id = uc.card_id
             LEFT JOIN user_cards mine ON mine.user_id = $2 AND mine.card_id = uc.card_id
             WHERE uc.user_id = $1 AND ($3::text IS NULL OR c.type = $3) AND ($4::text IS NULL OR c.rarity = $4)
               AND ($5 = '' OR c.name ILIKE '%' || $5 || '%' OR c.sci_name ILIKE '%' || $5 || '%')
             ORDER BY ${body.missing && owner.id !== user.id ? '(mine.count IS NULL) DESC, ' : ''}${RARITY_ORDER} DESC, c.views DESC
             LIMIT 60 OFFSET $6`,
            [owner.id, user.id, body.type || null, body.rarity || null, q, Math.max(Number(body.offset) || 0, 0)]
        );
        return { matches: rows[0]?.matches || 0, cards: rows.map(({ matches, ...c }) => c) };
    },

    async proposeTrade(db, body, event) {
        const user = await requireUser(db, event);
        const other = await requireFriend(db, user.id, body.username);
        const clean = (list) => {
            const map = new Map();
            for (const it of Array.isArray(list) ? list : []) {
                const id = Number(it.cardId), qty = Number(it.qty || 1);
                if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Carte invalide');
                map.set(id, (map.get(id) || 0) + qty);
            }
            return [...map];
        };
        const give = clean(body.give), get = clean(body.get);
        if (!give.length && !get.length) throw new HttpError(400, 'Choisis au moins une carte');
        if (give.length > MAX_TRADE_ITEMS || get.length > MAX_TRADE_ITEMS) throw new HttpError(400, `${MAX_TRADE_ITEMS} cartes différentes au maximum de chaque côté`);
        const check = async (ownerId, items, who) => {
            if (!items.length) return;
            const { rows } = await db.query(
                `SELECT card_id, count FROM user_cards WHERE user_id = $1 AND card_id = ANY($2::int[])`, [ownerId, items.map(([id]) => id)]
            );
            const have = new Map(rows.map((r) => [r.card_id, r.count]));
            for (const [id, qty] of items) if ((have.get(id) || 0) < qty) throw new HttpError(400, `${who} pas assez d'exemplaires d'une des cartes`);
        };
        await check(user.id, give, 'Tu n\'as');
        await check(other.id, get, `${other.username} n'a`);
        const { rows: [{ pending }] } = await db.query(`SELECT COUNT(*)::int AS pending FROM trades WHERE from_id = $1 AND status = 'pending'`, [user.id]);
        if (pending >= MAX_PENDING_TRADES) throw new HttpError(429, `${MAX_PENDING_TRADES} propositions en attente au maximum`);
        return inTransaction(db, async (client) => {
            const { rows: [t] } = await client.query(
                `INSERT INTO trades (from_id, to_id, message) VALUES ($1, $2, $3) RETURNING id`,
                [user.id, other.id, String(body.message || '').trim().slice(0, 200) || null]
            );
            for (const [id, qty] of give) await client.query(`INSERT INTO trade_items (trade_id, owner_id, card_id, qty) VALUES ($1, $2, $3, $4)`, [t.id, user.id, id, qty]);
            for (const [id, qty] of get) await client.query(`INSERT INTO trade_items (trade_id, owner_id, card_id, qty) VALUES ($1, $2, $3, $4)`, [t.id, other.id, id, qty]);
            return { id: t.id };
        });
    },

    async trades(db, body, event) {
        const user = await requireUser(db, event);
        const [pending, history] = await Promise.all([
            loadTrades(db, user.id, `t.status = 'pending' AND $1 IN (t.from_id, t.to_id)`),
            loadTrades(db, user.id, `t.status <> 'pending' AND $1 IN (t.from_id, t.to_id)`),
        ]);
        return { incoming: pending.filter((t) => !t.mine), outgoing: pending.filter((t) => t.mine), history };
    },

    // Accepting swaps every card in one transaction: either all cards move, or none.
    async respondTrade(db, body, event) {
        const user = await requireUser(db, event);
        const result = await inTransaction(db, async (client) => {
            const { rows: [t] } = await client.query(`SELECT * FROM trades WHERE id = $1 AND to_id = $2 FOR UPDATE`, [Number(body.id), user.id]);
            if (!t || t.status !== 'pending') throw new HttpError(404, 'Proposition introuvable ou déjà traitée');
            if (!body.accept) {
                await client.query(`UPDATE trades SET status = 'declined', resolved_at = now() WHERE id = $1`, [t.id]);
                return 'declined';
            }
            const f = await relation(client, t.from_id, t.to_id);
            if (f?.status !== 'accepted') throw new HttpError(403, 'Vous n\'êtes plus amis');
            // Lock both players' collections in a fixed order so two trades can't deadlock.
            await client.query(`SELECT 1 FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [[t.from_id, t.to_id]]);
            const { rows: items } = await client.query(`SELECT * FROM trade_items WHERE trade_id = $1`, [t.id]);
            for (const it of items) {
                const to = it.owner_id === t.from_id ? t.to_id : t.from_id;
                if (!(await moveCard(client, it.owner_id, to, it.card_id, it.qty))) {
                    throw new HttpError(409, it.owner_id === user.id
                        ? 'Tu n\'as plus toutes les cartes demandées (vendues ou échangées entre-temps)'
                        : 'Ton ami n\'a plus toutes les cartes proposées : l\'échange ne peut pas se faire');
                }
            }
            await client.query(`UPDATE trades SET status = 'accepted', resolved_at = now() WHERE id = $1`, [t.id]);
            return 'accepted';
        });
        const { rows: [fresh] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return { status: result, user: await publicUser(db, fresh) };
    },

    async cancelTrade(db, body, event) {
        const user = await requireUser(db, event);
        const { rowCount } = await db.query(
            `UPDATE trades SET status = 'cancelled', resolved_at = now() WHERE id = $1 AND from_id = $2 AND status = 'pending'`,
            [Number(body.id), user.id]
        );
        if (!rowCount) throw new HttpError(404, 'Proposition introuvable ou déjà traitée');
        return { ok: true };
    },

    async quiz(db, body, event) {
        const user = await requireUser(db, event);
        return quizState(db, user.id);
    },

    async quizStart(db, body, event) {
        const user = await requireUser(db, event);
        const theme = THEMES[body.theme] ? body.theme : 'all';
        const id = await inTransaction(db, async (client) => {
            await client.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const { rows: [active] } = await client.query(`SELECT id FROM quizzes WHERE user_id = $1 AND status = 'active' LIMIT 1`, [user.id]);
            if (active) return active.id; // finish the running quiz first
            const day = await parisDay(client);
            const { rows: [{ played }] } = await client.query(`SELECT COUNT(*)::int AS played FROM quizzes WHERE user_id = $1 AND day = $2`, [user.id, day]);
            if (played >= QUIZ_PER_DAY) throw new HttpError(429, `Tu as joué tes ${QUIZ_PER_DAY} quiz du jour. Reviens demain pour de nouvelles questions !`);
            const { rows: seenRows } = await client.query(`SELECT card_id, at FROM quiz_seen WHERE user_id = $1`, [user.id]);
            const seen = new Map(seenRows.map((r) => [r.card_id, new Date(r.at).getTime()]));
            const questions = await buildQuiz(db, theme, seen);
            if (questions.length < 5) throw new HttpError(503, 'Impossible de préparer un quiz pour ce thème, essaie un autre thème');
            const { rows: [q] } = await client.query(
                `INSERT INTO quizzes (user_id, day, theme, questions) VALUES ($1, $2, $3, $4) RETURNING id`,
                [user.id, day, theme, JSON.stringify(questions)]
            );
            await client.query(
                `INSERT INTO quiz_seen (user_id, card_id) SELECT $1, unnest($2::int[])
                 ON CONFLICT (user_id, card_id) DO UPDATE SET at = now()`,
                [user.id, [...new Set(questions.map((x) => x.about))]]
            );
            return q.id;
        });
        return { id };
    },

    // Shows the current question and starts its timer (a reload keeps the same deadline).
    async quizNext(db, body, event) {
        const user = await requireUser(db, event);
        return inTransaction(db, async (client) => {
            const q = await lockQuiz(client, user.id, body.id);
            if (q.status === 'done') return { quiz: quizProgress(q), done: true };
            let askedAt = q.asked_at;
            if (!askedAt) {
                ({ rows: [{ asked_at: askedAt }] } = await client.query(`UPDATE quizzes SET asked_at = now() WHERE id = $1 RETURNING asked_at`, [q.id]));
            }
            return { quiz: quizProgress(q), question: publicQuestion(q.questions[q.current], q.current, askedAt), serverNow: new Date().toISOString() };
        });
    },

    async quizAnswer(db, body, event) {
        const user = await requireUser(db, event);
        const result = await inTransaction(db, async (client) => {
            const q = await lockQuiz(client, user.id, body.id);
            if (q.status === 'done') throw new HttpError(409, 'Ce quiz est déjà terminé');
            if (Number(body.index) !== q.current || !q.asked_at) throw new HttpError(409, 'Cette question a déjà reçu une réponse');
            const question = q.questions[q.current];
            const late = isLate(question, q.asked_at);
            const choice = Number.isInteger(body.choice) ? body.choice : -1;
            const correct = !late && choice === question.answer;
            const gained = correct ? LEVEL_COINS[question.level] : 0;
            const answers = [...q.answers, { choice, correct, late, ms: Date.now() - new Date(q.asked_at).getTime() }];
            const done = answers.length >= q.questions.length;
            const score = q.score + (correct ? 1 : 0);
            let coins = q.coins + gained;
            let nuggets = 0, rewardCard = null;
            if (done) {
                const perfect = score === q.questions.length;
                if (perfect) { coins += PERFECT_COINS; nuggets = PERFECT_NUGGETS; }
                if (score >= CARD_SCORE) {
                    // A card of a species the player recognised, new to the collection if possible (Rare at most).
                    const known = q.questions.filter((_, i) => answers[i].correct).map((x) => x.about);
                    const { rows: [c] } = await client.query(
                        `SELECT c.id FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1
                         WHERE c.id = ANY($2::int[]) AND c.rarity IN ('common', 'uncommon', 'rare')
                         ORDER BY (uc.card_id IS NULL) DESC, random() LIMIT 1`, [user.id, known]);
                    const fallback = c || (await client.query(
                        `SELECT id FROM cards WHERE rarity = 'uncommon' AND views >= 800 ORDER BY random() LIMIT 1`)).rows[0];
                    rewardCard = fallback?.id || null;
                    if (rewardCard) await giveCard(client, user.id, rewardCard);
                }
                await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1`, [user.id, coins, nuggets]);
            }
            const { rows: [updated] } = await client.query(
                `UPDATE quizzes SET answers = $2, current = current + 1, asked_at = NULL, score = $3, coins = $4, nuggets = $5,
                        reward_card = $6, status = $7, finished_at = CASE WHEN $7 = 'done' THEN now() END
                 WHERE id = $1 RETURNING *`,
                [q.id, JSON.stringify(answers), score, coins, nuggets, rewardCard, done ? 'done' : 'active']
            );
            return {
                correct, late, gained, answer: question.answer, facts: question.facts || null,
                reveal: question.hideLabels ? question.options.map((o) => o.label) : null,
                about: question.about, done, quiz: quizProgress(updated), rewardCard, perfect: done && score === q.questions.length,
            };
        });
        const { about, rewardCard, ...res } = result;
        res.learn = await learnCard(db, about, user.id);
        if (res.done) {
            const { rows: [q] } = await db.query(`SELECT questions, answers FROM quizzes WHERE id = $1`, [Number(body.id)]);
            const ids = q.questions.map((x) => x.about);
            const { rows: cards } = await db.query(`SELECT id, name, sci_name, thumb_url, type FROM cards WHERE id = ANY($1::int[])`, [ids]);
            res.recap = ids.map((id, i) => ({ card: cards.find((c) => c.id === id), correct: q.answers[i]?.correct, kind: q.questions[i].kind }));
            res.rewardCard = rewardCard ? await learnCard(db, rewardCard, user.id) : null;
            res.user = await publicUser(db, await requireUser(db, event));
        }
        return res;
    },

    async shop(db, body, event) {
        const user = await requireUser(db, event);
        if (stripeReady()) {
            const { rows: pending } = await db.query(
                `SELECT * FROM purchases WHERE user_id = $1 AND status = 'pending' AND stripe_session IS NOT NULL
                 AND created_at > now() - interval '2 days' ORDER BY id DESC LIMIT 3`, [user.id]);
            await Promise.all(pending.map((p) => refreshPurchase(db, p).catch((err) => console.error('refresh', p.id, err.message))));
        }
        const live = !stripeTestMode();
        const [{ rows: totals }, { rows: mine }, { rows: bought }] = await Promise.all([
            db.query(`SELECT association, SUM(donation_cents)::int AS donated, COUNT(*)::int AS purchases
                      FROM purchases WHERE status = 'paid' AND livemode = $1 GROUP BY 1`, [live]),
            db.query(`SELECT * FROM purchases WHERE user_id = $1 AND status <> 'pending' OR (user_id = $1 AND created_at > now() - interval '1 hour')
                      ORDER BY id DESC LIMIT 20`, [user.id]),
            db.query(`SELECT DISTINCT pack FROM purchases WHERE user_id = $1 AND status = 'paid'`, [user.id]),
        ]);
        const byAssoc = Object.fromEntries(totals.map((t) => [t.association, t]));
        return {
            ready: stripeReady(),
            testMode: stripeReady() && stripeTestMode(),
            donationShare: DONATION_SHARE,
            packs: Object.entries(PACKS).map(([id, p]) => ({
                id, ...p, donation: donationOf(p.price), available: !p.once || !bought.some((b) => b.pack === id),
            })),
            associations: Object.entries(ASSOCIATIONS).map(([id, a]) => ({
                id, ...a, donated: byAssoc[id]?.donated || 0, purchases: byAssoc[id]?.purchases || 0,
            })),
            totalDonated: totals.reduce((sum, t) => sum + t.donated, 0),
            purchases: mine.map(shapePurchase),
            user: await publicUser(db, await requireUser(db, event)),
        };
    },

    async shopCheckout(db, body, event) {
        const user = await requireUser(db, event);
        if (!stripeReady()) throw new HttpError(503, 'Le paiement n\'est pas encore activé');
        const pack = PACKS[body.pack];
        if (!pack) throw new HttpError(400, 'Pack inconnu');
        if (!ASSOCIATIONS[body.association]) throw new HttpError(400, 'Choisis une association');
        if (body.consent !== true) throw new HttpError(400, 'Confirme la livraison immédiate des crédits');
        if (pack.once) {
            const { rows: [done] } = await db.query(`SELECT 1 FROM purchases WHERE user_id = $1 AND pack = $2 AND status = 'paid'`, [user.id, body.pack]);
            if (done) throw new HttpError(409, 'Cette offre n\'est valable qu\'une fois par compte');
        }
        const { rows: [{ recent }] } = await db.query(
            `SELECT COUNT(*)::int AS recent FROM purchases WHERE user_id = $1 AND created_at > now() - interval '10 minutes'`, [user.id]);
        if (recent >= 5) throw new HttpError(429, 'Trop de tentatives, réessaie dans quelques minutes');
        const origin = SITE_ORIGINS.includes(event.headers?.origin) ? event.headers.origin : SITE_ORIGINS[0];
        const { rows: [p] } = await db.query(
            `INSERT INTO purchases (user_id, username, pack, amount_cents, donation_cents, association, coins, nuggets)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [user.id, user.username, body.pack, pack.price, donationOf(pack.price), body.association, pack.coins, pack.nuggets]
        );
        let session;
        try {
            session = await createCheckout({ purchaseId: p.id, pack: body.pack, association: body.association, username: user.username, origin });
        } catch (err) {
            await db.query(`DELETE FROM purchases WHERE id = $1`, [p.id]);
            throw new HttpError(502, 'Le service de paiement ne répond pas, réessaie plus tard');
        }
        await db.query(`UPDATE purchases SET stripe_session = $2 WHERE id = $1`, [p.id, session.id]);
        return { url: session.url };
    },

    async shopConfirm(db, body, event) {
        const user = await requireUser(db, event);
        if (!stripeReady()) throw new HttpError(503, 'Le paiement n\'est pas encore activé');
        const { rows: [p] } = await db.query(`SELECT * FROM purchases WHERE stripe_session = $1 AND user_id = $2`, [String(body.session || ''), user.id]);
        if (!p) throw new HttpError(404, 'Achat introuvable');
        if (p.status === 'pending') await refreshPurchase(db, p);
        const { rows: [now] } = await db.query(`SELECT * FROM purchases WHERE id = $1`, [p.id]);
        return { purchase: shapePurchase(now), user: await publicUser(db, await requireUser(db, event)) };
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

Object.assign(actions, arenaActions({ requireUser, inTransaction, HttpError, publicUser, parisDay }));

const PUBLIC_ACTIONS = new Set(['catalog', 'register', 'login', 'logout', 'inviteInfo']);

export const handler = async (event) => {
    if (event.source === 'schedule') {
        await settleAuctions(getPool());
        await seasonRollover(getPool(), inTransaction);
        return { ok: true };
    }
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    const share = event.requestContext?.http?.method === 'GET' && /\/partage\/(\d+)\/?$/.exec(event.rawPath || '');
    if (share) {
        try {
            return await sharePage(getPool(), Number(share[1]), event.queryStringParameters?.u);
        } catch (error) {
            console.error('share', error);
            return { statusCode: 302, headers: { Location: SITE }, body: '' };
        }
    }
    if (event.rawPath === '/stripe-webhook') {
        try {
            return await stripeWebhook(event);
        } catch (error) {
            console.error('webhook', error);
            return json({ error: 'Erreur serveur' }, 500); // Stripe retries
        }
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
