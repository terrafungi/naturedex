/**
 * Battles: campaign (15 stages of fixed opponents), ranked arena (other players' teams
 * and rangers, played by the AI, with an Elo rating) and friendly training.
 * The rules live in battle.mjs; this file stores fights and pays rewards.
 */
import { ABILITIES, RULES, STRONG, TEAM_SIZE, battleStats, newBattle, playRound, view } from './battle.mjs';

export const DAILY_REWARDS = 5; // rewarded wins per day (ranked + campaign replays)
export const WIN_COINS = 30; // ranked win
export const REPLAY_COINS = 15; // cleared campaign stage won again
const ELO_K = 32;
const MIN_RATING = 100;

// [type, rarity, depth]: depth 0 = the most viewed card of that type and rarity (the
// strongest, its PV come from its popularity), 0.5 = a middling one.
export const STAGES = [
    { name: 'La mare', text: 'Une première sortie au bord de l\'eau. Repère qui est fort contre qui.', ai: 1, coins: 60, team: [['fish', 'common', 0.6], ['reptile', 'common', 0.6], ['arthropod', 'common', 0.6]] },
    { name: 'Lisière du bois', text: 'Prédateurs, oiseaux et fleurs : chaque type a sa proie.', ai: 1, coins: 70, team: [['mammal', 'common', 0.5], ['bird', 'common', 0.5], ['plant', 'common', 0.5]] },
    { name: 'Sous-bois humide', text: 'Les décomposeurs attaquent le bois mort. Un arbre ne craint pas les moisissures.', ai: 1, coins: 80, team: [['fungus', 'common', 0.4], ['mold', 'common', 0.4], ['tree', 'common', 0.4]] },
    { name: 'Le récif', text: 'L\'adversaire change de carte quand il est en danger. Anticipe-le.', ai: 2, coins: 90, team: [['marine', 'uncommon', 0.6], ['fish', 'uncommon', 0.6], ['alga', 'common', 0.2]] },
    { name: 'Le laboratoire', text: 'Boss : bactéries, virus et moisissures empoisonnent. Garde des soins.', ai: 2, coins: 120, nuggets: 50, boss: true, team: [['bacteria', 'uncommon', 0.3], ['virus', 'uncommon', 0.3], ['mold', 'uncommon', 0.3]] },
    { name: 'La prairie en fleurs', text: 'Une nuée d\'insectes frappe aussi ta réserve.', ai: 2, coins: 110, team: [['arthropod', 'uncommon', 0.2], ['bird', 'uncommon', 0.2], ['plant', 'rare', 0.6]] },
    { name: 'Le marais', text: 'Des reptiles blindés : il faudra plus que des attaques simples.', ai: 2, coins: 120, team: [['reptile', 'rare', 0.5], ['fish', 'uncommon', 0.1], ['arthropod', 'rare', 0.5]] },
    { name: 'La forêt ancienne', text: 'L\'écorce renvoie les coups : choisis le bon moment pour frapper.', ai: 2, coins: 130, team: [['tree', 'rare', 0.3], ['fungus', 'rare', 0.3], ['mammal', 'rare', 0.5]] },
    { name: 'La haute mer', text: 'Le jet d\'encre vide ton énergie. Dépense-la avant qu\'elle ne s\'envole.', ai: 3, coins: 140, team: [['marine', 'rare', 0.2], ['fish', 'rare', 0.2], ['alga', 'rare', 0.2]] },
    { name: 'Le gisement fossile', text: 'Boss : les fossiles chargent un impact énorme. Protège-toi au bon tour.', ai: 3, coins: 200, nuggets: 120, boss: true, team: [['fossil', 'epic', 0.5], ['fossil', 'rare', 0.1], ['reptile', 'epic', 0.5]] },
    { name: 'La savane', text: 'Des prédateurs épiques, rapides et puissants.', ai: 3, coins: 180, team: [['mammal', 'epic', 0.4], ['bird', 'epic', 0.5], ['arthropod', 'epic', 0.4]] },
    { name: 'L\'épidémie', text: 'Tout empoisonne. Les plantes et les algues sont tes alliées.', ai: 3, coins: 200, team: [['virus', 'epic', 0.2], ['bacteria', 'epic', 0.2], ['mold', 'epic', 0.2]] },
    { name: 'Les cimes', text: 'Un rapace légendaire règne sur la canopée.', ai: 3, coins: 230, team: [['bird', 'legendary', 0.5], ['tree', 'epic', 0.1], ['mammal', 'epic', 0.1]] },
    { name: 'Les abysses', text: 'Les géants des profondeurs.', ai: 3, coins: 260, team: [['marine', 'legendary', 0.3], ['fish', 'legendary', 0.3], ['alga', 'epic', 0]] },
    { name: 'L\'âge des géants', text: 'Boss final : les plus célèbres espèces du NatureDex.', ai: 3, coins: 400, nuggets: 400, boss: true, team: [['fossil', 'legendary', 0], ['reptile', 'legendary', 0], ['mammal', 'legendary', 0]] },
];

