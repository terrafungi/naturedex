/**
 * « Duel » — the card game (tcg.mjs) against the AI.
 *
 * Énergies and Naturalistes are counted per player in tcg_cards (key 'e:foret', 't:darwin'…);
 * creatures are the species of the collection. Every player gets a small starter kit the first
 * time; winning duels earns more Énergie and Naturaliste cards.
 * The deck is built automatically from the collection until the deck builder exists.
 */
import { BIOMES, ITEM_KEYS, STARTER_TRAINERS, TRAINERS, UNIVERSAL, act, autoDeck, creatureCard, itemCard, newGame, view } from './tcg.mjs';

const MIN_CREATURES = 6;
const DAILY_REWARDED = 5; // won duels per Paris day that still pay out
const CARD_FIELDS = 'c.id, c.name, c.type, c.rarity, c.iucn, c.stats, c.thumb_url';

export const LEVELS = [
    { n: 1, name: 'Promenade', text: 'Un adversaire débutant, avec des cartes communes.', rarities: ['common', 'uncommon'], ai: 1, size: 24, trainers: 4, coins: 15, cards: 1 },
    { n: 2, name: 'Expédition', text: 'Des créatures rares et quelques naturalistes.', rarities: ['rare', 'epic'], ai: 2, size: 30, trainers: 7, coins: 30, cards: 2 },
    { n: 3, name: 'Grande expédition', text: 'Des créatures légendaires et les plus grands naturalistes.', rarities: ['epic', 'legendary'], ai: 2, size: 40, trainers: 11, coins: 50, cards: 3 },
];
const RANGERS = ['Camille', 'Sacha', 'Alex', 'Noa', 'Lou', 'Charlie', 'Eden', 'Andréa', 'Morgan', 'Sasha', 'Ali', 'Robin'];
const RARITY_WEIGHT = { common: 60, uncommon: 25, rare: 11, epic: 3.5, legendary: 0.5 };
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

async function ownedCreatures(db, userId) {
    const { rows } = await db.query(
        `SELECT ${CARD_FIELDS} FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE uc.user_id = $1 AND uc.count > 0`, [userId]);
    return rows.map(creatureCard);
}

