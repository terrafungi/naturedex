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
    BLITZ, CARD_SCORE, COMBO_STEPS, IUCN_LABELS, KIND_LABELS, LEVEL_COINS, LEVELS, LOAD_MAX_MS, MODES, PERFECT_COINS, PERFECT_NUGGETS, QUIZ_PER_DAY,
    RUN_REWARDS, THEMES, TIME_JOKER_MS, buildQuiz, intro, isLate, kindsFor, levelAt, multiplier, publicQuestion, questionPoints, quizLevel,
} from './quiz.mjs';
import {
    ASSOCIATIONS, DONATION_SHARE, PACKS, PASS, createCheckout, createPassCheckout, donationOf, getCheckout, getSubscription,
    invoiceSubscription, passActive, periodEnd, setCancelAtPeriodEnd, stripeReady, stripeTestMode, verifyWebhook,
} from './shop.mjs';
import { DAILY_BATTLES, DAILY_REWARDS, SEASON_MIN_RATING, arenaActions, seasonLabel, seasonRollover } from './arena.mjs';
import { duelActions } from './duel.mjs';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RARITY_STYLE, renderShareImage } from './share-image.mjs';
import { blogRoute, blogTick, latestPosts } from './blog.mjs';
import { speciesRoute } from './species.mjs';
import { massCheckTick } from './mass-check.mjs';
import { biomeCheckTick } from './biome-check.mjs';
import { speciesEnrichTick } from './species-enrich.mjs';
import { fieldActions } from './field.mjs';
import { exploreActions } from './explore.mjs';
import { BOOSTER_PLANTS, CONVERT_BONUS, CONVERT_BONUS_MAX, NUGGETS_PER_SEED, convertBonusReady, gardenActions } from './garden.mjs';
import { AVATAR_SQL, avatarActions, avatarOf } from './avatar.mjs';

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
const CHARGE_MS = 30 * 60 * 1000; // a full refill takes 5 h
const DAILY_COOLDOWN_MS = 20 * 3600 * 1000;
// Rewarded ads can't be verified server-side (web ads have no callback), so the reward is small and capped.
const AD_DAILY = 5; // bonus boosters per Paris day
const AD_MIN_SECONDS = 12; // minimum time between starting and claiming an ad
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

// Free openings: `charges` as of `charges_at`, plus one every 30 min (15 min with the Pass) up to the cap.
const chargeMs = (user) => (passActive(user) ? PASS.chargeMinutes * 60000 : CHARGE_MS);
function chargeState(user, now = Date.now()) {
    const from = new Date(user.charges_at).getTime(), step = chargeMs(user);
    const ticks = Math.max(0, Math.floor((now - from) / step));
    const charges = Math.min(MAX_CHARGES, user.charges + ticks);
    return { charges, ticks, from, step, nextAt: charges >= MAX_CHARGES ? null : from + (ticks + 1) * step };
}

const quizPerDay = (user) => QUIZ_PER_DAY + (passActive(user) ? PASS.quizzes : 0);

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
        chargeMinutes: chargeMs(user) / 60000,
        nextChargeAt: charge.nextAt && new Date(charge.nextAt).toISOString(),
        boosterPrice: BOOSTER_PRICE,
        plants: user.plants,
        boosterPlants: BOOSTER_PLANTS,
        plots: user.plots,
        nuggetsPerSeed: NUGGETS_PER_SEED,
        convertBonus: { ready: convertBonusReady(user), rate: CONVERT_BONUS, max: CONVERT_BONUS_MAX },
        dailyCoins: DAILY_COINS,
        nextDailyAt: nextDaily > Date.now() ? new Date(nextDaily).toISOString() : null,
        recycleValue: RECYCLE_VALUE,
        social: await socialCounts(db, user.id),
        quizPerDay: quizPerDay(user),
        pass: passActive(user) ? { until: user.pass_until, cancelled: user.pass_cancel } : null,
        avatar: avatarOf(user),
        newsSeen: user.news_seen,
        joinedAt: user.created_at,
        ...rows[0],
    };
}

