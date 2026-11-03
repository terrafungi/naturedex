/**
 * « Jardin » : a small farming game wrapped around the booster economy.
 * - Graines planted in plots grow into « plantes »; BOOSTER_PLANTS of them open a booster. Plant output
 *   is bounded by the graines spent (every seed pays 5-8.5 graines a plant), never by the time played,
 *   so everything that only saves time (watering, rain, potions) is safe for the economy.
 * - Each harvest also fills the grange with produce, compost and (flowers) honey, and gives garden XP.
 * - Villagers post orders for produce: XP, honey and a small graines rebate (capped a Paris day).
 * - Pests show up on long crops: chase them (XP, compost) or they eat 20 % of the harvest.
 * - Compost makes engrais (+25 % plants on one plot); honey buys growth potions and decorations
 *   (beauty → a few % more golden harvests); arcade mini-games and daily quests give honey and XP,
 *   all under daily caps. Garden levels unlock seeds and tools and pay a one-time graines reward.
 */
import crypto from 'node:crypto';

export const BOOSTER_PLANTS = 10;
// Two pépites make one graine: pépites come easily (recycling, auctions, rewards),
// so they help the garden without replacing graines.
export const NUGGETS_PER_SEED = 2;
// First Grainerie conversion of the Paris day: +50 % graines, on up to 200 pépites (+50 max).
// Automatic conversions while planting never use it, so it is never wasted on a few pépites.
export const CONVERT_BONUS = 0.5;
export const CONVERT_BONUS_MAX = 50;
const parisDate = (d) => new Date(d).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
export const convertBonusReady = (user) => !user.convert_bonus_at || parisDate(user.convert_bonus_at) !== parisDate(Date.now());

// The longer a seed grows the better it pays (~76 graines a booster for the radish, ~48 for the lotus,
// golden harvests included). `honey`: flowers feed the hive. `level`: garden level needed.
const SEEDS = {
    radis: { name: 'Radis éclair', cost: 25, minutes: 3, plants: 3, xp: 2, level: 1 },
    fraise: { name: 'Fraise des bois', cost: 40, minutes: 20, plants: 5, xp: 4, honey: 1, level: 3 },
    tournesol: { name: 'Tournesol', cost: 50, minutes: 60, plants: 7, xp: 5, honey: 1, level: 1 },
    lavande: { name: 'Lavande', cost: 80, minutes: 180, plants: 13, xp: 9, honey: 3, level: 6 },
    champignon: { name: 'Champignon lumineux', cost: 120, minutes: 360, plants: 21, xp: 13, level: 10 },
    chene: { name: 'Chêne', cost: 100, minutes: 480, plants: 16, xp: 11, level: 1 },
    bambou: { name: 'Bambou géant', cost: 150, minutes: 720, plants: 28, xp: 17, level: 14 },
    rose: { name: 'Rose de lune', cost: 200, minutes: 1440, plants: 40, xp: 24, honey: 4, level: 1 },
    lotus: { name: 'Lotus céleste', cost: 300, minutes: 2160, plants: 62, xp: 36, honey: 6, level: 20 },
};
const START_PLOTS = 3;
const PLOT_PRICES = [300, 600, 1000, 1500, 2500, 4000]; // graines for plots 4 to 9
const MAX_PLOTS = START_PLOTS + PLOT_PRICES.length;
const WATER_CUT = 0.3; // one watering per plant takes 30 % off the time left
const GOLDEN_CHANCE = 0.1; // harvest ×2
const TREASURE_CHANCE = 0.01; // + one bonus booster
const PEST_CHANCE = 0.35; // crops of 20 min and more
const PEST_CUT = 0.2;
const FERTILIZER_BONUS = 0.25;
const COMPOST_PER_FERTILIZER = 5;
const POTION_PRICE = 30; // honey: halves the time left
const MAX_LEVEL = 50;