async function ownedItems(db, userId) {
    const { rows } = await db.query(`SELECT key, count FROM tcg_cards WHERE user_id = $1 AND count > 0`, [userId]);
    return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

const addItems = (db, userId, keys) => db.query(
    `INSERT INTO tcg_cards (user_id, key, count) SELECT $1, k, count(*) FROM unnest($2::text[]) AS k GROUP BY k
     ON CONFLICT (user_id, key) DO UPDATE SET count = tcg_cards.count + EXCLUDED.count`, [userId, keys]);

/** The first time: 10 Énergies of the player's two main biomes and 4 simple Naturalistes. */
async function ensureStarter(db, userId, creatures) {
    const { rows: [has] } = await db.query(`SELECT 1 FROM tcg_cards WHERE user_id = $1 LIMIT 1`, [userId]);
    if (has || creatures.length < MIN_CREATURES) return null;
    const kit = autoDeck(creatures, { size: 24, nCreatures: 10, trainers: STARTER_TRAINERS }).filter((c) => c.kind !== 'creature').map((c) => c.key);
    await addItems(db, userId, kit);
    return kit;
}

/**
 * The player's deck, from what they own: the creatures of their two main biomes (10 to 16),
 * the Énergies that fit them (up to 16), their best Naturalistes (up to 8, 2 copies each).
 */
function buildDeck(creatures, items) {
    const trainers = Object.keys(items).filter((k) => k.startsWith('t:'))
        .sort((a, b) => RARITY_ORDER.indexOf(itemCard(a).rarity) - RARITY_ORDER.indexOf(itemCard(b).rarity))
        .flatMap((k) => Array(Math.min(2, items[k])).fill(k)).slice(0, 8);
    const energyCount = Object.entries(items).filter(([k]) => k.startsWith('e:')).reduce((s, [, n]) => s + n, 0);
    const nCreatures = Math.max(10, Math.min(16, Math.round((Math.min(16, energyCount) + trainers.length) * 0.7)));
    const picked = autoDeck(creatures, { size: nCreatures, nCreatures, trainers: [] }).filter((c) => c.kind === 'creature');
    // Énergies: the biomes the creatures need first, then Universelles, then the rest
    const need = {};
    for (const c of picked) need[c.biome] = (need[c.biome] || 0) + 1;
    const left = Object.fromEntries(Object.entries(items).filter(([k]) => k.startsWith('e:')));
    const energies = [];
    const take = (k) => { if (left[k] > 0 && energies.length < 16) { left[k] -= 1; energies.push(k); return true; } return false; };
    const order = Object.keys(need).sort((a, b) => need[b] - need[a]);
    for (let round = 0; round < 16; round++) for (const b of order) if (round < need[b] * 1.6) take(`e:${b}`);
    while (take(`e:${UNIVERSAL}`));
    for (const b of order) while (energies.length < 10 && take(`e:${b}`));
    return [...picked, ...energies.map(itemCard), ...trainers.map(itemCard)];
}

async function foeDeck(db, level) {
    const { rows } = await db.query(
        `SELECT ${CARD_FIELDS} FROM cards c WHERE c.rarity = ANY($1) AND c.stats ? 'hp' AND c.stats ? 'biome' AND c.stats->>'biome' <> 'none'
         ORDER BY random() LIMIT 60`, [level.rarities]);
    const pool = Object.keys(TRAINERS).filter((k) => level.n === 3 || RARITY_ORDER.indexOf(TRAINERS[k].rarity) >= (level.n === 1 ? 3 : 2));
    const trainers = Array.from({ length: level.trainers }, (_, i) => `t:${i < 2 ? 'appareil' : pool[Math.floor(Math.random() * pool.length)]}`);
    const nCreatures = Math.round((level.size - level.trainers) / 2);
    return autoDeck(rows.map(creatureCard), { size: level.size, nCreatures, trainers });
}

/** Random Énergie or Naturaliste cards; Énergies lean to the biomes of the player's deck. */
function rollRewards(n, deckBiomes) {
    const out = [];
    for (let i = 0; i < n; i++) {
        if (Math.random() < 0.5) {
            const pool = Math.random() < 0.7 && deckBiomes.length ? deckBiomes : Object.keys(BIOMES);
            out.push(Math.random() < 0.08 ? `e:${UNIVERSAL}` : `e:${pool[Math.floor(Math.random() * pool.length)]}`);
            continue;
        }
        let r = Math.random() * 100;
        const rarity = Object.keys(RARITY_WEIGHT).find((k) => (r -= RARITY_WEIGHT[k]) < 0) || 'common';
        const keys = ITEM_KEYS.filter((k) => k.startsWith('t:') && itemCard(k).rarity === rarity);
        const fallback = ITEM_KEYS.filter((k) => k.startsWith('t:') && itemCard(k).rarity === 'common');
        const list = keys.length ? keys : fallback;
        out.push(list[Math.floor(Math.random() * list.length)]);
    }
    return out;
}

const shapeDuel = (d, frames) => ({
    id: Number(d.id), level: d.level, opponent: d.opponent_name, status: d.status, reward: d.reward,
    view: view(d.state, 0), log: d.state.lastEvents || [], ...(frames ? { frames } : {}),
});

export function duelActions({ requireUser, inTransaction, HttpError, publicUser, parisDay }) {
    const loadDuel = async (db, userId, id, lock = false) => (await db.query(
        `SELECT * FROM duels WHERE user_id = $1 AND ${id ? 'id = $2' : `status = 'active'`} ${lock ? 'FOR UPDATE' : ''}`,
        id ? [userId, id] : [userId])).rows[0];

    const rewardedToday = async (db, userId) => Number((await db.query(
        `SELECT count(*) AS n FROM duels WHERE user_id = $1 AND status = 'won' AND reward IS NOT NULL
         AND (ended_at AT TIME ZONE 'Europe/Paris')::date = $2::date`, [userId, await parisDay(db)])).rows[0].n);

    async function finish(client, d, state) {
        const won = state.winner === 0;
        let reward = null;
        if (won && !state.forfeit && await rewardedToday(client, d.user_id) < DAILY_REWARDED) {
            const level = LEVELS[d.level - 1];
            const biomes = [...new Set(state.players[0].deck.concat(state.players[0].discard).filter((c) => c.kind === 'creature').map((c) => c.biome))];
            const cards = rollRewards(level.cards, biomes);
            await addItems(client, d.user_id, cards);
            await client.query(`UPDATE users SET coins = coins + $2 WHERE id = $1`, [d.user_id, level.coins]);
            reward = { coins: level.coins, cards: cards.map(itemCard) };
        }
        const { rows: [saved] } = await client.query(
            `UPDATE duels SET state = $2, status = $3, reward = $4, ended_at = now() WHERE id = $1 RETURNING *`,
            [d.id, state, won ? 'won' : 'lost', reward]);
        return saved;
    }

    return {
        async duelHome(db, body, event) {
            const user = await requireUser(db, event);
            const creatures = await ownedCreatures(db, user.id);
            const starter = await ensureStarter(db, user.id, creatures);
            const items = await ownedItems(db, user.id);
            const deck = creatures.length >= MIN_CREATURES ? buildDeck(creatures, items) : [];
            const active = await loadDuel(db, user.id, null);
            const { rows: [st] } = await db.query(
                `SELECT count(*) FILTER (WHERE status = 'won') AS won, count(*) FILTER (WHERE status = 'lost') AS lost FROM duels WHERE user_id = $1`, [user.id]);
            return {
                levels: LEVELS.map(({ rarities, ...l }) => l), minCreatures: MIN_CREATURES, creatures: creatures.length,
                starter: starter && starter.map(itemCard), deck, items: Object.entries(items).map(([key, count]) => ({ ...itemCard(key), count })),
                activeId: active ? Number(active.id) : null, won: Number(st.won), lost: Number(st.lost),
                rewardsLeft: Math.max(0, DAILY_REWARDED - await rewardedToday(db, user.id)),
            };
        },

        async duelStart(db, body, event) {
            const user = await requireUser(db, event);
            const level = LEVELS[Number(body.level) - 1];
            if (!level) throw new HttpError(400, 'Niveau inconnu');
            const creatures = await ownedCreatures(db, user.id);
            if (creatures.length < MIN_CREATURES) throw new HttpError(400, `Il te faut au moins ${MIN_CREATURES} cartes dans ta collection pour jouer.`);
            await ensureStarter(db, user.id, creatures);
            const deck = buildDeck(creatures, await ownedItems(db, user.id));
            const foe = await foeDeck(db, level);
            const name = `Ranger ${RANGERS[Math.floor(Math.random() * RANGERS.length)]}`;
            const state = newGame([deck, foe], { seed: Math.floor(Math.random() * 2 ** 31), names: [user.username, name], ai: level.ai });
            try {
                const { rows: [d] } = await db.query(
                    `INSERT INTO duels (user_id, level, opponent_name, state) VALUES ($1, $2, $3, $4) RETURNING *`, [user.id, level.n, name, state]);
                return { duel: shapeDuel(d) };
            } catch (err) {
                if (err.code === '23505') throw new HttpError(409, 'Un duel est déjà en cours : termine-le ou abandonne-le');
                throw err;
            }
        },

        async duel(db, body, event) {
            const user = await requireUser(db, event);
            const d = await loadDuel(db, user.id, body.id ? Number(body.id) : null);
            if (!d) throw new HttpError(404, 'Duel introuvable');
            return { duel: shapeDuel(d) };
        },

        async duelAct(db, body, event) {
            const user = await requireUser(db, event);
            // the board after the player's move and after each AI move, so the site can replay them
            const frames = [];
            const d = await inTransaction(db, async (client) => {
                frames.length = 0;
                const d = await loadDuel(client, user.id, Number(body.id), true);
                if (!d) throw new HttpError(404, 'Duel introuvable');
                if (d.status !== 'active') throw new HttpError(409, 'Ce duel est terminé');
                const state = d.state;
                const a = body.action || {};
                const num = (v) => (v == null ? undefined : Number(v));
                const action = { t: String(a.t), uid: num(a.uid), target: num(a.target), to: num(a.to), i: num(a.i) };
                if (action.t === 'setup') Object.assign(action, { active: num(a.active), bench: (Array.isArray(a.bench) ? a.bench : []).slice(0, 3).map(Number) });
                for (const k of Object.keys(action)) if (action[k] === undefined) delete action[k];
                try {
                    let seen = 0;
                    const events = act(state, 0, action, (evs) => {
                        if (evs.length === seen) return;
                        frames.push({ events: evs.slice(seen), view: view(state, 0) });
                        seen = evs.length;
                    });
                    state.lastEvents = events.slice(-30);
                } catch (err) {
                    throw new HttpError(400, err.message);
                }
                if (state.phase === 'over') return finish(client, d, state);
                return (await client.query(`UPDATE duels SET state = $2 WHERE id = $1 RETURNING *`, [d.id, state])).rows[0];
            });
            const out = { duel: shapeDuel(d, frames) };
            if (d.status !== 'active') out.user = await publicUser(db, (await db.query(`SELECT * FROM users WHERE id = $1`, [user.id])).rows[0]);
            return out;
        },

        async duelForfeit(db, body, event) {
            const user = await requireUser(db, event);
            const d = await inTransaction(db, async (client) => {
                const d = await loadDuel(client, user.id, Number(body.id), true);
                if (!d || d.status !== 'active') throw new HttpError(404, 'Aucun duel en cours');
                Object.assign(d.state, { phase: 'over', winner: 1, forfeit: true, reason: 'Abandon.', lastEvents: [{ k: 'end', winner: 1, text: 'Abandon.' }] });
                return finish(client, d, d.state);
            });
            return { duel: shapeDuel(d) };
        },
    };
}