// Friend requests and trade offers waiting for this player (badge in the navigation).
async function socialCounts(db, userId) {
    const { rows: [c] } = await db.query(
        `SELECT (SELECT COUNT(*)::int FROM friendships WHERE addressee_id = $1 AND status = 'pending') AS "friendRequests",
                (SELECT COUNT(*)::int FROM trades WHERE to_id = $1 AND status = 'pending') AS "tradeOffers",
                (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND mode = 'classic' AND day = (now() AT TIME ZONE 'Europe/Paris')::date) AS "quizPlayed",
                (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND mode = 'daily' AND day = (now() AT TIME ZONE 'Europe/Paris')::date) AS "quizDaily",
                (SELECT COUNT(*)::int FROM messages WHERE to_id = $1 AND read_at IS NULL) AS "unreadMessages",
                (SELECT COUNT(*)::int FROM gifts WHERE to_id = $1 AND seen_at IS NULL) AS "newGifts"`,
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
    { key: 'water', icon: 'drop', title: 'Sources de Vie', text: 'Obtiens 2 cartes Eau : poisson, créature aquatique, mollusque aquatique ou algue', goal: 2, reward: 60, types: ['fish', 'marine', 'aquatic', 'alga'] },
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
    arthropod: 'Insectes & arachnides', terrestrial: 'Mollusques terrestres', aquatic: 'Mollusques aquatiques', marine: 'Créatures aquatiques', plant: 'Plantes', tree: 'Arbres',
    alga: 'Algues', fungus: 'Champignons', mold: 'Moisissures & levures', bacteria: 'Bactéries', virus: 'Virus', fossil: 'Fossiles', mineral: 'Minéraux',
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
    ...series('Collection', 'globe', 'types', [[14, 'Arche de Noé']], () => 'Possède des cartes de 14 types différents'),
    ...series('Collection', 'globe', 'types10', [[14, 'Tour du monde vivant']], () => 'Découvre 10 espèces dans 14 types différents'),
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
    ...series('Terrain', 'camera', 'fieldSpecies', [[1, 'Premier cliché'], [10, 'Naturaliste de terrain'], [50, 'Œil de photographe'], [150, 'Inventaire vivant'], [500, 'Atlas de la biodiversité']],
        (g) => g > 1 ? `Photographie ${n(g)} espèces différentes sur le terrain` : 'Photographie ta première espèce sur le terrain'),
    ...series('Terrain', 'compass', 'fieldTypes', [[3, 'Œil curieux'], [6, 'Œil polyvalent'], [10, 'Tout-terrain']], (g) => `Photographie des espèces de ${g} types différents`),
    ...series('Terrain', 'aperture', 'fieldRare', [[1, 'Belle trouvaille'], [10, 'Chasseur d\'images rares'], [30, 'Objectif rareté']],
        (g) => `Photographie ${g} espèce${g > 1 ? 's' : ''} Rare${g > 1 ? 's' : ''} ou plus`),
    ...series('Terrain', 'flag', 'fieldFirst', [[1, 'Pionnier'], [10, 'Défricheur'], [50, 'Grand découvreur']],
        (g) => g > 1 ? `Sois le premier joueur à photographier ${g} espèces` : 'Sois le premier joueur à photographier une espèce'),
    ...series('Terrain', 'calendar', 'fieldDays', [[7, 'Sorties régulières'], [30, 'Un mois dehors'], [100, 'Cent sorties nature']],
        (g) => `Fais une observation ${g} jours différents`),
    ...series('Exploration', 'hand', 'exploreCatches', [[1, 'Première capture'], [10, 'Bonne main'], [50, 'Chasseur de cartes'], [200, 'Trappeur'], [500, 'Maître de l\'exploration']],
        (g) => g > 1 ? `Attrape ${n(g)} cartes en exploration` : 'Attrape ta première carte en exploration'),
    ...series('Exploration', 'trees', 'exploreForest', [[1, 'Sous les arbres'], [25, 'Esprit de la forêt'], [100, 'Gardien des bois']],
        (g) => g > 1 ? `Attrape ${g} cartes en forêt` : 'Attrape une carte en forêt'),
    ...series('Exploration', 'mountain', 'exploreHabitats', [[3, 'Randonneur'], [5, 'Baroudeur'], [8, 'Globe-trotteur']],
        (g) => `Attrape des cartes dans ${g} milieux différents (forêt, prairie, ville, eau…)`),
    ...series('Exploration', 'star', 'exploreRare', [[1, 'Belle prise'], [10, 'Flair de pisteur'], [50, 'Traqueur de raretés']],
        (g) => `Attrape ${g} carte${g > 1 ? 's' : ''} Rare${g > 1 ? 's' : ''} ou plus en exploration`),
    ...series('Exploration', 'crown', 'exploreLegendary', [[1, 'Capture légendaire'], [5, 'Chasseur de légendes'], [20, 'Mythe vivant']],
        (g) => g > 1 ? `Attrape ${g} cartes Légendaires en exploration` : 'Attrape une carte Légendaire en exploration'),
    ...series('Exploration', 'crosshair', 'explorePerfect', [[1, 'Lancer parfait'], [25, 'Main sûre'], [100, 'Tireur d\'élite']],
        (g) => g > 1 ? `Réussis ${g} captures avec un lancer parfait` : 'Réussis une capture avec un lancer parfait'),
    ...series('Exploration', 'footprints', 'exploreDays', [[7, 'Promeneur'], [30, 'Un mois de balades'], [100, 'Cent explorations']],
        (g) => `Attrape au moins une carte ${g} jours différents`),
    ...series('Enchères', 'recycle', 'recycled', [[10, 'Tri sélectif'], [100, 'Recycleur'], [1000, 'Compost géant']], (g) => `Recycle ${n(g)} doublons`),
];

// Leaderboards: one (user_id, score, extra) query per board; `extra` breaks ties.
const MONTH_START = `(date_trunc('month', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')`;
const RARITY_POINTS = `CASE c.rarity WHEN 'secret' THEN 100 WHEN 'legendary' THEN 25 WHEN 'epic' THEN 8 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 1 ELSE 0 END`;
const BOARDS = {
    quiz: (period) => `SELECT user_id, SUM(score)::int AS score,
                            COUNT(*) FILTER (WHERE mode IN ('classic', 'daily') AND score = jsonb_array_length(questions))::int AS extra
                     FROM quizzes WHERE status = 'done' ${period === 'week' ? `AND day >= current_date - 6` : ''} GROUP BY 1`,
    species: () => `SELECT user_id, COUNT(*)::int AS score, SUM(count)::int AS extra FROM user_cards GROUP BY 1`,
    cards: () => `SELECT user_id, SUM(count)::int AS score, COUNT(*)::int AS extra FROM user_cards GROUP BY 1`,
    prestige: () => `SELECT uc.user_id, SUM(${RARITY_POINTS})::int AS score,
                            COUNT(*) FILTER (WHERE c.rarity IN ('legendary', 'secret'))::int AS extra
                     FROM user_cards uc JOIN cards c ON c.id = uc.card_id GROUP BY 1`,
    trophies: () => `SELECT user_id, COUNT(*)::int AS score, 0 AS extra FROM trophy_claims GROUP BY 1`,
    arena: () => `SELECT user_id, rating AS score, wins AS extra FROM arena WHERE wins + losses > 0`,
    // Real (live) payments only; 20% of each goes to the chosen association. Players can opt out.
    // 'month' (the default) starts again on the 1st of every month, Paris time.
    donors: (period) => `SELECT p.user_id, SUM(p.donation_cents)::int AS score, COUNT(*)::int AS extra
                   FROM purchases p JOIN users u ON u.id = p.user_id
                   WHERE p.status = 'paid' AND p.livemode AND NOT u.hide_donations
                     ${period === 'month' ? `AND p.paid_at >= ${MONTH_START}` : ''} GROUP BY 1`,
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
    const description = `${extract} Collectionne ${card ? 'toi aussi ' : ''}68 000 espèces du vivant sur NatureDex.`.trim();
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
                    (SELECT COUNT(*)::int FROM quizzes WHERE user_id = $1 AND status = 'done' AND mode IN ('classic', 'daily') AND score = jsonb_array_length(questions)) AS "quizPerfect",
                    (SELECT COUNT(DISTINCT day)::int FROM quizzes WHERE user_id = $1 AND status = 'done') AS "quizDays",
                    (SELECT COUNT(*)::int FROM purchases WHERE user_id = $1 AND status = 'paid') AS patron,
                    (SELECT COUNT(*)::int FROM battles WHERE user_id = $1 AND status = 'won') AS "battleWins",
                    (SELECT COALESCE(MAX(campaign), 0)::int FROM arena WHERE user_id = $1) AS campaign,
                    (SELECT COUNT(*) FILTER (WHERE rank <= 10)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonTop10",
                    (SELECT COUNT(*) FILTER (WHERE rank <= 3)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonPodium",
                    (SELECT COUNT(*) FILTER (WHERE rank = 1)::int FROM season_results WHERE user_id = $1 AND rating >= ${SEASON_MIN_RATING}) AS "seasonChampion",
                    (SELECT COUNT(*)::int FROM observations WHERE user_id = $1 AND status = 'confirmed') AS "fieldSpecies",
                    (SELECT COUNT(DISTINCT c.type)::int FROM observations o JOIN cards c ON c.id = o.card_id WHERE o.user_id = $1 AND o.status = 'confirmed') AS "fieldTypes",
                    (SELECT COUNT(*)::int FROM observations o JOIN cards c ON c.id = o.card_id WHERE o.user_id = $1 AND o.status = 'confirmed'
                        AND c.rarity IN ('rare', 'epic', 'legendary', 'secret')) AS "fieldRare",
                    (SELECT COUNT(*)::int FROM observations WHERE user_id = $1 AND status = 'confirmed' AND first_ever) AS "fieldFirst",
                    (SELECT COUNT(DISTINCT (confirmed_at AT TIME ZONE 'Europe/Paris')::date)::int FROM observations
                        WHERE user_id = $1 AND status IN ('confirmed', 'replaced')) AS "fieldDays",
                    (SELECT COUNT(*)::int FROM explore_catches WHERE user_id = $1 AND caught) AS "exploreCatches",
                    (SELECT COUNT(*)::int FROM explore_catches WHERE user_id = $1 AND caught AND habitat = 'forest') AS "exploreForest",
                    (SELECT COUNT(DISTINCT habitat)::int FROM explore_catches WHERE user_id = $1 AND caught) AS "exploreHabitats",
                    (SELECT COUNT(*)::int FROM explore_catches e JOIN cards c ON c.id = e.card_id WHERE e.user_id = $1 AND e.caught
                        AND c.rarity IN ('rare', 'epic', 'legendary', 'secret')) AS "exploreRare",
                    (SELECT COUNT(*)::int FROM explore_catches e JOIN cards c ON c.id = e.card_id WHERE e.user_id = $1 AND e.caught
                        AND c.rarity = 'legendary') AS "exploreLegendary",
                    (SELECT COUNT(*)::int FROM explore_catches WHERE user_id = $1 AND caught AND perfect) AS "explorePerfect",
                    (SELECT COUNT(DISTINCT (at AT TIME ZONE 'Europe/Paris')::date)::int FROM explore_catches WHERE user_id = $1 AND caught) AS "exploreDays",
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
    const [trophies, { challenges }, { rows: [inv] }, { rows: [fight] }, { rows: [garden] }] = await Promise.all([
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
        db.query(`SELECT COUNT(*)::int AS ready FROM garden_plots WHERE user_id = $1 AND ready_at <= now()`, [user.id]),
    ]);
    const s = pub.social;
    return {
        '/booster': (pub.nextDailyAt ? 0 : 1) + (pub.charges >= pub.maxCharges ? 1 : 0),
        '/jardin': garden.ready,
        '/quiz': Math.max(0, quizPerDay(user) - s.quizPlayed) + (s.quizDaily ? 0 : 1),
        '/defis': challenges.filter((c) => !c.claimed && c.progress >= c.goal).length,
        '/trophees': trophies.filter((t) => !t.claimed && t.progress >= t.goal).length,
        '/inviter': Math.min(inv.ready, Math.max(0, INVITE_CAP - inv.rewarded)),
        '/amis': s.friendRequests + s.tradeOffers + s.newGifts,
        '/messages': s.unreadMessages,
        // rewarded wins are only worth showing while free battles remain to play them
        '/combat': fight.active ? 1 : fight.seasons + (fight.started < DAILY_BATTLES ? Math.min(DAILY_BATTLES - fight.started, Math.max(0, DAILY_REWARDS - fight.rewarded)) : 0),
    };
}

// ---------- private messages ----------

const MESSAGE_MAX = 1000;
const MESSAGES_PER_MINUTE = 20;
// The game's author: any player can write to them (feedback tab), and they can answer anyone.
const OWNER = 'flohenn';
const FEEDBACK_KINDS = {
    guestbook: '📖 Livre d\'or',
    thanks: '💚 Merci',
    idea: '💡 À changer / idée',
    bug: '🐞 Bug',
    other: '✉️ Autre',
};
const FEEDBACK_PER_HOUR = 5;
const isOwner = (u) => u.username.toLowerCase() === OWNER;
const THREAD_LIMIT = 100;

// ---------- gifts between friends ----------

// Daily limits (Paris day), applied both to what one sends and to what one receives,
// so a crowd of fresh accounts can't funnel their welcome rewards into one player.
const GIFT_CURRENCIES = {
    coins: { column: 'coins', max: 300, one: 'graine', many: 'graines' },
    nuggets: { column: 'nuggets', max: 500, one: 'pépite', many: 'pépites' },
    plants: { column: 'plants', max: 30, one: 'plante', many: 'plantes' },
};
const GIFT_FRIEND_HOURS = 24;
const GIFT_NOTE_MAX = 140;
const PARIS_TODAY = `(date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')`;

// What each currency still allows today between me and a friend.
async function giftAllowance(db, meId, friendId) {
    const { rows } = await db.query(
        `SELECT currency,
                COALESCE(SUM(amount) FILTER (WHERE from_id = $1), 0)::int AS sent,
                COALESCE(SUM(amount) FILTER (WHERE to_id = $2), 0)::int AS received
         FROM gifts WHERE (from_id = $1 OR to_id = $2) AND created_at >= ${PARIS_TODAY}
         GROUP BY currency`,
        [meId, friendId]
    );
    const allowance = {};
    for (const [key, c] of Object.entries(GIFT_CURRENCIES)) {
        const r = rows.find((x) => x.currency === key) || { sent: 0, received: 0 };
        allowance[key] = { max: c.max, sent: r.sent, left: Math.max(0, Math.min(c.max - r.sent, c.max - r.received)), friendFull: r.received >= c.max };
    }
    return allowance;
}

// « Pendant ton absence »: what happened since the last visit and has no pop-up of its own
// (gifts and contest prizes have theirs). Each event is shown once; see seenNotices.
async function userNotices(db, user, invitesReady) {
    const since = user.notices_seen_at || new Date(Date.now() - 7 * 86400_000);
    const [{ rows: invitees }, { rows: friends }, { rows: trades }] = await Promise.all([
        db.query(`SELECT username FROM users WHERE invited_by = $1 AND created_at > $2 ORDER BY created_at LIMIT 10`, [user.id, since]),
        db.query(`SELECT u.username FROM friendships f JOIN users u ON u.id = f.requester_id
                  WHERE f.addressee_id = $1 AND f.status = 'pending' AND f.created_at > $2 ORDER BY f.created_at LIMIT 10`, [user.id, since]),
        db.query(`SELECT u.username, t.message FROM trades t JOIN users u ON u.id = t.from_id
                  WHERE t.to_id = $1 AND t.status = 'pending' AND t.created_at > $2 ORDER BY t.created_at LIMIT 10`, [user.id, since]),
    ]);
    const ready = invitesReady > user.invite_ready_seen ? invitesReady : 0;
    if (!invitees.length && !friends.length && !trades.length && !ready) return null;
    return {
        invitees: invitees.map((r) => r.username),
        invitesReady: ready, inviteReward: INVITE_REWARD,
        friendRequests: friends.map((r) => r.username),
        trades: trades.map((r) => ({ from: r.username, message: r.message })),
    };
}

// Gifts received and not yet shown, oldest first, for the pop-up at the next visit.
async function unseenGifts(db, userId) {
    const { rows } = await db.query(
        `SELECT g.id, u.username AS "from", g.currency, g.amount, g.note, g.created_at
         FROM gifts g JOIN users u ON u.id = g.from_id
         WHERE g.to_id = $1 AND g.seen_at IS NULL ORDER BY g.id LIMIT 20`,
        [userId]
    );
    return rows;
}

function giftReadyAt(friendship) {
    return new Date(new Date(friendship.accepted_at).getTime() + GIFT_FRIEND_HOURS * 3600_000);
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

async function adsLeft(db, userId) {
    const { rows: [{ n }] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM ad_views
         WHERE user_id = $1 AND (claimed_at AT TIME ZONE 'Europe/Paris')::date = ${PARIS_DAY}`, [userId]);
    return Math.max(0, AD_DAILY - n);
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
    json_build_object('id', c.id, 'num', c.num, 'name', c.name, 'sci_name', c.sci_name, 'type', c.type, 'rarity', c.rarity, 'art', c.art,
                      'views', c.views, 'thumb_url', c.thumb_url, 'hp', (c.stats->>'hp')::int) AS card`;
const AUCTION_SORTS = {
    ending: 'a.ends_at',
    new: 'a.created_at DESC',
    cheap: 'COALESCE(a.bid, a.start_price)',
    rarity: `${RARITY_ORDER} DESC, a.ends_at`,
};
const shapeAuction = ({ bid, start_price, ...a }) => ({ ...a, bid, start_price, minBid: minBid({ bid, start_price }) });

const CARD_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.art, c.views, c.image_url, c.thumb_url,
                     c.extract, c.wiki_url, c.iucn, c.stats`;

const LIGHT_FIELDS = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.art, c.views, c.thumb_url, (c.stats->>'hp')::int AS hp,
    (c.stats->>'atk')::int AS atk, (c.stats->>'def')::int AS def, (c.stats->>'spd')::int AS spd`;
let catalogCache, catalogAt = 0; // per Lambda container, 10 min

// The catalogue builder skips article intros (too many pages to fetch in bulk):
// fetch one the first time somebody opens the card, and keep it.
// Wikispecies cards link to en.wikipedia: their intro is translated to French first.
async function fillExtract(db, card) {
    const { origin, pathname } = new URL(card.wiki_url);
    const res = await fetch(`${origin}/api/rest_v1/page/summary/${pathname.split('/wiki/').pop()}`, {
        headers: { 'User-Agent': 'NaturDex/0.1 (OpenKBS card game; contact via openkbs.com)' },
        signal: AbortSignal.timeout(4_000),
    }).catch(() => null);
    let extract = res?.ok ? (await res.json()).extract : null;
    if (extract && !origin.includes('//fr.')) extract = await translateIntro(extract, card).catch(() => null);
    if (extract) await db.query(`UPDATE cards SET extract = $2 WHERE id = $1`, [card.id, extract]);
    return extract;
}

async function translateIntro(text, card) {
    const key = process.env.GEMINI_API_KEY;
    const endpoints = [
        ...(key ? [{ url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', headers: { 'x-goog-api-key': key } }] : []),
        { url: 'https://proxy.openkbs.com/v1/google/models/gemini-flash-lite-latest:generateContent', headers: { Authorization: `Bearer ${process.env.OPENKBS_API_KEY}` } },
    ];
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `Traduis en français ce résumé Wikipédia de l'espèce ${card.sci_name || card.name}${card.name !== card.sci_name ? ` (nom français : ${card.name})` : ''}. Garde les noms scientifiques en latin, n'ajoute rien. Réponds uniquement avec la traduction, sans markdown.\n\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    });
    for (const ep of endpoints) {
        const res = await fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body, signal: AbortSignal.timeout(8_000) }).catch(() => null);
        if (!res?.ok) continue;
        const out = ((await res.json()).candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (out.length > 20) return out;
    }
    return null;
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

// Games a player may start per day in each mode (the Pass adds a few).
function modePerDay(user, mode) {
    if (mode === 'classic') return quizPerDay(user);
    const m = MODES[mode];
    return m.perDay + (passActive(user) ? m.passBonus || 0 : 0);
}

async function quizState(db, user) {
    const userId = user.id;
    const day = await parisDay(db);
    const [{ rows: today }, { rows: active }, { rows: days }, { rows: kinds }, { rows: [totals] }, { rows: records }] = await Promise.all([
        db.query(`SELECT id, mode, theme, score, coins, nuggets, points, best_combo AS "bestCombo", status, jsonb_array_length(questions) AS total, finished_at
                  FROM quizzes WHERE user_id = $1 AND day = $2 ORDER BY id`, [userId, day]),
        db.query(`SELECT id, mode, theme, current, score, points, lives, jsonb_array_length(questions) AS total FROM quizzes
                  WHERE user_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`, [userId]),
        db.query(`SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day FROM quizzes WHERE user_id = $1 AND status = 'done'
                  ORDER BY 1 DESC LIMIT 400`, [userId]),
        db.query(`SELECT q.questions -> (a.i::int - 1) ->> 'kind' AS kind, COUNT(*)::int AS answered,
                         COUNT(*) FILTER (WHERE (a.v ->> 'correct')::boolean)::int AS correct
                  FROM quizzes q CROSS JOIN jsonb_array_elements(q.answers) WITH ORDINALITY AS a(v, i)
                  WHERE q.user_id = $1 AND NOT (a.v ? 'skip') GROUP BY 1`, [userId]),
        db.query(`SELECT COUNT(*) FILTER (WHERE status = 'done')::int AS quizzes,
                         COALESCE(SUM(score) FILTER (WHERE status = 'done'), 0)::int AS correct,
                         COALESCE(SUM(jsonb_array_length(answers)) FILTER (WHERE status = 'done'), 0)::int AS questions,
                         COUNT(*) FILTER (WHERE status = 'done' AND mode IN ('classic', 'daily') AND score = jsonb_array_length(questions))::int AS perfect,
                         COALESCE(SUM(points) FILTER (WHERE status = 'done'), 0)::int AS points,
                         COALESCE(MAX(best_combo), 0)::int AS "bestCombo",
                         (SELECT COUNT(*)::int FROM quiz_seen WHERE user_id = $1) AS species
                  FROM quizzes WHERE user_id = $1`, [userId]),
        db.query(`SELECT mode, MAX(points)::int AS points, MAX(score)::int AS score FROM quizzes
                  WHERE user_id = $1 AND status = 'done' GROUP BY 1`, [userId]),
    ]);
    const modes = Object.entries(MODES).map(([key, m]) => {
        const perDay = modePerDay(user, key);
        return {
            key, label: m.label, perDay, left: Math.max(0, perDay - today.filter((q) => q.mode === key).length),
            themes: !!m.themes, lives: m.lives || null, seconds: m.seconds || null, length: m.length || null,
            passBonus: key === 'classic' ? PASS.quizzes : m.passBonus || 0,
            record: records.find((r) => r.mode === key) || null,
        };
    });
    const classic = modes.find((m) => m.key === 'classic');
    return {
        day,
        perDay: classic.perDay,
        left: classic.left,
        today,
        active: active[0] || null,
        streak: quizStreak(days.map((r) => r.day), day),
        stats: totals,
        level: quizLevel(totals.points),
        modes,
        contest: await quizContest(db, userId),
        kinds: Object.entries(KIND_LABELS).map(([kind, label]) => ({ kind, label, ...(kinds.find((k) => k.kind === kind) || { answered: 0, correct: 0 }) })),
        themes: Object.entries(THEMES).map(([key, t]) => ({ key, label: t.label })),
        rewards: {
            levelCoins: LEVEL_COINS, perfectCoins: PERFECT_COINS, perfectNuggets: PERFECT_NUGGETS, cardScore: CARD_SCORE,
            runs: RUN_REWARDS, combo: COMBO_STEPS, blitz: BLITZ,
        },
    };
}

// Today's daily challenge: built once, the same questions for every player.
async function dailyQuestions(db, day) {
    const get = () => db.query(`SELECT questions, reserve FROM quiz_daily WHERE day = $1`, [day]).then((r) => r.rows[0]);
    let d = await get();
    if (!d) {
        const built = await buildQuiz(db, 'all', new Map(), { levels: [...LEVELS, 2] });
        const reserve = built.length > LEVELS.length ? built.pop() : null;
        if (built.length < 5) throw new HttpError(503, 'Le défi du jour se prépare, réessaie dans un instant');
        await db.query(`INSERT INTO quiz_daily (day, questions, reserve) VALUES ($1, $2, $3) ON CONFLICT (day) DO NOTHING`,
            [day, JSON.stringify(built), reserve && JSON.stringify(reserve)]);
        d = await get();
    }
    return d;
}

// More questions for the endless modes, never repeating a species of this game.
async function moreQuestions(db, q, count = 10) {
    const { rows: seenRows } = await db.query(`SELECT card_id, at FROM quiz_seen WHERE user_id = $1`, [q.user_id]);
    const seen = new Map(seenRows.map((r) => [r.card_id, new Date(r.at).getTime()]));
    const exclude = q.questions.flatMap((x) => [...x.cardIds, x.about]);
    const levels = Array.from({ length: count }, (_, i) => levelAt(q.mode, q.questions.length + i));
    return buildQuiz(db, q.theme, seen, { levels, kinds: kindsFor(q.mode), exclude });
}

// The species behind a question, shown after the answer so the player learns something.
async function learnCard(db, cardId, userId) {
    const { rows: [c] } = await db.query(
        `SELECT c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.art, c.views, c.thumb_url, c.image_url, c.iucn, c.wiki_url, c.extract,
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

const ENDLESS = ['survival', 'blitz'];
const quizProgress = (q) => ({
    id: q.id, mode: q.mode, modeLabel: MODES[q.mode]?.label, theme: q.theme, themeLabel: THEMES[q.theme]?.label,
    current: q.current, total: ENDLESS.includes(q.mode) ? null : q.questions.length,
    score: q.score, coins: q.coins, nuggets: q.nuggets, points: q.points, combo: q.combo, multiplier: multiplier(q.combo),
    bestCombo: q.best_combo, lives: q.lives, maxLives: MODES[q.mode]?.lives || null, jokers: q.jokers, reserve: !!q.reserve,
    endsAt: q.ends_at, answered: q.answers.length, results: q.answers.map((a) => (a.skip ? null : a.correct)),
});

const IUCN_CODES = ['CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'EW', 'EX', 'NE'];

// Lower case, no accents, every run of punctuation or spaces becomes one space.
function searchText(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
        .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

// The same normalisation in SQL, so a searchText() query matches with a plain LIKE.
const normSql = (sql) => `regexp_replace(unaccent(lower(${sql})), '[^a-z0-9]+', ' ', 'g')`;

// Card search on the searchText() query in parameter p (card alias c). byName: name or scientific name;
// any: that, or the description (Wikipedia extract, or the long text of the card page).
function cardSearchSql(p) {
    const byName = `${normSql(`c.name || ' ' || coalesce(c.sci_name, '')`)} LIKE '%' || ${p} || '%'`;
    const inText = `EXISTS (SELECT 1 FROM (SELECT NULL) x LEFT JOIN species_texts st ON st.card_id = c.id
        WHERE ${normSql(`coalesce(c.extract, '') || ' ' || coalesce(st.body->>'intro', '') || ' '
            || coalesce(jsonb_path_query_array(st.body, '$.facts[*]')::text, '') || ' '
            || coalesce(jsonb_path_query_array(st.body, '$.sections[*].paragraphs[*]')::text, '')`)} LIKE '%' || ${p} || '%')`;
    return { byName, any: `(${byName} OR ${inText})` };
}

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

const TRADE_CARD = `json_build_object('id', c.id, 'num', c.num, 'name', c.name, 'sci_name', c.sci_name, 'type', c.type, 'rarity', c.rarity, 'art', c.art,
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
// The price is checked before tax and in the currency we asked for: Stripe adds VAT on top
// (Managed Payments / Stripe Tax) and may charge in the buyer's currency (Adaptive Pricing).
function chargedPrice(session) {
    const cc = session.currency_conversion;
    return cc ? { amount: cc.amount_subtotal, currency: cc.source_currency } : { amount: session.amount_subtotal, currency: session.currency };
}

async function grantPurchase(db, session) {
    const id = Number(session.metadata?.purchase_id || session.client_reference_id);
    if (!id || session.payment_status !== 'paid') return null;
    const price = chargedPrice(session);
    return inTransaction(db, async (client) => {
        const { rows: [p] } = await client.query(
            `UPDATE purchases SET status = 'paid', paid_at = now(), stripe_payment = $3, livemode = $4
             WHERE id = $1 AND stripe_session = $2 AND status <> 'paid' AND amount_cents = $5 AND currency = $6 RETURNING *`,
            [id, session.id, session.payment_intent, !!session.livemode, price.amount, String(price.currency || '').toLowerCase()]
        );
        if (!p) {
            const { rows: [had] } = await client.query(`SELECT status, amount_cents, currency FROM purchases WHERE id = $1`, [id]);
            if (had?.status !== 'paid') {
                console.error('grantPurchase refused', JSON.stringify({ id, session: session.id, had, price,
                    total: session.amount_total, subtotal: session.amount_subtotal, currency: session.currency }));
            }
            return null;
        }
        if (p.user_id) await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1`, [p.user_id, p.coins, p.nuggets]);
        return p;
    });
}

// Scheduled safety net: credit paid purchases even if the webhook was missed and the
// player never came back to the shop.
async function refreshPendingPurchases(db) {
    const { rows } = await db.query(
        `SELECT * FROM purchases WHERE status = 'pending' AND stripe_session IS NOT NULL
         AND created_at BETWEEN now() - interval '2 days' AND now() - interval '1 minute' ORDER BY id DESC LIMIT 20`);
    for (const p of rows) await refreshPurchase(db, p).catch((err) => console.error('refresh', p.id, err.message));
}

// A purchase left pending (closed tab, missed webhook): ask Stripe again.
async function refreshPurchase(db, p) {
    const session = await getCheckout(p.stripe_session);
    if (session.payment_status === 'paid') return grantPurchase(db, session);
    if (session.status === 'expired') await db.query(`UPDATE purchases SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [p.id]);
    return null;
}

const shapePurchase = (p) => ({
    id: p.id, pack: p.pack, label: PACKS[p.pack]?.label || (p.pack === 'pass' ? `${PASS.label} (1 mois)` : p.pack), amount: p.amount_cents, donation: p.donation_cents,
    association: p.association, coins: p.coins, nuggets: p.nuggets, status: p.status, createdAt: p.created_at, paidAt: p.paid_at,
});

// Pass Naturaliste: Stripe is the source of truth. Copy the paid period end onto the player and
// store each paid invoice once as a `pass` purchase (donation counter, Mécène trophy).
async function syncPass(db, sub) {
    const userId = Number(sub.metadata?.user_id);
    if (!userId) return null;
    const end = periodEnd(sub);
    const live = ['active', 'trialing'].includes(sub.status); // past_due: wait for the payment
    await db.query(
        `UPDATE users SET pass_sub = $2, pass_association = COALESCE($3, pass_association), pass_cancel = $4,
                          pass_until = CASE WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz ELSE pass_until END
         WHERE id = $1`,
        [userId, sub.status === 'canceled' ? null : sub.id, sub.metadata?.association || null, !!sub.cancel_at_period_end,
            live && end ? new Date(end * 1000).toISOString() : null]);
    const inv = sub.latest_invoice;
    if (inv && typeof inv === 'object' && inv.status === 'paid' && inv.amount_paid > 0) {
        const association = ASSOCIATIONS[sub.metadata?.association] ? sub.metadata.association : 'lpo';
        await db.query(
            `INSERT INTO purchases (user_id, username, pack, amount_cents, currency, donation_cents, association, stripe_session, stripe_payment, livemode, status, paid_at)
             SELECT id, username, 'pass', $2, $3, $4, $5, $6, $6, $7, 'paid', now() FROM users WHERE id = $1
             ON CONFLICT (stripe_session) DO NOTHING`,
            [userId, inv.subtotal, String(inv.currency || 'eur'), donationOf(PASS.price), association, inv.id, !!inv.livemode]);
    }
    return userId;
}

const refreshPass = async (db, subId) => syncPass(db, await getSubscription(subId));

// Safety net without webhooks: renew (or let lapse) passes whose period just ended.
async function refreshDuePasses(db) {
    const { rows } = await db.query(`SELECT pass_sub FROM users WHERE pass_sub IS NOT NULL AND pass_until < now() + interval '1 hour' LIMIT 20`);
    for (const r of rows) await refreshPass(db, r.pass_sub).catch((err) => console.error('pass refresh', r.pass_sub, err.message));
}

async function stripeWebhook(event) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    const payload = verifyWebhook(raw, event.headers?.['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (!payload) return json({ error: 'Signature invalide' }, 400);
    const session = payload.data?.object;
    if (payload.type === 'checkout.session.completed' && session.mode === 'subscription') {
        if (session.subscription) await refreshPass(getPool(), session.subscription);
    } else if (payload.type === 'invoice.paid' || payload.type.startsWith('customer.subscription.')) {
        const subId = payload.type === 'invoice.paid' ? invoiceSubscription(session) : session.id;
        if (subId) await refreshPass(getPool(), typeof subId === 'string' ? subId : subId.id);
    } else if (payload.type === 'checkout.session.completed' || payload.type === 'checkout.session.async_payment_succeeded') {
        await grantPurchase(getPool(), session);
    } else if (payload.type === 'checkout.session.expired') {
        await getPool().query(`UPDATE purchases SET status = 'expired' WHERE stripe_session = $1 AND status = 'pending'`, [session.id]);
    }
    return json({ received: true });
}

const MAX_BINDERS = 50;

function binderName(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) throw new HttpError(400, 'Donne un nom au classeur');
    return name;
}

// Only cards the player owns go in their own binders.
async function addToBinder(db, userId, binderId, cardId) {
    const { rowCount } = await db.query(
        `INSERT INTO binder_cards (binder_id, card_id)
         SELECT b.id, uc.card_id FROM binders b JOIN user_cards uc ON uc.user_id = b.user_id AND uc.card_id = $3
         WHERE b.id = $2 AND b.user_id = $1
         ON CONFLICT DO NOTHING`,
        [userId, binderId, cardId]
    );
    if (!rowCount) {
        const { rows } = await db.query(`SELECT 1 FROM binder_cards bc JOIN binders b ON b.id = bc.binder_id WHERE b.id = $1 AND b.user_id = $2 AND bc.card_id = $3`, [binderId, userId, cardId]);
        if (!rows.length) throw new HttpError(404, 'Classeur ou carte introuvable');
    }
}

// Showcase ("vitrine"): up to 10 owned cards arranged on a background, shown on the profile
// and exported as an image by the browser.
const SHOWCASE_MAX = 10;
// Premium backgrounds, unlocked for good with pépites (price each).
const SHOWCASE_PREMIUM = {
    aurore: 250, volcan: 400, galaxie: 600,
    recif: 300, sousbois: 350, cerisiers: 450, savane: 500, abysses: 700, arcenciel: 900,
};
const SHOWCASE_BACKGROUNDS = ['foret', 'ocean', 'nuit', 'herbier', 'or', 'aube', 'jungle', 'givre', ...Object.keys(SHOWCASE_PREMIUM)];

async function ownedBackgrounds(db, userId) {
    const { rows } = await db.query(`SELECT background FROM showcase_backgrounds WHERE user_id = $1`, [userId]);
    return rows.map((r) => r.background);
}
const SHOWCASE_LAYOUTS = ['grille', 'eventail', 'vedette'];
const SHOWCASE_FORMATS = ['story', 'carre'];

// The saved showcase of a player, in its card order; cards traded away since are left out.
async function loadShowcase(db, userId) {
    const { rows: [s] } = await db.query(`SELECT title, background, layout, format, card_ids, updated_at FROM showcases WHERE user_id = $1`, [userId]);
    if (!s) return null;
    const { rows } = await db.query(
        `SELECT ${LIGHT_FIELDS} FROM cards c JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1
         WHERE c.id = ANY($2::int[]) ORDER BY array_position($2::int[], c.id)`,
        [userId, s.card_ids]
    );
    if (!rows.length) return null;
    const { card_ids, updated_at, ...rest } = s;
    return { ...rest, updatedAt: updated_at, cards: rows };
}

// Public gallery: votes needed to vote (no throwaway accounts) and a daily cap per voter.
const VOTE_MIN_HOURS = 24;
const VOTE_MIN_OPENINGS = 3;
const VOTES_PER_DAY = 30;
const GALLERY_PAGE = 24;

async function showcaseVotes(db, ownerId, meId) {
    const { rows: [v] } = await db.query(
        `SELECT COUNT(*)::int AS votes, COALESCE(bool_or(voter_id = $2), false) AS voted FROM showcase_votes WHERE owner_id = $1`,
        [ownerId, meId]);
    return v;
}

// Weekly contest: the 3 showcases with the most ♥ received during the Paris week (Monday 00:00 →
// next Monday) win pépites, handed out once the week is over and claimed from a pop-up.
const SHOWCASE_PRIZES = [300, 200, 100];
const PARIS_WEEK = `date_trunc('week', now() AT TIME ZONE 'Europe/Paris')`; // local timestamp of this Monday 00:00
const parisWeekStart = (week) => `(${week}::timestamp AT TIME ZONE 'Europe/Paris')`;

// Runs every minute from the schedule; only the first run after Monday 00:00 does anything.
// `week` / `tests` let the test script settle an arbitrary week among zz_test_ accounts only.
async function showcaseWeekRollover(db, { week = null, tests = false } = {}) {
    return inTransaction(db, async (client) => {
        const { rows: [w] } = await client.query(
            `INSERT INTO showcase_weeks (week) VALUES (COALESCE($1::date, (${PARIS_WEEK} - interval '7 days')::date))
             ON CONFLICT DO NOTHING RETURNING week::text AS week`, [week]);
        if (!w) return null;
        const { rows } = await client.query(
            `SELECT v.owner_id, COUNT(*)::int AS votes FROM showcase_votes v
             JOIN users u ON u.id = v.owner_id JOIN showcases s ON s.user_id = v.owner_id
             WHERE v.created_at >= ${parisWeekStart('$1::date')} AND v.created_at < ${parisWeekStart('($1::date + 7)')}
               AND (u.username LIKE 'zz\\_test\\_%') = $2
             GROUP BY v.owner_id ORDER BY votes DESC, MAX(v.created_at), v.owner_id LIMIT $3`,
            [w.week, tests, SHOWCASE_PRIZES.length]);
        for (const [i, r] of rows.entries()) {
            await client.query(
                `INSERT INTO showcase_awards (week, user_id, rank, votes, nuggets) VALUES ($1, $2, $3, $4, $5)`,
                [w.week, r.owner_id, i + 1, r.votes, SHOWCASE_PRIZES[i]]);
        }
        // The contest is over: every ♥ starts again from zero for the new week (and anyone can vote again).
        await client.query(
            `DELETE FROM showcase_votes v USING users u
             WHERE u.id = v.owner_id AND v.created_at < ${parisWeekStart('($1::date + 7)')}
               AND (u.username LIKE 'zz\\_test\\_%') = $2`, [w.week, tests]);
        return { week: w.week, winners: rows.length };
    });
}

// "Vitrine de la semaine": last contest's winner with their current showcase (public, home page).
// Falls back to the next on the podium when the winner has since taken theirs down.
async function showcaseOfWeek(db) {
    const { rows } = await db.query(
        `SELECT a.user_id, a.rank, a.votes, a.week::text AS week, u.username, ${SEASON_BADGE('u.id')}
         FROM showcase_awards a JOIN users u ON u.id = a.user_id
         WHERE a.week = (SELECT MAX(week) FROM showcase_weeks WHERE week < (${PARIS_WEEK})::date)
           AND u.username NOT LIKE 'zz\\_test\\_%'
         ORDER BY a.rank`);
    for (const { user_id, ...w } of rows) {
        const showcase = await loadShowcase(db, user_id);
        if (showcase) return withBadge({ ...w, showcase });
    }
    return null;
}

// Weekly quiz contest: the 3 players with the most quiz points (every mode) over the Paris week.
const QUIZ_PRIZES = [300, 200, 100];
const QUIZ_WEEK_POINTS = `SELECT user_id, SUM(points)::int AS points, SUM(score)::int AS correct FROM quizzes
    WHERE status = 'done' AND day >= $1::date AND day < $1::date + 7 GROUP BY 1`;

async function quizWeekRollover(db, { week = null, tests = false } = {}) {
    return inTransaction(db, async (client) => {
        const { rows: [w] } = await client.query(
            `INSERT INTO quiz_weeks (week) VALUES (COALESCE($1::date, (${PARIS_WEEK} - interval '7 days')::date))
             ON CONFLICT DO NOTHING RETURNING week::text AS week`, [week]);
        if (!w) return null;
        const { rows } = await client.query(
            `WITH s AS (${QUIZ_WEEK_POINTS})
             SELECT s.user_id, s.points FROM s JOIN users u ON u.id = s.user_id
             WHERE s.points > 0 AND (u.username LIKE 'zz\\_test\\_%') = $2
             ORDER BY s.points DESC, s.correct DESC, s.user_id LIMIT $3`,
            [w.week, tests, QUIZ_PRIZES.length]);
        for (const [i, r] of rows.entries()) {
            await client.query(
                `INSERT INTO quiz_awards (week, user_id, rank, points, nuggets) VALUES ($1, $2, $3, $4, $5)`,
                [w.week, r.user_id, i + 1, r.points, QUIZ_PRIZES[i]]);
        }
        return { week: w.week, winners: rows.length };
    });
}

// The running quiz week (end time, prizes, the caller's place) and last week's podium.
async function quizContest(db, userId) {
    const { rows: last } = await db.query(
        `SELECT a.rank, a.points, a.nuggets, u.username, a.week::text AS week FROM quiz_awards a JOIN users u ON u.id = a.user_id
         WHERE a.week = (SELECT MAX(week) FROM quiz_weeks WHERE week < (${PARIS_WEEK})::date)
           AND u.username NOT LIKE 'zz\\_test\\_%'
         ORDER BY a.rank`);
    const { rows: [e] } = await db.query(
        `SELECT ${parisWeekStart(`(${PARIS_WEEK} + interval '7 days')`)} AS "endsAt", (${PARIS_WEEK})::date::text AS week`);
    const { rows: [me] } = await db.query(
        `WITH s AS (${QUIZ_WEEK_POINTS}),
         r AS (SELECT s.user_id, s.points, RANK() OVER (ORDER BY s.points DESC, s.correct DESC)::int AS rank
               FROM s JOIN users u ON u.id = s.user_id
               WHERE s.points > 0 AND (u.username NOT LIKE 'zz\\_test\\_%' OR u.id = $2))
         SELECT rank, points FROM r WHERE user_id = $2`, [e.week, userId]);
    return { prizes: QUIZ_PRIZES, endsAt: e.endsAt, last, me: me || null };
}

// Prizes won and not yet collected (pop-up + Vitrines / Quiz badge), from both weekly contests.
async function unclaimedAwards(db, userId) {
    const { rows } = await db.query(
        `SELECT 'showcase' AS kind, week::text AS week, rank, votes, NULL::int AS points, nuggets FROM showcase_awards
         WHERE user_id = $1 AND claimed_at IS NULL
         UNION ALL
         SELECT 'quiz', week::text, rank, NULL, points, nuggets FROM quiz_awards
         WHERE user_id = $1 AND claimed_at IS NULL ORDER BY 2, 3`, [userId]);
    return rows;
}

// The running week (end time, prizes) and last week's podium, shown on the gallery.
async function showcaseContest(db) {
    const { rows } = await db.query(
        `SELECT a.rank, a.votes, a.nuggets, u.username, a.week::text AS week FROM showcase_awards a JOIN users u ON u.id = a.user_id
         WHERE a.week = (SELECT MAX(week) FROM showcase_weeks WHERE week < (${PARIS_WEEK})::date)
           AND u.username NOT LIKE 'zz\\_test\\_%'
         ORDER BY a.rank`);
    const { rows: [e] } = await db.query(`SELECT ${parisWeekStart(`(${PARIS_WEEK} + interval '7 days')`)} AS "endsAt"`);
    return { prizes: SHOWCASE_PRIZES, endsAt: e.endsAt, last: rows };
}

// previews: add the thumbnails of the binder's 3 rarest cards (public profile)
async function binderState(db, userId, previews = false) {
    const { rows: binders } = await db.query(
        // a card traded or sold away stays in the binder but is neither counted nor shown
        `SELECT b.id, b.name, COUNT(uc.card_id)::int AS count${previews ? `,
                (SELECT COALESCE(json_agg(t.thumb_url), '[]') FROM (
                    SELECT c.thumb_url FROM binder_cards bc2 JOIN cards c ON c.id = bc2.card_id
                    JOIN user_cards uc2 ON uc2.card_id = c.id AND uc2.user_id = b.user_id
                    WHERE bc2.binder_id = b.id ORDER BY ${RARITY_ORDER} DESC, c.num LIMIT 3) t) AS thumbs` : ''}
         FROM binders b
         LEFT JOIN binder_cards bc ON bc.binder_id = b.id
         LEFT JOIN user_cards uc ON uc.card_id = bc.card_id AND uc.user_id = b.user_id
         WHERE b.user_id = $1 GROUP BY b.id ORDER BY lower(b.name), b.id`,
        [userId]
    );
    const { rows } = await db.query(
        `SELECT bc.card_id, array_agg(bc.binder_id ORDER BY bc.binder_id) AS ids FROM binder_cards bc JOIN binders b ON b.id = bc.binder_id
         WHERE b.user_id = $1 GROUP BY bc.card_id`,
        [userId]
    );
    return { binders, cards: Object.fromEntries(rows.map((r) => [r.card_id, r.ids])) };
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
            `UPDATE users SET coins = coins + $2 + CASE WHEN pass_until > now() THEN $4 ELSE 0 END,
                              nuggets = nuggets + CASE WHEN pass_until > now() THEN $5 ELSE 0 END, last_daily = now()
             WHERE id = $1 AND (last_daily IS NULL OR last_daily < now() - make_interval(secs => $3))
             RETURNING *`,
            [user.id, DAILY_COINS, DAILY_COOLDOWN_MS / 1000, PASS.dailyCoins, PASS.dailyNuggets]
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
            // A double tap sends two requests: the second one waits on the lock above, then stops here.
            const { rows: [recent] } = await client.query(`SELECT 1 FROM openings WHERE user_id = $1 AND at > now() - interval '2 seconds' LIMIT 1`, [user.id]);
            if (recent) throw new HttpError(429, 'Booster déjà en cours d\'ouverture');
            const now = Date.now();
            const charge = chargeState(current, now);
            let update, params, paidWith;
            if (charge.charges > 0) {
                // A full gauge starts its 30-minute timer at this opening; otherwise keep the timer running.
                const since = charge.charges >= MAX_CHARGES ? now : charge.from + charge.ticks * charge.step;
                [update, params, paidWith] = [`charges = $2, charges_at = $3`, [charge.charges - 1, new Date(since)], 'charge'];
            } else if (current.boosters > 0) {
                [update, params, paidWith] = [`boosters = boosters - 1`, [], 'booster'];
            } else if (body.pay === 'plants' && current.plants >= BOOSTER_PLANTS) {
                [update, params, paidWith] = [`plants = plants - $2`, [BOOSTER_PLANTS], 'plants'];
            } else if (body.pay && body.pay !== 'plants' && current.coins >= BOOSTER_PRICE) {
                [update, params, paidWith] = [`coins = coins - $2`, [BOOSTER_PRICE], 'coins'];
            } else {
                throw new HttpError(402, body.pay === 'plants' ? 'Pas assez de plantes : récolte ton jardin'
                    : body.pay ? 'Pas assez de graines' : 'Plus de charge : attends la prochaine ou paie en graines');
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
            // a few words about each species under the revealed card (intros are fetched lazily)
            await Promise.all(cards.filter((c) => !c.extract && c.wiki_url).map(async (c) => {
                c.extract = await fillExtract(db, c).catch(() => null);
            }));
            for (const c of cards) c.fact = intro(c.extract, 320);
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
        // « Martin pêcheur » finds « Martin-pêcheur d'Europe », then the cards whose description (Wikipedia
        // extract, or the long text of the card page) mentions it. Accents, case and punctuation are ignored.
        const q = searchText(body.query);
        // binder: a binder id, 'all' = any of the player's binders, null = no binder filter
        const binder = body.binder === 'all' ? 0 : body.binder ? Number(body.binder) : null;
        // IUCN status, or 'NE' for the species never assessed
        const iucn = IUCN_CODES.includes(body.iucn) ? body.iucn : null;
        const search = cardSearchSql('$5');
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count, COUNT(*) OVER()::int AS matches
             FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1
             CROSS JOIN LATERAL (SELECT CASE WHEN $5 = '' THEN false ELSE ${search.byName} END AS by_name) n
             WHERE ($2::text IS NULL OR c.type = $2) AND ($3::text IS NULL OR c.rarity = $3)
               AND (NOT $4 OR uc.count IS NOT NULL)
               AND ($5 = '' OR (uc.count IS NOT NULL AND ${search.any}))
               AND ($8::int IS NULL OR EXISTS (SELECT 1 FROM binder_cards bc JOIN binders b ON b.id = bc.binder_id
                    WHERE bc.card_id = c.id AND b.user_id = $1 AND ($8 = 0 OR b.id = $8)))
               AND (NOT $9 OR uc.count > 1)
               AND ($10::text IS NULL OR c.iucn = $10 OR ($10 = 'NE' AND c.iucn IS NULL))
             ORDER BY uc.count IS NULL, n.by_name DESC, ${RARITY_ORDER} DESC, c.num
             LIMIT $6 OFFSET $7`,
            [user.id, body.type || null, body.rarity || null, Boolean(body.onlyOwned || q || binder != null), q, limit, offset, binder, Boolean(body.duplicates), iucn]
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

    // Favourites: { binders: [{ id, name, count }], cards: { cardId: [binderId…] } }
    async binders(db, body, event) {
        const user = await requireUser(db, event);
        return binderState(db, user.id);
    },

    async createBinder(db, body, event) {
        const user = await requireUser(db, event);
        const name = binderName(body.name);
        const { rows: [{ n }] } = await db.query(`SELECT COUNT(*)::int AS n FROM binders WHERE user_id = $1`, [user.id]);
        if (n >= MAX_BINDERS) throw new HttpError(400, `${MAX_BINDERS} classeurs maximum`);
        const { rows: [b] } = await db.query(`INSERT INTO binders (user_id, name) VALUES ($1, $2) RETURNING id`, [user.id, name]);
        if (body.cardId) await addToBinder(db, user.id, b.id, Number(body.cardId));
        return { ...(await binderState(db, user.id)), id: b.id };
    },

    async renameBinder(db, body, event) {
        const user = await requireUser(db, event);
        const { rowCount } = await db.query(`UPDATE binders SET name = $3 WHERE id = $1 AND user_id = $2`, [Number(body.id), user.id, binderName(body.name)]);
        if (!rowCount) throw new HttpError(404, 'Classeur introuvable');
        return binderState(db, user.id);
    },

    async deleteBinder(db, body, event) {
        const user = await requireUser(db, event);
        await db.query(`DELETE FROM binders WHERE id = $1 AND user_id = $2`, [Number(body.id), user.id]);
        return binderState(db, user.id);
    },

    async binderCard(db, body, event) {
        const user = await requireUser(db, event);
        const binderId = Number(body.binderId), cardId = Number(body.cardId);
        if (body.on) await addToBinder(db, user.id, binderId, cardId);
        else await db.query(
            `DELETE FROM binder_cards bc USING binders b WHERE bc.binder_id = b.id AND b.id = $1 AND b.user_id = $2 AND bc.card_id = $3`,
            [binderId, user.id, cardId]
        );
        return binderState(db, user.id);
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

    // Full sheet of a card put up for auction, even one the player has not discovered yet:
    // the sale already shows it, so nothing is spoiled.
    async auctionCard(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [card] } = await db.query(
            `SELECT ${CARD_FIELDS}, COALESCE(uc.count, 0) AS count FROM cards c
             LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $2
             WHERE c.id = $1 AND EXISTS (SELECT 1 FROM auctions a WHERE a.card_id = c.id)`,
            [Number(body.id), user.id]
        );
        if (!card) throw new HttpError(404, 'Carte introuvable');
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
        const period = board === 'quiz' && body.period === 'week' ? 'week'
            : board === 'donors' && body.period !== 'all' ? 'month' : 'all';
        const friends = body.scope === 'friends';
        const { rows } = await db.query(
            `WITH s AS (${BOARDS[board](period)}),
             r AS (
                SELECT u.username, s.score, s.extra, u.id = $1 AS me, ${SEASON_BADGE('u.id')},${board === 'donors' ? `
                       (SELECT mode() WITHIN GROUP (ORDER BY association) FROM purchases
                        WHERE user_id = u.id AND status = 'paid' AND livemode) AS assoc,` : ''}
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
        for (const r of rows) if (r.assoc) r.assoc = ASSOCIATIONS[r.assoc]?.name || r.assoc;
        let donor = null;
        if (board === 'donors') {
            const { rows: [d] } = await db.query(
                `SELECT u.hide_donations AS hidden, EXISTS (SELECT 1 FROM purchases WHERE user_id = u.id AND status = 'paid' AND livemode) AS donated
                 FROM users u WHERE id = $1`, [user.id]);
            donor = d;
        }
        return {
            donor, share: DONATION_SHARE,
            board, period, scope: friends ? 'friends' : 'all',
            players: rows[0]?.players || 0,
            top: rows.filter((r) => r.rank <= 50).slice(0, 50).map(({ players, ...r }) => withBadge(r)),
            me: me && (({ players, ...r }) => withBadge(r))(me),
        };
    },

    // Public profile of a player: collection, arena, season badge and history.
    async player(db, body, event) {
        const user = await requireUser(db, event);
        const { rows: [p] } = await db.query(
            `SELECT u.id, u.username, u.created_at, u.id = $1 AS me, COALESCE(u.pass_until > now(), false) AS patron, ${AVATAR_SQL('u')} AS avatar,
                    (SELECT COUNT(*)::int FROM user_cards WHERE user_id = u.id) AS discovered,
                    (SELECT COALESCE(SUM(count), 0)::int FROM user_cards WHERE user_id = u.id) AS owned,
                    (SELECT COUNT(*)::int FROM trophy_claims WHERE user_id = u.id) AS trophies,
                    (SELECT COUNT(*)::int FROM battles WHERE user_id = u.id AND status = 'won') AS "battleWins",
                    (SELECT COUNT(*)::int FROM observations WHERE user_id = u.id AND status = 'confirmed') AS observations,
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
        // Binders are shown to the player and their friends; others only learn how many there are.
        const shared = p.me || p.friendship === 'accepted';
        const { binders } = await binderState(db, p.id, shared);
        const { id, ...rest } = withBadge(p);
        return { player: {
            ...rest,
            seasons: seasons.map((r) => ({ ...r, label: seasonLabel(r.season) })),
            binders: shared ? binders.filter((b) => b.count) : null,
            binderCount: binders.filter((b) => b.count).length,
            showcase: await loadShowcase(db, p.id).then(async (s) => s && { ...s, ...(await showcaseVotes(db, p.id, user.id)) }),
        } };
    },

    // Gallery of everyone's showcases: latest, or ranked by votes (this Paris week / all time).
    async showcases(db, body, event) {
        const user = await requireUser(db, event);
        const sort = ['week', 'all'].includes(body.sort) ? body.sort : 'recent';
        const friends = body.scope === 'friends';
        const limit = Math.min(GALLERY_PAGE, Math.max(1, Number(body.limit) || GALLERY_PAGE));
        const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
        const order = { recent: 's.updated_at DESC', week: 'week DESC, total DESC, s.updated_at DESC', all: 'total DESC, week DESC, s.updated_at DESC' }[sort];
        const { rows } = await db.query(
            `WITH v AS (
                SELECT owner_id, COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE created_at >= ${parisWeekStart(PARIS_WEEK)})::int AS week,
                       bool_or(voter_id = $1) AS voted
                FROM showcase_votes GROUP BY owner_id
             )
             SELECT * FROM (
                SELECT u.username, u.id = $1 AS me, s.title, s.background, s.layout, s.format, s.updated_at AS "updatedAt",
                       COALESCE(v.total, 0) AS total, COALESCE(v.week, 0) AS week, COALESCE(v.voted, false) AS voted,
                       ${SEASON_BADGE('u.id')},
                       (SELECT json_agg(x) FROM (
                            SELECT ${LIGHT_FIELDS} FROM cards c JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = s.user_id
                            WHERE c.id = ANY(s.card_ids) ORDER BY array_position(s.card_ids, c.id)) x) AS cards
                FROM showcases s JOIN users u ON u.id = s.user_id LEFT JOIN v ON v.owner_id = s.user_id
                WHERE (u.username NOT LIKE 'zz\\_test\\_%' OR u.id = $1 OR $5)
                  AND (NOT $2 OR u.id = $1 OR EXISTS (
                        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
                          AND ((f.requester_id = $1 AND f.addressee_id = u.id) OR (f.addressee_id = $1 AND f.requester_id = u.id))))
                ORDER BY ${order}, u.id
             ) g WHERE cards IS NOT NULL
             LIMIT $3 OFFSET $4`,
            [user.id, friends, limit + 1, offset, user.username.startsWith('zz_test_')]
        );
        return {
            sort, scope: friends ? 'friends' : 'all',
            showcases: rows.slice(0, limit).map(({ total, week, ...r }) => withBadge({ ...r, votes: sort === 'week' ? week : total, totalVotes: total })),
            more: rows.length > limit,
            contest: offset === 0 ? await showcaseContest(db) : undefined,
        };
    },

    async claimShowcaseAward(db, body, event) {
        const user = await requireUser(db, event);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.week || ''))) throw new HttpError(400, 'Semaine invalide');
        return inTransaction(db, async (client) => {
            const { rows: [a] } = await client.query(
                `UPDATE ${body.kind === 'quiz' ? 'quiz_awards' : 'showcase_awards'} SET claimed_at = now()
                 WHERE user_id = $1 AND week = $2 AND claimed_at IS NULL RETURNING nuggets`,
                [user.id, body.week]);
            if (!a) throw new HttpError(409, 'Récompense déjà récupérée');
            const { rows: [u] } = await client.query(`UPDATE users SET nuggets = nuggets + $2 WHERE id = $1 RETURNING *`, [user.id, a.nuggets]);
            return { nuggets: a.nuggets, user: await publicUser(client, u) };
        });
    },

    async voteShowcase(db, body, event) {
        const user = await requireUser(db, event);
        const owner = await findUser(db, body.username);
        if (owner.id === user.id) throw new HttpError(400, 'Tu ne peux pas voter pour ta propre vitrine');
        const { rows: [s] } = await db.query(`SELECT 1 FROM showcases WHERE user_id = $1`, [owner.id]);
        if (!s) throw new HttpError(404, `${owner.username} n'a pas de vitrine`);
        const { rows: [me] } = await db.query(
            `SELECT created_at < now() - make_interval(hours => $2) AS old,
                    (SELECT COUNT(*)::int FROM openings WHERE user_id = u.id) AS opened,
                    (SELECT COUNT(*)::int FROM showcase_votes WHERE voter_id = u.id AND created_at >= ${PARIS_TODAY}) AS today
             FROM users u WHERE id = $1`, [user.id, VOTE_MIN_HOURS]);
        if (!me.old || me.opened < VOTE_MIN_OPENINGS) {
            throw new HttpError(403, `Pour voter, ton compte doit avoir plus de ${VOTE_MIN_HOURS} h et ${VOTE_MIN_OPENINGS} boosters ouverts`);
        }
        if (me.today >= VOTES_PER_DAY) throw new HttpError(429, `${VOTES_PER_DAY} votes par jour maximum, reviens demain`);
        await db.query(`INSERT INTO showcase_votes (voter_id, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, owner.id]);
        return showcaseVotes(db, owner.id, user.id);
    },

    async unvoteShowcase(db, body, event) {
        const user = await requireUser(db, event);
        const owner = await findUser(db, body.username);
        await db.query(`DELETE FROM showcase_votes WHERE voter_id = $1 AND owner_id = $2`, [user.id, owner.id]);
        return showcaseVotes(db, owner.id, user.id);
    },

    async setDonationPrivacy(db, body, event) {
        const user = await requireUser(db, event);
        await db.query(`UPDATE users SET hide_donations = $2 WHERE id = $1`, [user.id, !!body.hidden]);
        return { hidden: !!body.hidden };
    },

    async showcase(db, body, event) {
        const user = await requireUser(db, event);
        return { showcase: await loadShowcase(db, user.id), owned: await ownedBackgrounds(db, user.id), premium: SHOWCASE_PREMIUM };
    },

    async buyBackground(db, body, event) {
        const user = await requireUser(db, event);
        const price = SHOWCASE_PREMIUM[body.background];
        if (!price) throw new HttpError(400, 'Fond inconnu');
        const updated = await inTransaction(db, async (client) => {
            const { rows: [u] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const { rowCount } = await client.query(
                `INSERT INTO showcase_backgrounds (user_id, background) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [u.id, body.background]);
            if (!rowCount) throw new HttpError(409, 'Tu as déjà ce fond');
            if (u.nuggets < price) throw new HttpError(402, `Il te faut ${price} pépites`);
            const { rows: [after] } = await client.query(`UPDATE users SET nuggets = nuggets - $2 WHERE id = $1 RETURNING *`, [u.id, price]);
            return after;
        });
        return { owned: await ownedBackgrounds(db, user.id), user: await publicUser(db, updated) };
    },

    async saveShowcase(db, body, event) {
        const user = await requireUser(db, event);
        const ids = [...new Set((Array.isArray(body.cardIds) ? body.cardIds : []).map(Number).filter(Number.isInteger))];
        if (!ids.length) throw new HttpError(400, 'Choisis au moins une carte');
        if (ids.length > SHOWCASE_MAX) throw new HttpError(400, `${SHOWCASE_MAX} cartes maximum`);
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM user_cards WHERE user_id = $1 AND card_id = ANY($2::int[])`, [user.id, ids]);
        if (n !== ids.length) throw new HttpError(400, 'Tu ne peux exposer que tes propres cartes');
        const pick = (value, list) => (list.includes(value) ? value : list[0]);
        if (SHOWCASE_PREMIUM[body.background] && !(await ownedBackgrounds(db, user.id)).includes(body.background)) {
            throw new HttpError(403, 'Débloque ce fond pour l\'utiliser');
        }
        // Other cards = a new showcase, so it starts again at 0 ♥ (title, background or order changes keep them).
        const { rows: [prev] } = await db.query(`SELECT card_ids FROM showcases WHERE user_id = $1`, [user.id]);
        const same = prev && prev.card_ids.length === ids.length && ids.every((id) => prev.card_ids.includes(id));
        if (!same) await db.query(`DELETE FROM showcase_votes WHERE owner_id = $1`, [user.id]);
        await db.query(
            `INSERT INTO showcases (user_id, title, background, layout, format, card_ids, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (user_id) DO UPDATE SET title = $2, background = $3, layout = $4, format = $5, card_ids = $6, updated_at = now()`,
            [user.id, String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 40),
                pick(body.background, SHOWCASE_BACKGROUNDS), pick(body.layout, SHOWCASE_LAYOUTS), pick(body.format, SHOWCASE_FORMATS), ids]
        );
        return { showcase: await loadShowcase(db, user.id), reset: Boolean(prev) && !same };
    },

    async deleteShowcase(db, body, event) {
        const user = await requireUser(db, event);
        await db.query(`DELETE FROM showcases WHERE user_id = $1`, [user.id]);
        await db.query(`DELETE FROM showcase_votes WHERE owner_id = $1`, [user.id]);
        return { showcase: null };
    },

    // One page of a friend's (or one's own) binder, with how many copies the viewer has of each card.
    async playerBinder(db, body, event) {
        const user = await requireUser(db, event);
        const other = await findUser(db, body.username);
        if (other.id !== user.id) await requireFriend(db, user.id, other.username);
        const { rows: [binder] } = await db.query(`SELECT id, name FROM binders WHERE id = $1 AND user_id = $2`, [Number(body.id), other.id]);
        if (!binder) throw new HttpError(404, 'Classeur introuvable');
        const limit = Math.min(Number(body.limit) || 60, 120);
        const offset = Math.max(Number(body.offset) || 0, 0);
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count, COALESCE(mine.count, 0) AS mine, COUNT(*) OVER()::int AS matches
             FROM binder_cards bc JOIN cards c ON c.id = bc.card_id
             JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $2
             LEFT JOIN user_cards mine ON mine.card_id = c.id AND mine.user_id = $3
             WHERE bc.binder_id = $1
             ORDER BY ${RARITY_ORDER} DESC, c.num
             LIMIT $4 OFFSET $5`,
            [binder.id, other.id, user.id, limit, offset]
        );
        return { binder, matches: rows[0]?.matches || 0, cards: rows.map(({ matches, ...c }) => c) };
    },

    // Public: the 3 latest blog articles, for the home page.
    // Public: the showcase that won last week's contest, shown on the home page.
    async showcaseOfWeek(db) {
        return { winner: await showcaseOfWeek(db) };
    },

    // Top donors of the current month, for the home page (visitors too).
    async topDonors(db) {
        const { rows } = await db.query(
            `SELECT u.username, s.score AS donated, s.extra AS purchases FROM (${BOARDS.donors('month')}) s JOIN users u ON u.id = s.user_id
             WHERE u.username NOT LIKE 'zz\\_test\\_%' ORDER BY s.score DESC, s.extra DESC, u.username LIMIT 5`);
        const { rows: [{ month }] } = await db.query(`SELECT to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM') AS month`);
        return { month, donors: rows };
    },

    async blogLatest(db) {
        return { posts: await latestPosts(db, 3) };
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
                await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3, invite_ready_seen = 0 WHERE id = $1`,
                    [u.id, rowCount * INVITE_REWARD.coins, rowCount * INVITE_REWARD.nuggets]);
            }
            return rowCount;
        });
        if (!paid) throw new HttpError(400, 'Aucune récompense à récupérer pour l\'instant');
        const { rows: [updated] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return { paid, coins: paid * INVITE_REWARD.coins, nuggets: paid * INVITE_REWARD.nuggets, user: await publicUser(db, updated), invites: await inviteState(db, updated) };
    },

    async adStatus(db, body, event) {
        const user = await requireUser(db, event);
        return { adsLeft: await adsLeft(db, user.id), adDaily: AD_DAILY };
    },

    async adStart(db, body, event) {
        const user = await requireUser(db, event);
        if (await adsLeft(db, user.id) <= 0) throw new HttpError(429, 'Plus de pub récompensée aujourd\'hui, reviens demain');
        await db.query(`DELETE FROM ad_views WHERE user_id = $1 AND claimed_at IS NULL AND started_at < now() - interval '1 hour'`, [user.id]);
        const token = crypto.randomUUID();
        await db.query(`INSERT INTO ad_views (user_id, token) VALUES ($1, $2)`, [user.id, token]);
        return { token };
    },

    async adClaim(db, body, event) {
        const user = await requireUser(db, event);
        return inTransaction(db, async (client) => {
            await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            if (await adsLeft(client, user.id) <= 0) throw new HttpError(429, 'Plus de pub récompensée aujourd\'hui, reviens demain');
            const { rowCount } = await client.query(
                `UPDATE ad_views SET claimed_at = now()
                 WHERE token = $2 AND user_id = $1 AND claimed_at IS NULL
                   AND started_at <= now() - make_interval(secs => $3) AND started_at > now() - interval '1 hour'`,
                [user.id, String(body.token || ''), AD_MIN_SECONDS]);
            if (!rowCount) throw new HttpError(409, 'Pub non terminée : pas de booster');
            const { rows: [updated] } = await client.query(`UPDATE users SET boosters = boosters + 1 WHERE id = $1 RETURNING *`, [user.id]);
            return { user: await publicUser(client, updated), adsLeft: await adsLeft(client, user.id) };
        });
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
        const q = searchText(body.query);
        const search = cardSearchSql('$4');
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
               AND ($4 = '' OR ${search.any})
             ORDER BY ${q ? `(${search.byName}) DESC, ` : ''}${order} LIMIT 60 OFFSET $5`,
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
        const [badges, gifts, awards] = await Promise.all([
            badgeCounts(db, user, pub),
            pub.social.newGifts ? unseenGifts(db, user.id) : [],
            unclaimedAwards(db, user.id),
        ]);
        const count = (kind) => awards.filter((a) => a.kind === kind).length;
        if (count('showcase')) badges['/vitrines'] = count('showcase');
        if (count('quiz')) badges['/quiz'] ||= count('quiz');
        const notices = await userNotices(db, user, badges['/inviter'] || 0);
        return { user: pub, badges, gifts, awards, notices };
    },

    // Closes the « Pendant ton absence » pop-up: those events (and the referral rewards ready now) are not shown again.
    async seenNotices(db, body, event) {
        const user = await requireUser(db, event);
        const ready = Math.max(0, Math.min(INVITE_CAP, Number(body.invitesReady) || 0));
        await db.query(`UPDATE users SET notices_seen_at = now(), invite_ready_seen = GREATEST(invite_ready_seen, $2) WHERE id = $1`, [user.id, ready]);
        return { ok: true };
    },

    // Closes the « Nouveautés » pop-up for good on this account.
    async seenNews(db, body, event) {
        const user = await requireUser(db, event);
        const id = String(body.id || '');
        if (!/^[\w.-]{1,40}$/.test(id)) throw new HttpError(400, 'Nouveauté invalide');
        await db.query(`UPDATE users SET news_seen = $2 WHERE id = $1`, [user.id, id]);
        return { ok: true };
    },

    // Closes the « cadeau reçu » pop-up: every gift up to `upTo` is marked as seen.
    async seenGifts(db, body, event) {
        const user = await requireUser(db, event);
        const upTo = Number(body.upTo);
        if (!Number.isInteger(upTo)) throw new HttpError(400, 'Cadeau invalide');
        await db.query(`UPDATE gifts SET seen_at = now() WHERE to_id = $1 AND id <= $2 AND seen_at IS NULL`, [user.id, upTo]);
        return { ok: true };
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
                SELECT id, body, gift, created_at, read_at, from_id = $1 AS mine FROM messages
                WHERE ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) AND id > $3
                ORDER BY id DESC LIMIT ${THREAD_LIMIT}) t ORDER BY id`,
            [user.id, other.id, after]
        );
        const { rowCount: read } = await db.query(
            `UPDATE messages SET read_at = now() WHERE from_id = $2 AND to_id = $1 AND read_at IS NULL`, [user.id, other.id]);
        const f = await relation(db, user.id, other.id);
        return { username: other.username, friend: f?.status === 'accepted' || isOwner(user) || isOwner(other), messages: rows, read };
    },

    async sendMessage(db, body, event) {
        const user = await requireUser(db, event);
        const text = String(body.body || '').replace(/\r\n/g, '\n').trim();
        if (!text) throw new HttpError(400, 'Message vide');
        if (text.length > MESSAGE_MAX) throw new HttpError(400, `Message trop long (${MESSAGE_MAX} caractères maximum)`);
        const target = await findUser(db, body.username);
        if (target.id === user.id) throw new HttpError(400, 'Tu ne peux pas t\'écrire à toi-même');
        const other = isOwner(user) || isOwner(target) ? target : await requireFriend(db, user.id, body.username);
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM messages WHERE from_id = $1 AND created_at > now() - interval '1 minute'`, [user.id]);
        if (n >= MESSAGES_PER_MINUTE) throw new HttpError(429, 'Doucement ! Attends un peu avant d\'envoyer d\'autres messages');
        const { rows: [message] } = await db.query(
            `INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at, read_at, true AS mine`,
            [user.id, other.id, text]
        );
        return { message };
    },

    // Feedback tab: a tagged private message straight into the author's inbox.
    async sendFeedback(db, body, event) {
        const user = await requireUser(db, event);
        const label = FEEDBACK_KINDS[body.kind];
        if (!label) throw new HttpError(400, 'Choisis le type de message');
        const text = String(body.body || '').replace(/\r\n/g, '\n').trim();
        if (text.length < 3) throw new HttpError(400, 'Écris quelques mots');
        const full = `${label}\n${text}`;
        if (full.length > MESSAGE_MAX) throw new HttpError(400, `Message trop long (${MESSAGE_MAX - label.length - 1} caractères maximum)`);
        if (isOwner(user)) throw new HttpError(400, 'Les avis arrivent dans ta propre messagerie : pas besoin de t\'en envoyer');
        const owner = await findUser(db, OWNER);
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM messages WHERE from_id = $1 AND to_id = $2 AND created_at > now() - interval '1 hour'`, [user.id, owner.id]);
        if (n >= FEEDBACK_PER_HOUR) throw new HttpError(429, 'Merci ! Tu as déjà envoyé plusieurs messages, réessaie dans un moment');
        await db.query(`INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3)`, [user.id, owner.id, full]);
        return { ok: true, owner: owner.username };
    },

    // ---- Gifts ----
    async giftInfo(db, body, event) {
        const user = await requireUser(db, event);
        const other = await requireFriend(db, user.id, body.username);
        const f = await relation(db, user.id, other.id);
        const readyAt = giftReadyAt(f);
        return {
            username: other.username,
            readyAt: readyAt > new Date() ? readyAt : null,
            allowance: await giftAllowance(db, user.id, other.id),
            user: await publicUser(db, user),
        };
    },

    // Gives graines, pépites or plantes to a friend and drops a note in your conversation.
    async giftCurrency(db, body, event) {
        const user = await requireUser(db, event);
        const currency = GIFT_CURRENCIES[body.currency];
        if (!currency) throw new HttpError(400, 'Monnaie inconnue');
        const amount = Number(body.amount);
        if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, 'Montant invalide');
        const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, GIFT_NOTE_MAX);
        const other = await requireFriend(db, user.id, body.username);
        if (other.id === user.id) throw new HttpError(400, 'Tu ne peux pas t\'offrir un cadeau');
        const f = await relation(db, user.id, other.id);
        const readyAt = giftReadyAt(f);
        if (readyAt > new Date()) {
            const hours = Math.ceil((readyAt - Date.now()) / 3600_000);
            throw new HttpError(403, `Vous êtes amis depuis peu : les cadeaux seront possibles dans ${hours} h`);
        }

        const client = await db.connect();
        let message;
        try {
            await client.query('BEGIN');
            // Lock both players in id order so two crossed gifts can't deadlock.
            const { rows: locked } = await client.query(
                `SELECT id, ${currency.column} AS balance FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [[user.id, other.id]]);
            const me = locked.find((r) => r.id === user.id);
            const allowance = (await giftAllowance(client, user.id, other.id))[body.currency];
            if (allowance.left < amount) {
                throw new HttpError(429, allowance.friendFull
                    ? `${other.username} a déjà reçu le maximum de ${currency.many} aujourd'hui`
                    : `Tu peux encore offrir ${allowance.left} ${allowance.left > 1 ? currency.many : currency.one} aujourd'hui (maximum ${currency.max} par jour)`);
            }
            if (me.balance < amount) throw new HttpError(402, `Pas assez de ${currency.many}`);
            await client.query(`UPDATE users SET ${currency.column} = ${currency.column} - $2 WHERE id = $1`, [user.id, amount]);
            await client.query(`UPDATE users SET ${currency.column} = ${currency.column} + $2 WHERE id = $1`, [other.id, amount]);
            await client.query(`INSERT INTO gifts (from_id, to_id, currency, amount, note) VALUES ($1, $2, $3, $4, $5)`, [user.id, other.id, body.currency, amount, note || null]);
            const text = `🎁 Cadeau : ${amount.toLocaleString('fr-FR')} ${amount > 1 ? currency.many : currency.one}${note ? `\n${note}` : ''}`;
            ({ rows: [message] } = await client.query(
                `INSERT INTO messages (from_id, to_id, body, gift) VALUES ($1, $2, $3, true) RETURNING id, body, gift, created_at, read_at, true AS mine`,
                [user.id, other.id, text]));
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
        const { rows: [fresh] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return {
            ok: true, amount, currency: body.currency, message,
            allowance: await giftAllowance(db, user.id, other.id),
            user: await publicUser(db, fresh),
        };
    },

    // ---- Trades ----
    // Cards to pick from when building a trade: mine, or a friend's (with how many I already have).
    async tradeCards(db, body, event) {
        const user = await requireUser(db, event);
        const owner = body.username ? await requireFriend(db, user.id, body.username) : user;
        const q = searchText(body.query);
        const search = cardSearchSql('$5');
        const { rows } = await db.query(
            `SELECT ${LIGHT_FIELDS}, uc.count, COALESCE(mine.count, 0) AS have, COUNT(*) OVER()::int AS matches
             FROM user_cards uc JOIN cards c ON c.id = uc.card_id
             LEFT JOIN user_cards mine ON mine.user_id = $2 AND mine.card_id = uc.card_id
             WHERE uc.user_id = $1 AND ($3::text IS NULL OR c.type = $3) AND ($4::text IS NULL OR c.rarity = $4)
               AND ($5 = '' OR ${search.any})
             ORDER BY ${q ? `(${search.byName}) DESC, ` : ''}${body.missing && owner.id !== user.id ? '(mine.count IS NULL) DESC, ' : ''}${RARITY_ORDER} DESC, c.views DESC
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
        return quizState(db, user);
    },

    async quizStart(db, body, event) {
        const user = await requireUser(db, event);
        const mode = MODES[body.mode] ? body.mode : 'classic';
        const M = MODES[mode];
        const theme = M.themes && THEMES[body.theme] ? body.theme : 'all';
        const id = await inTransaction(db, async (client) => {
            await client.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const { rows: [active] } = await client.query(`SELECT id FROM quizzes WHERE user_id = $1 AND status = 'active' LIMIT 1`, [user.id]);
            if (active) return active.id; // finish the running game first
            const day = await parisDay(client);
            const { rows: [{ played }] } = await client.query(
                `SELECT COUNT(*)::int AS played FROM quizzes WHERE user_id = $1 AND day = $2 AND mode = $3`, [user.id, day, mode]);
            const perDay = modePerDay(user, mode);
            if (played >= perDay) {
                if (mode === 'daily') throw new HttpError(429, 'Tu as déjà relevé le défi du jour. Un nouveau défi t\'attend demain !');
                const bonus = mode === 'classic' ? PASS.quizzes : M.passBonus;
                throw new HttpError(429, `Tu as joué tes ${perDay} parties ${mode === 'classic' ? 'de quiz' : M.label} du jour. Reviens demain ou essaie un autre mode !`
                    + (passActive(user) || !bonus ? '' : ` Avec le Pass Naturaliste, tu as ${bonus} partie${bonus > 1 ? 's' : ''} de plus chaque jour.`));
            }
            let questions, reserve = null;
            if (mode === 'daily') {
                ({ questions, reserve } = await dailyQuestions(db, day));
            } else {
                const { rows: seenRows } = await client.query(`SELECT card_id, at FROM quiz_seen WHERE user_id = $1`, [user.id]);
                const seen = new Map(seenRows.map((r) => [r.card_id, new Date(r.at).getTime()]));
                const levels = mode === 'classic' ? [...LEVELS, 2] : Array.from({ length: 10 }, (_, i) => levelAt(mode, i));
                questions = await buildQuiz(db, theme, seen, { levels, kinds: kindsFor(mode) });
                if (mode === 'classic' && questions.length > LEVELS.length) reserve = questions.pop();
            }
            if (questions.length < 5) throw new HttpError(503, 'Impossible de préparer un quiz pour ce thème, essaie un autre thème');
            const { rows: [q] } = await client.query(
                `INSERT INTO quizzes (user_id, day, theme, questions, mode, lives, jokers, reserve)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [user.id, day, theme, JSON.stringify(questions), mode, M.lives || null, JSON.stringify(M.jokers), reserve && JSON.stringify(reserve)]
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
    // The blitz clock starts with the first question.
    async quizNext(db, body, event) {
        const user = await requireUser(db, event);
        return inTransaction(db, async (client) => {
            let q = await lockQuiz(client, user.id, body.id);
            if (q.status === 'done') return { quiz: quizProgress(q), done: true };
            if (!q.questions[q.current]) {
                // An endless run went past its prepared questions (a skip at the very end): add more.
                const more = await moreQuestions(db, q);
                if (!more.length) throw new HttpError(503, 'Plus de questions disponibles, réessaie dans un instant');
                ({ rows: [q] } = await client.query(`UPDATE quizzes SET questions = questions || $2::jsonb WHERE id = $1 RETURNING *`, [q.id, JSON.stringify(more)]));
            }
            if (!q.asked_at) {
                ({ rows: [q] } = await client.query(
                    `UPDATE quizzes SET asked_at = now(),
                            ends_at = CASE WHEN mode = 'blitz' THEN COALESCE(ends_at, now() + make_interval(secs => $2)) END
                     WHERE id = $1 RETURNING *`, [q.id, MODES.blitz.seconds]));
            }
            return {
                quiz: quizProgress(q), question: publicQuestion(q.questions[q.current], q.current, q.asked_at, q.cur, q.ends_at),
                serverNow: new Date().toISOString(),
            };
        });
    },

    // The browser has loaded the photos and shows the question: its timer starts now (once, capped).
    async quizShown(db, body, event) {
        const user = await requireUser(db, event);
        return inTransaction(db, async (client) => {
            let q = await lockQuiz(client, user.id, body.id);
            if (q.status === 'done' || !q.asked_at || Number(body.index) !== q.current) throw new HttpError(409, 'Cette question a déjà reçu une réponse');
            if (!q.ends_at && q.cur?.loadMs === undefined) {
                const loadMs = Math.min(LOAD_MAX_MS, Math.max(0, Date.now() - new Date(q.asked_at).getTime()));
                ({ rows: [q] } = await client.query(`UPDATE quizzes SET cur = $2 WHERE id = $1 RETURNING *`, [q.id, JSON.stringify({ ...q.cur, loadMs })]));
            }
            return { question: publicQuestion(q.questions[q.current], q.current, q.asked_at, q.cur, q.ends_at), serverNow: new Date().toISOString() };
        });
    },

    // Jokers, once per game each: 50/50 (half the points), +10 s, or skip the question.
    async quizJoker(db, body, event) {
        const user = await requireUser(db, event);
        return inTransaction(db, async (client) => {
            const q = await lockQuiz(client, user.id, body.id);
            const joker = String(body.joker);
            if (q.status === 'done') throw new HttpError(409, 'Ce quiz est déjà terminé');
            if (!q.asked_at || Number(body.index) !== q.current) throw new HttpError(409, 'Cette question a déjà reçu une réponse');
            if (!(q.jokers[joker] > 0)) throw new HttpError(409, 'Ce joker est déjà utilisé');
            const question = q.questions[q.current];
            if (isLate(question, q.asked_at, q.cur, q.ends_at)) throw new HttpError(409, 'Trop tard pour un joker');
            const jokers = { ...q.jokers, [joker]: q.jokers[joker] - 1 };
            let cur = { ...q.cur }, sets = '', extra = [];
            if (joker === 'fifty') {
                if (question.options.length < 4 || cur.removed?.length) throw new HttpError(409, 'Pas de 50/50 sur cette question');
                const wrong = question.options.map((_, i) => i).filter((i) => i !== question.answer);
                cur = { ...cur, fifty: true, removed: wrong.sort(() => crypto.randomInt(3) - 1).slice(0, 2) };
            } else if (joker === 'time') {
                if (q.mode === 'blitz') sets = `, ends_at = ends_at + make_interval(secs => ${BLITZ.timeJokerMs / 1000})`;
                else cur = { ...cur, extraMs: (cur.extraMs || 0) + TIME_JOKER_MS };
            } else if (joker === 'skip') {
                if (ENDLESS.includes(q.mode)) {
                    // Endless modes: the question is set aside, no life lost, the combo is kept.
                    const answers = [...q.answers, { skip: true, choice: -1, correct: null, ms: Date.now() - new Date(q.asked_at).getTime() }];
                    sets = `, answers = $4, current = current + 1, asked_at = NULL`;
                    extra = [JSON.stringify(answers)];
                } else {
                    if (!q.reserve) throw new HttpError(409, 'Plus de question de réserve');
                    // A new question of the same level takes the place of this one.
                    const questions = [...q.questions];
                    questions[q.current] = { ...q.reserve, level: question.level };
                    sets = `, questions = $4, reserve = NULL, asked_at = NULL`;
                    extra = [JSON.stringify(questions)];
                }
                cur = {};
            } else throw new HttpError(400, 'Joker inconnu');
            const { rows: [updated] } = await client.query(
                `UPDATE quizzes SET jokers = $2, cur = $3${sets} WHERE id = $1 RETURNING *`,
                [q.id, JSON.stringify(jokers), JSON.stringify(cur), ...extra]);
            return {
                quiz: quizProgress(updated), joker, removed: cur.removed || [],
                question: updated.asked_at ? publicQuestion(updated.questions[updated.current], updated.current, updated.asked_at, updated.cur, updated.ends_at) : null,
                serverNow: new Date().toISOString(),
            };
        });
    },

    async quizAnswer(db, body, event) {
        const user = await requireUser(db, event);
        let topUp = null;
        {
            // Endless modes: prepare the next questions before running out (outside the lock).
            const { rows: [peek] } = await db.query(
                `SELECT * FROM quizzes WHERE id = $1 AND user_id = $2 AND status = 'active' AND mode = ANY($3)`, [Number(body.id), user.id, ENDLESS]);
            if (peek && peek.current >= peek.questions.length - 3) topUp = await moreQuestions(db, peek);
        }
        const result = await inTransaction(db, async (client) => {
            const q = await lockQuiz(client, user.id, body.id);
            if (q.status === 'done') throw new HttpError(409, 'Ce quiz est déjà terminé');
            if (Number(body.index) !== q.current || !q.asked_at) throw new HttpError(409, 'Cette question a déjà reçu une réponse');
            const endless = ENDLESS.includes(q.mode);
            const question = q.questions[q.current];
            const cur = q.cur || {};
            const now = Date.now();
            const late = isLate(question, q.asked_at, cur, q.ends_at, now);
            const choice = Number.isInteger(body.choice) ? body.choice : -1;
            const correct = !late && choice === question.answer && !(cur.removed || []).includes(choice);
            const ms = Math.max(0, now - new Date(q.asked_at).getTime() - (cur.loadMs || 0));
            const combo = correct ? q.combo + 1 : 0;
            const score = q.score + (correct ? 1 : 0);
            let points = 0, gained = 0;
            if (correct) {
                const allowed = q.mode === 'blitz' ? 0 : question.seconds * 1000 + (cur.extraMs || 0);
                points = questionPoints(question.level, allowed ? 1 - ms / allowed : 0, combo, cur.fifty);
                if (endless) {
                    const R = RUN_REWARDS[q.mode];
                    gained = R.perCorrect + (score % R.every === 0 ? R.everyCoins : 0);
                } else gained = LEVEL_COINS[question.level];
            }
            let lives = q.lives;
            if (q.mode === 'survival' && !correct) lives -= 1;
            let endsAt = q.ends_at && new Date(q.ends_at).getTime();
            if (q.mode === 'blitz' && !late) endsAt += correct ? BLITZ.correctMs : -BLITZ.wrongMs;
            const answers = [...q.answers, { choice, correct, late, ms, points }];
            let questions = q.questions;
            if (topUp?.length && q.current >= questions.length - 3) questions = [...questions, ...topUp];
            const done = q.mode === 'survival' ? lives <= 0 || q.current + 1 >= questions.length
                : q.mode === 'blitz' ? late || endsAt <= now || q.current + 1 >= questions.length
                    : q.current + 1 >= questions.length;
            let coins = q.coins + gained;
            let nuggets = 0, rewardCard = null;
            const perfect = done && !endless && score === questions.length;
            if (done) {
                let cardWon;
                if (endless) {
                    const R = RUN_REWARDS[q.mode];
                    nuggets = R.nuggets.filter(([n]) => score >= n).reduce((t, [, v]) => t + v, 0);
                    cardWon = score >= R.card;
                } else {
                    if (perfect) { coins += PERFECT_COINS; nuggets = PERFECT_NUGGETS; }
                    cardWon = score >= CARD_SCORE;
                }
                if (cardWon) {
                    // A card of a species the player recognised, new to the collection if possible (Rare at most).
                    const known = questions.filter((_, i) => answers[i]?.correct).map((x) => x.about);
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
                        reward_card = $6, status = $7, finished_at = CASE WHEN $7 = 'done' THEN now() END,
                        points = points + $8, combo = $9, best_combo = GREATEST(best_combo, $9), lives = $10,
                        ends_at = $11, cur = '{}', questions = $12
                 WHERE id = $1 RETURNING *`,
                [q.id, JSON.stringify(answers), score, coins, nuggets, rewardCard, done ? 'done' : 'active',
                    points, combo, lives, endsAt ? new Date(endsAt).toISOString() : null, JSON.stringify(questions)]
            );
            if (q.questions.length < questions.length) {
                await client.query(
                    `INSERT INTO quiz_seen (user_id, card_id) SELECT $1, unnest($2::int[])
                     ON CONFLICT (user_id, card_id) DO UPDATE SET at = now()`,
                    [user.id, [...new Set(topUp.map((x) => x.about))]]);
            }
            return {
                correct, late, gained, points, combo, multiplier: multiplier(combo), lifeLost: q.mode === 'survival' && !correct,
                answer: question.answer, facts: question.facts || null,
                reveal: question.hideLabels ? question.options.map((o) => o.label) : null,
                about: question.about, done, quiz: quizProgress(updated), rewardCard, perfect,
            };
        });
        const { about, rewardCard, ...res } = result;
        res.learn = await learnCard(db, about, user.id);
        if (res.done) {
            const id = Number(body.id);
            const { rows: [q] } = await db.query(`SELECT mode, day, points, questions, answers FROM quizzes WHERE id = $1`, [id]);
            const ids = q.questions.slice(0, q.answers.length).map((x) => x.about);
            const [{ rows: cards }, { rows: [past] }, { rows: [rank] }] = await Promise.all([
                db.query(`SELECT id, name, sci_name, thumb_url, type FROM cards WHERE id = ANY($1::int[])`, [ids]),
                db.query(`SELECT COALESCE(SUM(points), 0)::int AS total,
                                 MAX(points) FILTER (WHERE mode = $3)::int AS record
                          FROM quizzes WHERE user_id = $1 AND status = 'done' AND id <> $2`, [user.id, id, q.mode]),
                q.mode === 'daily' ? db.query(
                    `SELECT COUNT(*) FILTER (WHERE points > $2)::int + 1 AS rank, COUNT(*)::int AS players
                     FROM quizzes WHERE mode = 'daily' AND day = $1 AND status = 'done'`, [q.day, q.points]) : { rows: [null] },
            ]);
            res.recap = ids.map((cid, i) => ({ card: cards.find((c) => c.id === cid), correct: q.answers[i]?.correct, skip: !!q.answers[i]?.skip, kind: q.questions[i].kind }));
            res.rewardCard = rewardCard ? await learnCard(db, rewardCard, user.id) : null;
            res.record = { previous: past.record, beaten: past.record == null || q.points > past.record };
            res.level = { before: quizLevel(past.total), after: quizLevel(past.total + q.points) };
            res.dailyRank = rank;
            res.user = await publicUser(db, await requireUser(db, event));
        }
        return res;
    },

    // Quiz leaderboards: today's daily challenge, best survival and blitz runs of the week, naturalist levels.
    async quizBoard(db, body, event) {
        const user = await requireUser(db, event);
        const boards = {
            daily: `SELECT user_id, points AS score, score AS extra FROM quizzes
                    WHERE mode = 'daily' AND status = 'done' AND day = (now() AT TIME ZONE 'Europe/Paris')::date`,
            survival: `SELECT user_id, MAX(points)::int AS score, MAX(score)::int AS extra FROM quizzes
                       WHERE mode = 'survival' AND status = 'done' AND day >= (now() AT TIME ZONE 'Europe/Paris')::date - 6 GROUP BY 1`,
            blitz: `SELECT user_id, MAX(points)::int AS score, MAX(score)::int AS extra FROM quizzes
                    WHERE mode = 'blitz' AND status = 'done' AND day >= (now() AT TIME ZONE 'Europe/Paris')::date - 6 GROUP BY 1`,
            level: `SELECT user_id, SUM(points)::int AS score, COUNT(*)::int AS extra FROM quizzes WHERE status = 'done' GROUP BY 1`,
            week: `SELECT user_id, SUM(points)::int AS score, SUM(score)::int AS extra FROM quizzes
                   WHERE status = 'done' AND day >= (${PARIS_WEEK})::date GROUP BY 1`,
        };
        const board = boards[body.board] ? body.board : 'daily';
        const { rows } = await db.query(
            `WITH s AS (${boards[board]}),
             r AS (
                SELECT u.username, ${AVATAR_SQL('u')} AS avatar, s.score, s.extra, u.id = $1 AS me,
                       RANK() OVER (ORDER BY s.score DESC, s.extra DESC)::int AS rank, COUNT(*) OVER ()::int AS players
                FROM s JOIN users u ON u.id = s.user_id
                WHERE s.score > 0 AND (u.username NOT LIKE 'zz\\_test\\_%' OR u.id = $1)
             )
             SELECT * FROM r WHERE rank <= 20 OR me ORDER BY rank, username`, [user.id]);
        const strip = ({ players, ...r }) => (board === 'level' ? { ...r, level: quizLevel(r.score) } : r);
        return {
            board, players: rows[0]?.players || 0,
            top: rows.filter((r) => r.rank <= 20).map(strip), me: (rows.find((r) => r.me) && strip(rows.find((r) => r.me))) || null,
        };
    },

    async shop(db, body, event) {
        const user = await requireUser(db, event);
        if (stripeReady()) {
            const { rows: pending } = await db.query(
                `SELECT * FROM purchases WHERE user_id = $1 AND status = 'pending' AND stripe_session IS NOT NULL
                 AND created_at > now() - interval '2 days' ORDER BY id DESC LIMIT 3`, [user.id]);
            await Promise.all(pending.map((p) => refreshPurchase(db, p).catch((err) => console.error('refresh', p.id, err.message))));
            if (user.pass_sub) await refreshPass(db, user.pass_sub).catch((err) => console.error('pass refresh', err.message));
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
            pass: { ...PASS, donation: donationOf(PASS.price), dailyBase: DAILY_COINS, quizBase: QUIZ_PER_DAY, catchBase: 10,
                quizModes: Object.entries(MODES).map(([key, m]) => key === 'classic' ? { label: m.label, base: QUIZ_PER_DAY, bonus: PASS.quizzes } : { label: m.label, base: m.perDay, bonus: m.passBonus || 0 }).filter((m) => m.bonus > 0),
                quizPrizes: QUIZ_PRIZES, chargeBase: CHARGE_MS / 60000 },
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

    async passCheckout(db, body, event) {
        const user = await requireUser(db, event);
        if (!stripeReady()) throw new HttpError(503, 'Le paiement n\'est pas encore activé');
        if (!ASSOCIATIONS[body.association]) throw new HttpError(400, 'Choisis une association');
        if (body.consent !== true) throw new HttpError(400, 'Confirme l\'activation immédiate du Pass');
        if (passActive(user) && user.pass_sub) throw new HttpError(409, 'Ton Pass Naturaliste est déjà actif');
        const origin = SITE_ORIGINS.includes(event.headers?.origin) ? event.headers.origin : SITE_ORIGINS[0];
        try {
            const session = await createPassCheckout({ userId: user.id, association: body.association, username: user.username, origin });
            return { url: session.url };
        } catch {
            throw new HttpError(502, 'Le service de paiement ne répond pas, réessaie plus tard');
        }
    },

    // Back from Stripe Checkout: the session must belong to this player.
    async passConfirm(db, body, event) {
        const user = await requireUser(db, event);
        if (!stripeReady()) throw new HttpError(503, 'Le paiement n\'est pas encore activé');
        const session = await getCheckout(String(body.session || '')).catch(() => null);
        if (!session || session.mode !== 'subscription' || Number(session.metadata?.user_id) !== user.id) throw new HttpError(404, 'Abonnement introuvable');
        if (session.status === 'complete' && session.subscription) await refreshPass(db, session.subscription);
        const fresh = await requireUser(db, event);
        return { active: passActive(fresh), user: await publicUser(db, fresh) };
    },

    // Cancel = stop renewing; perks stay until the end of the paid month. `resume` undoes it.
    async passCancel(db, body, event) {
        const user = await requireUser(db, event);
        if (!user.pass_sub) throw new HttpError(404, 'Aucun abonnement en cours');
        const sub = await setCancelAtPeriodEnd(user.pass_sub, body.resume !== true).catch(() => null);
        if (!sub) throw new HttpError(502, 'Le service de paiement ne répond pas, réessaie plus tard');
        await refreshPass(db, sub.id);
        return { user: await publicUser(db, await requireUser(db, event)) };
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
Object.assign(actions, duelActions({ requireUser, inTransaction, HttpError, publicUser, parisDay }));
Object.assign(actions, fieldActions({ requireUser, inTransaction, HttpError, publicUser }));
Object.assign(actions, exploreActions({ requireUser, inTransaction, HttpError, publicUser }));
Object.assign(actions, gardenActions({ requireUser, publicUser, HttpError }));
Object.assign(actions, avatarActions({ requireUser, inTransaction, HttpError, publicUser }));

const PUBLIC_ACTIONS = new Set(['catalog', 'register', 'login', 'logout', 'inviteInfo', 'blogLatest', 'showcaseOfWeek', 'topDonors']);

export const handler = async (event) => {
    if (event.source === 'schedule') {
        await settleAuctions(getPool());
        await seasonRollover(getPool(), inTransaction);
        if (stripeReady() && new Date().getUTCMinutes() % 5 === 0) {
            await refreshPendingPurchases(getPool());
            await refreshDuePasses(getPool()).catch((err) => console.error('refreshDuePasses', err));
        }
        await showcaseWeekRollover(getPool()).catch((err) => console.error('showcaseWeekRollover', err));
        await quizWeekRollover(getPool()).catch((err) => console.error('quizWeekRollover', err));
        await Promise.all([
            blogTick(getPool()).catch((err) => console.error('blogTick', err)),
            speciesEnrichTick(getPool()).catch((err) => console.error('speciesEnrich', err)),
            massCheckTick(getPool()).catch((err) => console.error('massCheck', err)),
            biomeCheckTick(getPool()).catch((err) => console.error('biomeCheck', err)),
        ]);
        return { ok: true };
    }
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    const share = event.requestContext?.http?.method === 'GET' && /\/partage\/(\d+)\/?$/.exec(event.rawPath || '');
    if (event.requestContext?.http?.method === 'GET' && /^\/(api\/)?blog(\/|$)/.test(event.rawPath || '')) {
        try {
            return await blogRoute(getPool(), event.rawPath, event.queryStringParameters || {});
        } catch (error) {
            console.error('blog', error);
            return { statusCode: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' }, body: 'Blog momentanément indisponible' };
        }
    }
    if (event.requestContext?.http?.method === 'GET' && /^\/(api\/)?(especes(\/|$)|sitemap(-pages)?\.xml$)/.test(event.rawPath || '')) {
        try {
            return await speciesRoute(getPool(), event.rawPath, event.queryStringParameters || {});
        } catch (error) {
            console.error('species', error);
            return { statusCode: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' }, body: 'Page momentanément indisponible' };
        }
    }
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
