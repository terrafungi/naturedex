/**
 * Battles: campaign (15 stages of fixed opponents), ranked arena (other players' teams
 * and rangers, played by the AI, with an Elo rating) and friendly training.
 * The rules live in battle.mjs; this file stores fights and pays rewards.
 */
import { ABILITIES, RULES, STRONG, TEAM_SIZE, battleStats, newBattle, playRound, view } from './battle.mjs';

export const DAILY_REWARDS = 5; // rewarded wins per day (ranked + campaign replays)
export const WIN_COINS = 30; // ranked win
export const REPLAY_COINS = 15; // cleared campaign stage won again
export const DAILY_BATTLES = 10; // free battle starts per day, all modes
export const EXTRA_BATTLES = 5; // extra starts per day, paid in nuggets
export const EXTRA_BATTLE_NUGGETS = 15;
// Monthly season: final rank → reward. Only players with enough ranked games are ranked.
export const SEASON_MIN_GAMES = 5;
export const SEASON_REWARDS = [
    { upTo: 1, coins: 3000, nuggets: 500 },
    { upTo: 2, coins: 2000, nuggets: 300 },
    { upTo: 3, coins: 1500, nuggets: 200 },
    { upTo: 10, coins: 800, nuggets: 100 },
    { upTo: 50, coins: 400, nuggets: 50 },
    { upTo: 100, coins: 200, nuggets: 20 },
    { upTo: null, coins: 100, nuggets: 0 },
];
// Ranked tiers also need the starting rating, so a lone loser is not « 1st » of a quiet month.
export const SEASON_MIN_RATING = 1000;
const seasonReward = (rank, rating) => SEASON_REWARDS.find((r) => r.upTo == null || (rating >= SEASON_MIN_RATING && rank <= r.upTo));
const PARIS_MONTH = `to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM')`;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const seasonLabel = (id) => { const [y, m] = id.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };

/**
 * Closes the past season once the Paris month has changed: ranks the players, stores
 * their rewards (claimed from the combat page) and resets every rating. Idempotent.
 */
export async function seasonRollover(db, inTransaction) {
    const { rows: [s] } = await db.query(`SELECT current, ${PARIS_MONTH} AS now FROM arena_season WHERE id = 1`);
    if (!s || s.current === s.now) return false;
    return inTransaction(db, async (client) => {
        const { rows: [locked] } = await client.query(`SELECT current FROM arena_season WHERE id = 1 FOR UPDATE`);
        if (locked.current === s.now) return false;
        const { rows } = await client.query(
            `SELECT a.user_id, a.rating, a.wins, a.losses, ROW_NUMBER() OVER (ORDER BY a.rating DESC, a.wins DESC, a.updated_at, a.user_id)::int AS rank
             FROM arena a WHERE a.wins + a.losses >= $1`, [SEASON_MIN_GAMES]);
        for (const r of rows) {
            const rw = seasonReward(r.rank, r.rating);
            await client.query(
                `INSERT INTO season_results (season, user_id, rank, rating, wins, losses, coins, nuggets) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT DO NOTHING`, [locked.current, r.user_id, r.rank, r.rating, r.wins, r.losses, rw.coins, rw.nuggets]);
        }
        await client.query(`UPDATE arena SET rating = 1000, wins = 0, losses = 0 WHERE rating <> 1000 OR wins + losses > 0`);
        await client.query(`UPDATE arena_season SET current = $1 WHERE id = 1`, [s.now]);
        return true;
    });
}
const ELO_K = 32;
const MIN_RATING = 100;