// Rangers fill the arena so there is always someone to fight; their cards follow the rating.
const BANDS = [
    [950, ['common', 'common', 'uncommon']], [1100, ['common', 'uncommon', 'uncommon']], [1250, ['uncommon', 'uncommon', 'rare']],
    [1400, ['uncommon', 'rare', 'rare']], [1550, ['rare', 'rare', 'epic']], [1700, ['rare', 'epic', 'epic']],
    [1850, ['epic', 'epic', 'legendary']], [Infinity, ['epic', 'legendary', 'legendary']],
];
const RANGERS = ['Garde Léa', 'Botaniste Hugo', 'Ornithologue Inès', 'Mycologue Jules', 'Biologiste Nora', 'Paléontologue Malo', 'Océanographe Zoé', 'Entomologiste Sacha', 'Herpétologue Lina'];
const BOT_OFFSETS = [-90, 0, 90];

const BATTLE_CARD = `c.id, c.name, c.type, c.rarity, c.thumb_url, c.stats`;
const shapeCard = (c) => ({ id: c.id, name: c.name, type: c.type, rarity: c.rarity, thumb_url: c.thumb_url, ...battleStats(c), count: c.count });

export function arenaActions({ requireUser, inTransaction, HttpError, publicUser, parisDay }) {
    let stageCache;
    async function stageTeams(db) {
        if (!stageCache) {
            stageCache = await Promise.all(STAGES.map((s) => Promise.all(s.team.map(async ([type, rarity, depth]) => {
                const { rows: [c] } = await db.query(
                    `SELECT ${BATTLE_CARD} FROM cards c WHERE c.type = $1 AND c.rarity = $2 ORDER BY c.views DESC, c.id
                     OFFSET floor($3::float8 * (SELECT COUNT(*) - 1 FROM cards WHERE type = $1 AND rarity = $2))::int LIMIT 1`, [type, rarity, depth]);
                return c;
            }))));
            // the same species twice in one team (fossil stage) would look odd
            stageCache = stageCache.map((team) => team.filter(Boolean));
        }
        return stageCache;
    }

    const botCache = new Map();
    async function rangers(db, rating, day) {
        return Promise.all(BOT_OFFSETS.map(async (offset, slot) => {
            const r = Math.max(MIN_RATING, Math.round((rating + offset) / 10) * 10);
            const band = BANDS.findIndex(([max]) => r < max);
            const key = `${day}:${band}:${slot}`;
            if (!botCache.has(key)) {
                const cards = [];
                for (const rarity of BANDS[band][1]) {
                    const { rows: [c] } = await db.query(
                        `SELECT ${BATTLE_CARD} FROM cards c WHERE c.rarity = $1 AND NOT (c.type = ANY($2)) ORDER BY md5($3 || c.id) LIMIT 1`,
                        [rarity, cards.map((x) => x.type), `${key}:${cards.length}`]);
                    cards.push(c);
                }
                const name = RANGERS[[...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7) % RANGERS.length];
                botCache.set(key, { name, cards });
            }
            return { slot, rating: r, ...botCache.get(key) };
        }));
    }

    async function arenaRow(db, userId) {
        await db.query(`INSERT INTO arena (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
        const { rows: [a] } = await db.query(`SELECT * FROM arena WHERE user_id = $1`, [userId]);
        return a;
    }

    // The team as saved, keeping only cards the player still owns.
    async function teamCards(db, userId, ids) {
        if (!ids?.length) return [];
        const { rows } = await db.query(
            `SELECT ${BATTLE_CARD}, uc.count FROM cards c JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1 WHERE c.id = ANY($2)`, [userId, ids]);
        return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
    }

    async function rewardsLeft(db, userId) {
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM battles WHERE user_id = $1 AND (reward->>'daily')::boolean
             AND (ended_at AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date`, [userId]);
        return Math.max(0, DAILY_REWARDS - n);
    }

    function shapeBattle(b) {
        return {
            id: Number(b.id), mode: b.mode, stage: b.stage, status: b.status,
            opponent: { name: b.opponent_name, rating: b.opponent_rating },
            stageName: b.stage ? STAGES[b.stage - 1]?.name : null,
            reward: b.reward, ratingDelta: b.rating_delta,
            state: view(b.state),
        };
    }

    async function loadBattle(db, userId, id, lock = false) {
        const { rows: [b] } = await db.query(
            `SELECT * FROM battles WHERE user_id = $1 AND ${id ? 'id = $2' : `status = 'active'`} ${lock ? 'FOR UPDATE' : ''}`,
            id ? [userId, id] : [userId]);
        return b || null;
    }

    async function opponents(db, user, rating) {
        const { rows } = await db.query(
            `SELECT u.id, u.username, a.rating, a.wins, a.team FROM arena a JOIN users u ON u.id = a.user_id
             WHERE a.user_id <> $1 AND array_length(a.team, 1) = ${TEAM_SIZE}
               AND (u.username NOT LIKE 'zz\\_test\\_%' OR $3)
               AND (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = a.user_id AND uc.card_id = ANY(a.team)) = ${TEAM_SIZE}
             ORDER BY abs(a.rating - $2), u.id LIMIT 4`, [user.id, rating, user.username.startsWith('zz_test_')]);
        const cards = rows.length ? (await db.query(`SELECT c.id, c.name, c.type, c.rarity, c.thumb_url FROM cards c WHERE c.id = ANY($1)`, [rows.flatMap((r) => r.team)])).rows : [];
        return rows.map((r) => ({ username: r.username, rating: r.rating, wins: r.wins, team: r.team.map((id) => cards.find((c) => c.id === id)) }));
    }

    // Elo, for the attacker; a real defender moves half as much the other way.
    const eloDelta = (me, them, won) => Math.round(ELO_K * ((won ? 1 : 0) - 1 / (1 + 10 ** ((them - me) / 400))));

    async function finish(client, b, state) {
        const won = state.winner === 0;
        const { rows: [a] } = await client.query(`SELECT * FROM arena WHERE user_id = $1 FOR UPDATE`, [b.user_id]);
        const daily = won && (b.mode === 'ranked' || b.mode === 'campaign') ? (await rewardsLeft(client, b.user_id)) > 0 : false;
        let reward = null, delta = null;
        if (b.mode === 'campaign') {
            const st = STAGES[b.stage - 1];
            if (won && b.stage > a.campaign) {
                reward = { coins: st.coins, nuggets: st.nuggets || 0, first: true };
                await client.query(`UPDATE arena SET campaign = $2 WHERE user_id = $1`, [b.user_id, b.stage]);
            } else if (daily) reward = { coins: REPLAY_COINS, nuggets: 0, daily: true };
        } else if (b.mode === 'ranked') {
            delta = eloDelta(a.rating, b.opponent_rating, won);
            await client.query(
                `UPDATE arena SET rating = GREATEST($2, rating + $3), wins = wins + $4, losses = losses + $5, updated_at = now() WHERE user_id = $1`,
                [b.user_id, MIN_RATING, delta, won ? 1 : 0, won ? 0 : 1]);
            if (b.opponent_id) {
                await client.query(`UPDATE arena SET rating = GREATEST($2, rating - $3) WHERE user_id = $1`, [b.opponent_id, MIN_RATING, Math.round(delta / 2)]);
            }
            if (daily) reward = { coins: WIN_COINS, nuggets: 0, daily: true };
        }
        if (reward) {
            await client.query(`UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1`, [b.user_id, reward.coins, reward.nuggets]);
        }
        const { rows: [done] } = await client.query(
            `UPDATE battles SET state = $2, status = $3, reward = $4, rating_delta = $5, ended_at = now() WHERE id = $1 RETURNING *`,
            [b.id, state, won ? 'won' : 'lost', reward, delta]);
        return done;
    }

    return {
        // Everything the combat page needs.
        async arena(db, body, event) {
            const user = await requireUser(db, event);
            const a = await arenaRow(db, user.id);
            const [team, stages, left, active, day, { rows: history }, { rows: [rank] }] = await Promise.all([
                teamCards(db, user.id, a.team),
                stageTeams(db),
                rewardsLeft(db, user.id),
                loadBattle(db, user.id),
                parisDay(db),
                db.query(`SELECT id, mode, stage, opponent_name, status, reward, rating_delta, ended_at FROM battles
                          WHERE user_id = $1 AND status <> 'active' ORDER BY id DESC LIMIT 8`, [user.id]),
                db.query(`SELECT COUNT(*)::int + 1 AS rank FROM arena WHERE rating > $1 AND wins + losses > 0`, [a.rating]),
            ]);
            const [players, bots, { rows: friends }] = await Promise.all([
                opponents(db, user, a.rating), rangers(db, a.rating, day),
                db.query(`SELECT u.username, a.rating, array_length(a.team, 1) = ${TEAM_SIZE} AS ready FROM friendships f
                          JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
                          LEFT JOIN arena a ON a.user_id = u.id
                          WHERE f.status = 'accepted' AND $1 IN (f.requester_id, f.addressee_id) ORDER BY u.username`, [user.id]),
            ]);
            return {
                rules: RULES, abilities: ABILITIES, strong: STRONG,
                team: team.map(shapeCard),
                rating: a.rating, wins: a.wins, losses: a.losses, rank: a.wins + a.losses ? rank.rank : null, campaign: a.campaign,
                rewardsLeft: left, dailyRewards: DAILY_REWARDS, winCoins: WIN_COINS, replayCoins: REPLAY_COINS,
                active: active && { id: Number(active.id), mode: active.mode, opponent: active.opponent_name, round: active.state.round },
                stages: STAGES.map((s, i) => ({
                    n: i + 1, name: s.name, text: s.text, ai: s.ai, boss: !!s.boss, coins: s.coins, nuggets: s.nuggets || 0,
                    cleared: a.campaign > i, locked: a.campaign < i,
                    team: stages[i].map(shapeCard),
                })),
                players,
                friends: friends.map((f) => ({ username: f.username, rating: f.rating ?? 1000, ready: !!f.ready })),
                rangers: bots.map((b) => ({ slot: b.slot, name: b.name, rating: b.rating, team: b.cards.map(shapeCard) })),
                history: history.map((h) => ({ ...h, id: Number(h.id), stageName: h.stage ? STAGES[h.stage - 1]?.name : null })),
            };
        },

        // Owned cards with their battle stats, for the team builder.
        async arenaCards(db, body, event) {
            const user = await requireUser(db, event);
            const { rows } = await db.query(
                `SELECT ${BATTLE_CARD}, uc.count FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE uc.user_id = $1`, [user.id]);
            return { cards: rows.map(shapeCard) };
        },

        async setTeam(db, body, event) {
            const user = await requireUser(db, event);
            const ids = [...new Set((body.cards || []).map(Number))];
            if (ids.length !== TEAM_SIZE) throw new HttpError(400, `Choisis ${TEAM_SIZE} cartes différentes`);
            const cards = await teamCards(db, user.id, ids);
            if (cards.length !== TEAM_SIZE) throw new HttpError(400, 'Tu ne possèdes pas toutes ces cartes');
            await arenaRow(db, user.id);
            await db.query(`UPDATE arena SET team = $2, updated_at = now() WHERE user_id = $1`, [user.id, ids]);
            return { team: cards.map(shapeCard) };
        },

        async battleStart(db, body, event) {
            const user = await requireUser(db, event);
            const a = await arenaRow(db, user.id);
            const mine = await teamCards(db, user.id, a.team);
            if (mine.length !== TEAM_SIZE) throw new HttpError(400, `Compose d'abord ton équipe de ${TEAM_SIZE} cartes`);
            let foe, opts = { mode: body.mode };
            if (body.mode === 'campaign') {
                const n = Number(body.stage);
                if (!STAGES[n - 1]) throw new HttpError(404, 'Étape inconnue');
                if (n > a.campaign + 1) throw new HttpError(403, 'Termine d\'abord l\'étape précédente');
                foe = { name: STAGES[n - 1].name, cards: (await stageTeams(db))[n - 1], ai: STAGES[n - 1].ai };
                opts.stage = n;
            } else if (body.mode === 'ranked' && body.bot != null) {
                const bot = (await rangers(db, a.rating, await parisDay(db)))[Number(body.bot)];
                if (!bot) throw new HttpError(404, 'Adversaire introuvable');
                foe = { name: bot.name, cards: bot.cards, ai: 3, rating: bot.rating };
            } else if (body.mode === 'ranked' || body.mode === 'friend') {
                const { rows: [o] } = await db.query(
                    `SELECT u.id, u.username, a.rating, a.team FROM users u JOIN arena a ON a.user_id = u.id WHERE lower(u.username) = lower($1)`, [String(body.username || '')]);
                if (!o || o.id === user.id) throw new HttpError(404, 'Joueur introuvable');
                if (body.mode === 'friend') {
                    const { rows: [f] } = await db.query(
                        `SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [user.id, o.id]);
                    if (!f) throw new HttpError(403, 'Vous n\'êtes pas amis');
                }
                const cards = await teamCards(db, o.id, o.team);
                if (cards.length !== TEAM_SIZE) throw new HttpError(400, `${o.username} n'a pas d'équipe complète`);
                foe = { name: o.username, cards, ai: 3, rating: o.rating, id: o.id };
            } else throw new HttpError(400, 'Mode de combat inconnu');

            const state = newBattle(mine, foe.cards, { ai: foe.ai, names: [user.username, foe.name] });
            try {
                const { rows: [b] } = await db.query(
                    `INSERT INTO battles (user_id, mode, stage, opponent_id, opponent_name, opponent_rating, state)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                    [user.id, opts.mode, opts.stage || null, foe.id || null, foe.name, foe.rating ?? null, state]);
                return { battle: shapeBattle(b) };
            } catch (err) {
                if (err.code === '23505') throw new HttpError(409, 'Un combat est déjà en cours : termine-le ou abandonne-le');
                throw err;
            }
        },

        async battle(db, body, event) {
            const user = await requireUser(db, event);
            const b = await loadBattle(db, user.id, body.id ? Number(body.id) : null);
            if (!b) throw new HttpError(404, 'Combat introuvable');
            return { battle: shapeBattle(b) };
        },

        async battleAct(db, body, event) {
            const user = await requireUser(db, event);
            const result = await inTransaction(db, async (client) => {
                const b = await loadBattle(client, user.id, Number(body.id), true);
                if (!b) throw new HttpError(404, 'Combat introuvable');
                if (b.status !== 'active') throw new HttpError(409, 'Ce combat est terminé');
                const state = b.state;
                const a = body.move || {};
                let events;
                try {
                    events = playRound(state, { kind: String(a.kind), ...(a.kind === 'switch' ? { to: Number(a.to) } : {}) });
                } catch (err) {
                    throw new HttpError(400, err.message);
                }
                if (state.phase === 'over') return { b: await finish(client, b, state), events };
                const { rows: [saved] } = await client.query(`UPDATE battles SET state = $2 WHERE id = $1 RETURNING *`, [b.id, state]);
                return { b: saved, events };
            });
            const out = { battle: shapeBattle(result.b), events: result.events };
            if (result.b.status !== 'active') {
                const { rows: [u] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
                out.user = await publicUser(db, u);
            }
            return out;
        },

        async battleForfeit(db, body, event) {
            const user = await requireUser(db, event);
            const b = await inTransaction(db, async (client) => {
                const b = await loadBattle(client, user.id, Number(body.id), true);
                if (!b || b.status !== 'active') throw new HttpError(404, 'Aucun combat en cours');
                const state = b.state;
                state.phase = 'over';
                state.winner = 1;
                state.intent = null;
                state.forfeit = true;
                return finish(client, b, state);
            });
            return { battle: shapeBattle(b) };
        },
    };
}