const xpNext = (level) => Math.round(30 * level ** 1.35);
const levelReward = (level) => ({ coins: 10 + 4 * level, honey: 10 });
const UNLOCKS = {
    2: { key: 'atelier', text: "L'atelier : compost → engrais" },
    3: { key: 'fraise', text: 'Graine de fraise des bois' },
    4: { key: 'decor', text: 'Boutique de décorations' },
    5: { key: 'arrosoir', text: 'Arrosoir géant : arrose tout en un geste' },
    6: { key: 'lavande', text: 'Graine de lavande' },
    7: { key: 'potion', text: 'Potion de croissance' },
    8: { key: 'order4', text: 'Une 4e commande' },
    10: { key: 'champignon', text: 'Champignon lumineux' },
    14: { key: 'bambou', text: 'Bambou géant' },
    20: { key: 'lotus', text: 'Lotus céleste' },
};
const unlocked = (level, key) => Object.entries(UNLOCKS).some(([l, u]) => u.key === key && Number(l) <= level);
const TITLES = [[1, 'Pousse tendre'], [5, 'Main verte'], [10, "Cœur d'abeille"], [15, 'Esprit de la forêt'], [20, 'Souffle des saisons'], [30, 'Légende verte'], [40, 'Âme du jardin']];
const titleOf = (level) => TITLES.filter(([l]) => l <= level).at(-1)[1];

// Decorations: bought once with honey, each has its spot on the island. Beauty adds 0.1 % golden
// chance a point, up to +5 %.
const DECOR = {
    lanterne: { name: 'Lanternes', price: 40, beauty: 2 },
    champis: { name: 'Rond de champignons', price: 60, beauty: 3 },
    nichoir: { name: 'Nichoir', price: 90, beauty: 4 },
    banc: { name: 'Banc en bois', price: 120, beauty: 5 },
    epouvantail: { name: 'Épouvantail', price: 160, beauty: 6 },
    fontaine: { name: 'Fontaine', price: 260, beauty: 8 },
    arche: { name: 'Arche fleurie', price: 340, beauty: 10 },
    moulin: { name: 'Moulin à vent', price: 480, beauty: 12 },
    cerisier: { name: 'Cerisier en fleurs', price: 700, beauty: 15 },
};
const BEAUTY_STEP = 0.001;
const BEAUTY_MAX = 0.05;
const beautyOf = (decor) => decor.reduce((n, k) => n + (DECOR[k]?.beauty || 0), 0);
const goldenChance = (decor) => GOLDEN_CHANCE + Math.min(BEAUTY_MAX, beautyOf(decor) * BEAUTY_STEP);

// Orders: villagers ask for produce. The graines rebate is ~18 % of what the produce cost to grow.
const NPCS = ['herisson', 'chouette', 'renard', 'lapin', 'blaireau', 'ecureuil', 'grenouille', 'abeille'];
const ORDER_SLOTS = 3;
const ORDER_WAIT = 10 * 60_000; // a new villager comes after a delivery
const SKIP_WAIT = 20 * 60_000;
const ORDER_COINS_DAY = 150;

// Arcade mini-games: score sanity cap and rewards, all under the daily caps below.
const GAMES = {
    bee: { name: "Vol de l'abeille", max: 150, honey: (s) => Math.min(25, Math.floor(s / 5)), xp: (s) => Math.min(15, Math.floor(s / 8)) },
    pests: { name: 'Chasse aux nuisibles', max: 90, honey: (s) => Math.min(20, Math.floor(s / 4)), xp: (s) => Math.min(15, Math.floor(s / 5)), compost: (s) => Math.min(4, Math.floor(s / 20)) },
    memory: { name: 'Mémoire des graines', max: 100, honey: (s) => Math.min(20, Math.floor(s / 5)), xp: (s) => Math.min(15, Math.floor(s / 7)) },
};
const GAME_HONEY_DAY = 80;
const GAME_XP_DAY = 120;
const PEST_COMPOST_DAY = 30;
const GAME_GAP = 15_000; // between two rewarded games