// [type, rarity, depth]: depth 0 = the most viewed card of that type and rarity (the
// strongest, its PV come from its popularity), 0.5 = a middling one.
export const STAGES = [
    { name: 'La mare', text: 'Une première sortie au bord de l\'eau. Repère qui est fort contre qui.', ai: 1, coins: 60, team: [['fish', 'common', 0.6], ['reptile', 'common', 0.6], ['arthropod', 'common', 0.6]] },
    { name: 'Lisière du bois', text: 'Prédateurs, oiseaux et fleurs : chaque type a sa proie.', ai: 1, coins: 70, team: [['mammal', 'common', 0.5], ['bird', 'common', 0.5], ['plant', 'common', 0.5]] },
    { name: 'Sous-bois humide', text: 'Les décomposeurs attaquent le bois mort. Un arbre ne craint pas les moisissures.', ai: 1, coins: 80, team: [['fungus', 'common', 0.4], ['mold', 'common', 0.4], ['tree', 'common', 0.4]] },
    { name: 'Le récif', text: 'L\'adversaire change de carte quand il est en danger. Anticipe-le.', ai: 2, coins: 90, team: [['marine', 'uncommon', 0.6], ['fish', 'uncommon', 0.6], ['aquatic', 'common', 0.2]] },
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
                    `SELECT ${BATTLE_CARD} FROM cards c WHERE c.type = $1 AND c.rarity = $2 AND c.source <> 'event' ORDER BY c.views DESC, c.id
                     OFFSET floor($3::float8 * (SELECT COUNT(*) - 1 FROM cards WHERE type = $1 AND rarity = $2 AND source <> 'event'))::int LIMIT 1`, [type, rarity, depth]);
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
                        `SELECT ${BATTLE_CARD} FROM cards c WHERE c.rarity = $1 AND c.source <> 'event' AND NOT (c.type = ANY($2)) AND c.type NOT IN ('naturalist', 'place', 'water') ORDER BY md5($3 || c.id) LIMIT 1`,
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
            `SELECT ${BATTLE_CARD}, uc.count FROM cards c JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = $1 WHERE c.id = ANY($2) AND c.type NOT IN ('naturalist', 'place', 'water')`, [userId, ids]);
        return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
    }

    async function rewardsLeft(db, userId) {
        const { rows: [{ n }] } = await db.query(
            `SELECT COUNT(*)::int AS n FROM battles WHERE user_id = $1 AND (reward->>'daily')::boolean
             AND (ended_at AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date`, [userId]);
        return Math.max(0, DAILY_REWARDS - n);
    }

    // Battles started today (Paris), free and paid.
    async function battlesToday(db, userId) {
        const { rows: [r] } = await db.query(
            `SELECT COUNT(*) FILTER (WHERE NOT paid)::int AS free, COUNT(*) FILTER (WHERE paid)::int AS paid FROM battles
             WHERE user_id = $1 AND (created_at AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date`, [userId]);
        return { battlesLeft: Math.max(0, DAILY_BATTLES - r.free), extraLeft: Math.max(0, EXTRA_BATTLES - r.paid) };
    }

    async function seasonInfo(db, userId, a, rank) {
        const [{ rows: [s] }, { rows: pending }, { rows: last }] = await Promise.all([
            db.query(`SELECT current, (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') + interval '1 month') AT TIME ZONE 'Europe/Paris' AS ends_at
                      FROM arena_season WHERE id = 1`),
            db.query(`SELECT season, rank, rating, wins, losses, coins, nuggets FROM season_results WHERE user_id = $1 AND claimed_at IS NULL ORDER BY season`, [userId]),
            db.query(`SELECT r.rank, r.rating, u.username FROM season_results r JOIN users u ON u.id = r.user_id
                      WHERE r.season = (SELECT MAX(season) FROM season_results) AND r.rank <= 3 ORDER BY r.rank`),
        ]);
        const games = a.wins + a.losses;
        return {
            id: s.current, label: seasonLabel(s.current), endsAt: s.ends_at, minGames: SEASON_MIN_GAMES, games,
            projected: games >= SEASON_MIN_GAMES ? { rank, ...seasonReward(rank, a.rating) } : null, minRating: SEASON_MIN_RATING,
            rewards: SEASON_REWARDS,
            pending: pending.map((p) => ({ ...p, label: seasonLabel(p.season) })),
            podium: last,
        };
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
            await seasonRollover(db, inTransaction);
            const a = await arenaRow(db, user.id);
            const [team, stages, left, active, day, today, { rows: history }, { rows: [rank] }] = await Promise.all([
                teamCards(db, user.id, a.team),
                stageTeams(db),
                rewardsLeft(db, user.id),
                loadBattle(db, user.id),
                parisDay(db),
                battlesToday(db, user.id),
                db.query(`SELECT id, mode, stage, opponent_name, status, reward, rating_delta, ended_at FROM battles
                          WHERE user_id = $1 AND status <> 'active' ORDER BY id DESC LIMIT 8`, [user.id]),
                db.query(`SELECT COUNT(*)::int + 1 AS rank FROM arena WHERE rating > $1 AND wins + losses >= $2`, [a.rating, SEASON_MIN_GAMES]),
            ]);
            const season = await seasonInfo(db, user.id, a, rank.rank);
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
                ...today, dailyBattles: DAILY_BATTLES, extraBattles: EXTRA_BATTLES, extraPrice: EXTRA_BATTLE_NUGGETS,
                season,
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
                `SELECT ${BATTLE_CARD}, uc.count FROM user_cards uc JOIN cards c ON c.id = uc.card_id WHERE uc.user_id = $1 AND c.type NOT IN ('naturalist', 'place', 'water')`, [user.id]);
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
                return await inTransaction(db, async (client) => {
                    // one start at a time per player, so the daily count cannot be raced
                    const { rows: [u] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
                    const { battlesLeft, extraLeft } = await battlesToday(client, user.id);
                    const paid = battlesLeft === 0;
                    if (paid && extraLeft === 0) throw new HttpError(429, `Tu as joué tous tes combats du jour. Reviens demain !`);
                    if (paid && !body.pay) throw new HttpError(402, `Tes ${DAILY_BATTLES} combats gratuits du jour sont joués. Combat supplémentaire : ${EXTRA_BATTLE_NUGGETS} pépites.`);
                    if (paid && u.nuggets < EXTRA_BATTLE_NUGGETS) throw new HttpError(402, `Il te faut ${EXTRA_BATTLE_NUGGETS} pépites pour un combat supplémentaire.`);
                    let updated = u;
                    if (paid) {
                        ({ rows: [updated] } = await client.query(`UPDATE users SET nuggets = nuggets - $2 WHERE id = $1 RETURNING *`, [user.id, EXTRA_BATTLE_NUGGETS]));
                    }
                    const { rows: [b] } = await client.query(
                        `INSERT INTO battles (user_id, mode, stage, opponent_id, opponent_name, opponent_rating, state, paid)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                        [user.id, opts.mode, opts.stage || null, foe.id || null, foe.name, foe.rating ?? null, state, paid]);
                    return { battle: shapeBattle(b), ...(paid ? { user: await publicUser(client, updated) } : {}) };
                });
            } catch (err) {
                if (err.code === '23505') throw new HttpError(409, 'Un combat est déjà en cours : termine-le ou abandonne-le');
                throw err;
            }
        },

        async seasonClaim(db, body, event) {
            const user = await requireUser(db, event);
            return inTransaction(db, async (client) => {
                const { rows: [r] } = await client.query(
                    `UPDATE season_results SET claimed_at = now() WHERE user_id = $1 AND season = $2 AND claimed_at IS NULL RETURNING coins, nuggets`,
                    [user.id, String(body.season || '')]);
                if (!r) throw new HttpError(409, 'Récompense déjà récupérée');
                const { rows: [u] } = await client.query(
                    `UPDATE users SET coins = coins + $2, nuggets = nuggets + $3 WHERE id = $1 RETURNING *`, [user.id, r.coins, r.nuggets]);
                return { coins: r.coins, nuggets: r.nuggets, user: await publicUser(client, u) };
            });
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