// Daily quests: 4 a day (picked per player), then a chest.
const QUESTS = {
    harvest: { text: 'Récolte 6 parcelles', goal: 6 },
    plant: { text: 'Plante 6 graines', goal: 6 },
    water: { text: 'Arrose 4 plantes', goal: 4 },
    order: { text: 'Livre 2 commandes', goal: 2 },
    game: { text: 'Joue 2 mini-jeux', goal: 2 },
    pest: { text: 'Chasse 3 nuisibles', goal: 3 },
    fertilize: { text: 'Utilise 1 engrais', goal: 1, level: 2 },
};
const QUEST_REWARD = { honey: 8, xp: 15 };
const CHEST_REWARD = { coins: 20, honey: 15, fertilizer: 1 };

const hash = (s) => crypto.createHash('sha256').update(s).digest();
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function questsOf(userId, level, date) {
    const h = hash(`quests:${userId}:${date}`);
    return Object.keys(QUESTS).filter((k) => (QUESTS[k].level || 1) <= level)
        .map((k, i) => [k, h[i]]).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k]) => k);
}

// Rain: about one Paris hour in eight, the same for everyone; it waters every growing plant.
function weather(now = Date.now()) {
    const d = new Date(now);
    const hour = d.toLocaleString('fr-CA', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
    const rain = hash(`rain:${hour}`)[0] < 32;
    const until = new Date(Math.floor(now / 3600_000) * 3600_000 + 3600_000).toISOString();
    return { rain, until };
}

function newOrder(level) {
    const kinds = Object.keys(SEEDS).filter((k) => SEEDS[k].level <= level);
    const count = Math.min(kinds.length, 1 + (Math.random() < 0.55) + (level >= 5 && Math.random() < 0.35));
    const picked = [];
    while (picked.length < count) {
        // fast crops come up more often
        const pool = kinds.filter((k) => !picked.includes(k));
        const weights = pool.map((k) => 1 / Math.sqrt(SEEDS[k].minutes));
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        picked.push(pool.find((_, i) => (r -= weights[i]) <= 0) || pool.at(-1));
    }
    const items = Object.fromEntries(picked.map((k) => {
        const m = SEEDS[k].minutes;
        return [k, m <= 20 ? rand(1, 3) : m <= 180 ? rand(1, 2) : 1];
    }));
    const value = Object.entries(items).reduce((n, [k, q]) => n + q * SEEDS[k].cost, 0);
    return {
        id: crypto.randomBytes(4).toString('hex'),
        npc: NPCS[rand(0, NPCS.length - 1)],
        items,
        coins: Math.round(value * 0.18),
        xp: 6 + Math.round(value / 8),
        honey: 1 + Math.floor(value / 60),
    };
}

const orderSlots = (level) => ORDER_SLOTS + (unlocked(level, 'order4') ? 1 : 0);

// Fills empty order slots whose wait is over.
function refreshOrders(m) {
    const now = Date.now();
    m.orders = Array.from({ length: orderSlots(m.level) }, (_, i) => {
        const o = m.orders[i];
        if (o && (o.items || new Date(o.wait).getTime() > now)) return o;
        return newOrder(m.level);
    });
}

const META_DEFAULT = { xp: 0, level: 1, compost: 0, fertilizer: 0, honey: 0, barn: {}, orders: [], decor: [], daily: {}, best: {} };

function freshDay(m) {
    const today = parisDate(Date.now());
    if (m.daily?.date !== today) m.daily = { date: today };
    return m.daily;
}

export function gardenActions({ requireUser, publicUser, HttpError }) {
    // Converts just enough pépites to cover `cost` graines (inside a withGarden transaction).
    async function coverWithNuggets(client, user, cost) {
        const missing = cost - user.coins;
        if (missing <= 0) return 0;
        const nuggets = missing * NUGGETS_PER_SEED;
        if (nuggets > user.nuggets) throw new HttpError(402, 'Pas assez de graines ni de pépites');
        await client.query(`UPDATE users SET nuggets = nuggets - $2, coins = coins + $3 WHERE id = $1`, [user.id, nuggets, missing]);
        user.coins += missing;
        user.nuggets -= nuggets;
        return nuggets;
    }

    async function loadMeta(db, userId, lock) {
        if (lock) await db.query(`INSERT INTO garden_meta (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
        const { rows: [row] } = await db.query(`SELECT * FROM garden_meta WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [userId]);
        const m = { ...META_DEFAULT, ...row };
        freshDay(m);
        m.daily.quests ||= questsOf(userId, m.level, m.daily.date); // fixed for the day
        return m;
    }

    // Adds earned XP, levels up (one-time rewards) and writes the meta back.
    async function saveMeta(client, user, m) {
        const ups = [];
        while (m.level < MAX_LEVEL && m.xp >= xpNext(m.level)) {
            m.xp -= xpNext(m.level);
            m.level += 1;
            const reward = levelReward(m.level);
            m.honey += reward.honey;
            ups.push({ level: m.level, ...reward, unlock: UNLOCKS[m.level]?.text || null, title: TITLES.find(([l]) => l === m.level)?.[1] || null });
        }
        if (m.level >= MAX_LEVEL) m.xp = Math.min(m.xp, xpNext(MAX_LEVEL));
        const coins = ups.reduce((n, u) => n + u.coins, 0);
        if (coins) await client.query(`UPDATE users SET coins = coins + $2 WHERE id = $1`, [user.id, coins]);
        refreshOrders(m);
        await client.query(
            `UPDATE garden_meta SET xp = $2, level = $3, compost = $4, fertilizer = $5, honey = $6, barn = $7, orders = $8, decor = $9, daily = $10, best = $11
             WHERE user_id = $1`,
            [user.id, m.xp, m.level, m.compost, m.fertilizer, m.honey, JSON.stringify(m.barn), JSON.stringify(m.orders),
                JSON.stringify(m.decor), JSON.stringify(m.daily), JSON.stringify(m.best)]
        );
        return ups;
    }

    async function gardenState(db, user) {
        const [{ rows }, m] = await Promise.all([
            db.query(
                `SELECT slot, kind, planted_at AS "plantedAt", ready_at AS "readyAt", watered, fertilized,
                        CASE WHEN NOT pest_gone AND pest_at < ready_at THEN pest_at END AS "pestAt"
                 FROM garden_plots WHERE user_id = $1`,
                [user.id]
            ),
            loadMeta(db, user.id, false),
        ]);
        const bySlot = Object.fromEntries(rows.map((r) => [r.slot, r]));
        const d = m.daily;
        const quests = d.quests.map((k) => ({
            key: k, text: QUESTS[k].text, goal: QUESTS[k].goal,
            progress: Math.min(QUESTS[k].goal, d[k] || 0), claimed: (d.claimed || []).includes(k),
        }));
        return {
            plots: Array.from({ length: user.plots }, (_, slot) => bySlot[slot] || null),
            maxPlots: MAX_PLOTS,
            nextPlotPrice: PLOT_PRICES[user.plots - START_PLOTS] ?? null,
            seeds: SEEDS,
            waterCut: WATER_CUT,
            now: new Date().toISOString(),
            weather: weather(),
            level: m.level,
            xp: m.xp,
            xpNext: xpNext(m.level),
            title: titleOf(m.level),
            nextUnlock: Object.entries(UNLOCKS).map(([l, u]) => ({ level: Number(l), ...u })).find((u) => u.level > m.level) || null,
            unlocks: Object.values(UNLOCKS).filter((u) => unlocked(m.level, u.key)).map((u) => u.key),
            compost: m.compost,
            fertilizer: m.fertilizer,
            honey: m.honey,
            barn: m.barn,
            orders: m.orders,
            decor: m.decor,
            beauty: beautyOf(m.decor),
            goldenChance: goldenChance(m.decor),
            best: m.best,
            quests,
            chest: { ready: quests.every((q) => q.claimed), claimed: !!d.chest, reward: CHEST_REWARD },
            caps: {
                orderCoins: { used: d.orderCoins || 0, max: ORDER_COINS_DAY },
                gameHoney: { used: d.gameHoney || 0, max: GAME_HONEY_DAY },
                gameXp: { used: d.gameXp || 0, max: GAME_XP_DAY },
                pestCompost: { used: d.pestCompost || 0, max: PEST_COMPOST_DAY },
            },
            rules: {
                pestCut: PEST_CUT, fertilizerBonus: FERTILIZER_BONUS, compostPerFertilizer: COMPOST_PER_FERTILIZER,
                potionPrice: POTION_PRICE, questReward: QUEST_REWARD, beautyMax: BEAUTY_MAX, beautyStep: BEAUTY_STEP,
            },
            decorShop: DECOR,
            games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, max: g.max }])),
        };
    }

    // Runs `fn(client, lockedUser, meta)` in a transaction holding the player's row, saves the meta
    // (level-ups included), then returns the fresh garden and wallet with whatever `fn` returned.
    async function withGarden(db, event, fn) {
        const user = await requireUser(db, event);
        const client = await db.connect();
        let extra;
        try {
            await client.query('BEGIN');
            const { rows: [locked] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            const m = await loadMeta(client, locked.id, true);
            extra = await fn(client, locked, m);
            const levelUps = await saveMeta(client, locked, m);
            if (levelUps.length) extra = { ...extra, levelUps };
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
        const { rows: [fresh] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
        return { ...extra, garden: await gardenState(db, fresh), user: await publicUser(db, fresh) };
    }

    const plotOf = (body, user) => {
        const slot = Number(body.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= user.plots) throw new HttpError(400, 'Parcelle introuvable');
        return slot;
    };
    const need = (m, key, level) => {
        if (!unlocked(m.level, key)) throw new HttpError(403, `Débloqué au niveau ${level} du jardin`);
    };
    const count = (m, key, n = 1) => { m.daily[key] = (m.daily[key] || 0) + n; };

    return {
        // Loading the garden also lets the rain water it.
        async garden(db, body, event) {
            return withGarden(db, event, async (client, user) => {
                if (!weather().rain) return {};
                const { rowCount } = await client.query(
                    `UPDATE garden_plots SET watered = true, ready_at = now() + (ready_at - now()) * $2
                     WHERE user_id = $1 AND NOT watered AND ready_at > now()`,
                    [user.id, 1 - WATER_CUT]
                );
                return { rained: rowCount };
            });
        },

        // Pépites → graines, NUGGETS_PER_SEED pépites each (an odd pépite left over is kept).
        async convert(db, body, event) {
            const asked = Number(body.nuggets);
            if (!Number.isInteger(asked) || asked < NUGGETS_PER_SEED) throw new HttpError(400, 'Montant invalide');
            const nuggets = asked - (asked % NUGGETS_PER_SEED);
            return withGarden(db, event, async (client, user) => {
                if (nuggets > user.nuggets) throw new HttpError(402, 'Pas assez de pépites');
                const seeds = nuggets / NUGGETS_PER_SEED;
                const bonus = convertBonusReady(user) ? Math.min(CONVERT_BONUS_MAX, Math.floor(seeds * CONVERT_BONUS)) : 0;
                await client.query(
                    `UPDATE users SET nuggets = nuggets - $2, coins = coins + $3, convert_bonus_at = CASE WHEN $4 THEN now() ELSE convert_bonus_at END WHERE id = $1`,
                    [user.id, nuggets, seeds + bonus, bonus > 0]
                );
                return { converted: nuggets, seeds: seeds + bonus, bonus };
            });
        },

        // One plot (`slot`), or every empty plot the graines can pay for (« Replanter »).
        // With `convert`, missing graines are made from pépites on the fly.
        async plant(db, body, event) {
            const seed = SEEDS[body.kind];
            if (!seed) throw new HttpError(400, 'Graine inconnue');
            return withGarden(db, event, async (client, user, m) => {
                if (m.level < seed.level) throw new HttpError(403, `${seed.name} : débloquée au niveau ${seed.level} du jardin`);
                const budget = user.coins + (body.convert ? Math.floor(user.nuggets / NUGGETS_PER_SEED) : 0);
                const { rows } = await client.query(`SELECT slot FROM garden_plots WHERE user_id = $1`, [user.id]);
                const taken = new Set(rows.map((r) => r.slot));
                let slots;
                if (body.slot != null) {
                    const slot = plotOf(body, user);
                    if (taken.has(slot)) throw new HttpError(409, 'Cette parcelle est déjà plantée');
                    slots = [slot];
                } else {
                    slots = Array.from({ length: user.plots }, (_, i) => i).filter((i) => !taken.has(i))
                        .slice(0, Math.floor(budget / seed.cost));
                    if (!slots.length && taken.size >= user.plots) throw new HttpError(409, 'Toutes les parcelles sont plantées');
                }
                const cost = slots.length * seed.cost;
                if (!slots.length || budget < cost) throw new HttpError(402, body.convert ? 'Pas assez de graines ni de pépites' : 'Pas assez de graines');
                const converted = body.convert ? await coverWithNuggets(client, user, cost) : 0;
                await client.query(`UPDATE users SET coins = coins - $2 WHERE id = $1`, [user.id, cost]);
                // a pest may show up somewhere between 20 % and 80 % of the growth
                await client.query(
                    `INSERT INTO garden_plots (user_id, slot, kind, ready_at, pest_at)
                     SELECT $1, s, $3, now() + make_interval(mins => $4),
                            CASE WHEN random() < $5 THEN now() + make_interval(mins => $4) * (0.2 + random() * 0.6) END
                     FROM unnest($2::smallint[]) s`,
                    [user.id, slots, body.kind, seed.minutes, seed.minutes >= 20 ? PEST_CHANCE : 0]
                );
                m.xp += slots.length;
                count(m, 'plant', slots.length);
                return { planted: slots.length, converted };
            });
        },

        // One plot, or every growing plot with `all` (arrosoir géant).
        async water(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                if (body.all) need(m, 'arrosoir', 5);
                const { rowCount } = await client.query(
                    `UPDATE garden_plots SET watered = true, ready_at = now() + (ready_at - now()) * $3
                     WHERE user_id = $1 AND ($2::int IS NULL OR slot = $2) AND NOT watered AND ready_at > now()`,
                    [user.id, body.all ? null : plotOf(body, user), 1 - WATER_CUT]
                );
                if (!rowCount) throw new HttpError(409, 'Rien à arroser ici');
                m.xp += rowCount;
                count(m, 'water', rowCount);
                return { watered: rowCount };
            });
        },

        // Every ready plot (or just `slot`); each one may turn golden (×2) or hide a booster.
        async harvest(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                const { rows } = await client.query(
                    `DELETE FROM garden_plots WHERE user_id = $1 AND ready_at <= now() AND ($2::int IS NULL OR slot = $2)
                     RETURNING slot, kind, fertilized, (NOT pest_gone AND pest_at < ready_at) AS pest`,
                    [user.id, body.slot == null ? null : Number(body.slot)]
                );
                if (!rows.length) throw new HttpError(409, 'Rien n\'est encore prêt à récolter');
                const chance = goldenChance(m.decor);
                const harvest = rows.map(({ slot, kind, fertilized, pest }) => {
                    const seed = SEEDS[kind] || { plants: 1, xp: 1 };
                    const golden = Math.random() < chance;
                    let plants = seed.plants * (golden ? 2 : 1);
                    if (fertilized) plants = Math.ceil(plants * (1 + FERTILIZER_BONUS));
                    if (pest) plants = Math.max(1, Math.floor(plants * (1 - PEST_CUT)));
                    const produce = golden ? 2 : 1;
                    m.barn[kind] = (m.barn[kind] || 0) + produce;
                    m.xp += seed.xp;
                    m.compost += 1;
                    m.honey += seed.honey || 0;
                    return { slot, kind, plants, golden, fertilized, pest: !!pest, produce, honey: seed.honey || 0, xp: seed.xp, treasure: Math.random() < TREASURE_CHANCE };
                }).sort((a, b) => a.slot - b.slot);
                count(m, 'harvest', harvest.length);
                const plants = harvest.reduce((n, h) => n + h.plants, 0);
                const boosters = harvest.filter((h) => h.treasure).length;
                await client.query(`UPDATE users SET plants = plants + $2, boosters = boosters + $3 WHERE id = $1`, [user.id, plants, boosters]);
                return { harvest };
            });
        },

        async unlockPlot(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                const price = PLOT_PRICES[user.plots - START_PLOTS];
                if (price == null) throw new HttpError(409, `${MAX_PLOTS} parcelles maximum`);
                if (user.coins < price) throw new HttpError(402, 'Pas assez de graines');
                await client.query(`UPDATE users SET coins = coins - $2, plots = plots + 1 WHERE id = $1`, [user.id, price]);
                m.xp += 20;
            });
        },

        // Chase the pest off a plot before it eats the harvest.
        async shoo(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                const { rowCount } = await client.query(
                    `UPDATE garden_plots SET pest_gone = true
                     WHERE user_id = $1 AND slot = $2 AND NOT pest_gone AND pest_at <= now() AND pest_at < ready_at`,
                    [user.id, plotOf(body, user)]
                );
                if (!rowCount) throw new HttpError(409, 'Pas de nuisible ici');
                const compost = (m.daily.pestCompost || 0) < PEST_COMPOST_DAY ? 1 : 0;
                m.compost += compost;
                count(m, 'pestCompost', compost);
                m.xp += 3;
                count(m, 'pest');
                return { compost, xp: 3 };
            });
        },

        // Compost → engrais (atelier).
        async craft(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                need(m, 'atelier', 2);
                const n = body.all ? Math.floor(m.compost / COMPOST_PER_FERTILIZER) : 1;
                if (n < 1 || m.compost < n * COMPOST_PER_FERTILIZER) throw new HttpError(402, `Il faut ${COMPOST_PER_FERTILIZER} compost pour un engrais`);
                m.compost -= n * COMPOST_PER_FERTILIZER;
                m.fertilizer += n;
                m.xp += 2 * n;
                return { crafted: n };
            });
        },

        async fertilize(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                if (m.fertilizer < 1) throw new HttpError(402, "Plus d'engrais : fabrique-en à l'atelier");
                const { rowCount } = await client.query(
                    `UPDATE garden_plots SET fertilized = true WHERE user_id = $1 AND slot = $2 AND NOT fertilized AND ready_at > now()`,
                    [user.id, plotOf(body, user)]
                );
                if (!rowCount) throw new HttpError(409, 'Il faut une plante en train de pousser, pas encore nourrie');
                m.fertilizer -= 1;
                m.xp += 2;
                count(m, 'fertilize');
            });
        },

        // Growth potion: honey for half the time left (time only: safe for the economy).
        async potion(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                need(m, 'potion', 7);
                if (m.honey < POTION_PRICE) throw new HttpError(402, 'Pas assez de miel');
                const { rowCount } = await client.query(
                    `UPDATE garden_plots SET ready_at = now() + (ready_at - now()) * 0.5 WHERE user_id = $1 AND slot = $2 AND ready_at > now() + interval '10 seconds'`,
                    [user.id, plotOf(body, user)]
                );
                if (!rowCount) throw new HttpError(409, 'Cette plante est déjà presque prête');
                m.honey -= POTION_PRICE;
            });
        },

        async deliver(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                refreshOrders(m);
                const i = Number(body.index);
                const order = m.orders[i];
                if (!order?.items || (body.id && order.id !== body.id)) throw new HttpError(409, 'Cette commande a changé');
                for (const [k, q] of Object.entries(order.items)) {
                    if ((m.barn[k] || 0) < q) throw new HttpError(402, `Il manque ${q - (m.barn[k] || 0)} × ${SEEDS[k]?.name || k} dans ta grange`);
                }
                for (const [k, q] of Object.entries(order.items)) m.barn[k] -= q;
                const coins = Math.max(0, Math.min(order.coins, ORDER_COINS_DAY - (m.daily.orderCoins || 0)));
                if (coins) await client.query(`UPDATE users SET coins = coins + $2 WHERE id = $1`, [user.id, coins]);
                count(m, 'orderCoins', coins);
                count(m, 'order');
                m.xp += order.xp;
                m.honey += order.honey;
                m.orders[i] = { wait: new Date(Date.now() + ORDER_WAIT).toISOString() };
                return { delivered: { npc: order.npc, coins, xp: order.xp, honey: order.honey, capped: coins < order.coins } };
            });
        },

        async skipOrder(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                refreshOrders(m);
                const i = Number(body.index);
                if (!m.orders[i]?.items) throw new HttpError(409, 'Cette commande a changé');
                m.orders[i] = { wait: new Date(Date.now() + SKIP_WAIT).toISOString() };
            });
        },

        async buyDecor(db, body, event) {
            const item = DECOR[body.key];
            if (!item) throw new HttpError(400, 'Décoration inconnue');
            return withGarden(db, event, async (client, user, m) => {
                need(m, 'decor', 4);
                if (m.decor.includes(body.key)) throw new HttpError(409, 'Tu l\'as déjà');
                if (m.honey < item.price) throw new HttpError(402, 'Pas assez de miel');
                m.honey -= item.price;
                m.decor = [...m.decor, body.key];
                m.xp += item.beauty * 3;
            });
        },

        // End of an arcade game: rewards within the daily caps, best score kept.
        async gameReward(db, body, event) {
            const game = GAMES[body.game];
            if (!game) throw new HttpError(400, 'Jeu inconnu');
            const score = Math.max(0, Math.min(game.max, Math.floor(Number(body.score) || 0)));
            return withGarden(db, event, async (client, user, m) => {
                const d = m.daily;
                const record = score > (m.best[body.game] || 0);
                if (record) m.best = { ...m.best, [body.game]: score };
                if (d.lastGame && Date.now() - d.lastGame < GAME_GAP) return { reward: { honey: 0, xp: 0, compost: 0 }, score, record, tooSoon: true };
                d.lastGame = Date.now();
                const honey = Math.max(0, Math.min(game.honey(score), GAME_HONEY_DAY - (d.gameHoney || 0)));
                const xp = Math.max(0, Math.min(game.xp(score), GAME_XP_DAY - (d.gameXp || 0)));
                const compost = Math.max(0, Math.min(game.compost?.(score) || 0, PEST_COMPOST_DAY - (d.pestCompost || 0)));
                m.honey += honey;
                m.xp += xp;
                m.compost += compost;
                count(m, 'gameHoney', honey);
                count(m, 'gameXp', xp);
                count(m, 'pestCompost', compost);
                if (score > 0) count(m, 'game');
                if (body.game === 'pests') count(m, 'pest', Math.min(3, Math.floor(score / 10)));
                return { reward: { honey, xp, compost }, score, record, capped: honey < game.honey(score) || xp < game.xp(score) };
            });
        },

        async claimQuest(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                const d = m.daily;
                const key = String(body.key);
                if (!d.quests.includes(key)) throw new HttpError(404, 'Quête introuvable');
                if ((d.claimed || []).includes(key)) throw new HttpError(409, 'Déjà réclamée');
                if ((d[key] || 0) < QUESTS[key].goal) throw new HttpError(409, 'Pas encore terminée');
                d.claimed = [...(d.claimed || []), key];
                m.honey += QUEST_REWARD.honey;
                m.xp += QUEST_REWARD.xp;
                return { reward: QUEST_REWARD };
            });
        },

        async claimChest(db, body, event) {
            return withGarden(db, event, async (client, user, m) => {
                const d = m.daily;
                const quests = d.quests;
                if (d.chest) throw new HttpError(409, 'Coffre déjà ouvert aujourd\'hui');
                if (!quests.every((k) => (d.claimed || []).includes(k))) throw new HttpError(409, 'Termine les 4 quêtes du jour');
                d.chest = true;
                m.honey += CHEST_REWARD.honey;
                m.fertilizer += CHEST_REWARD.fertilizer;
                await client.query(`UPDATE users SET coins = coins + $2 WHERE id = $1`, [user.id, CHEST_REWARD.coins]);
                return { reward: CHEST_REWARD };
            });
        },
    };
}
