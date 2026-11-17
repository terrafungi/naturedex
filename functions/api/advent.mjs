// Calendrier de l'Avent: one door per day from 1 to 24 December (Paris time), a Christmas card
// behind each (cards.source = 'event', never drawn at random). A door not opened on its day is lost.
// Day 24: the Père Noël, 1 chance in SECRET_ODDS of the secret full art version.
export const ADVENT_YEAR = 2026;
export const ADVENT_EVENT = `avent-${ADVENT_YEAR}`;
const DAYS = 24;
const SECRET_ODDS = 10;
const PUSH_HOUR = 8; // Paris time, the morning reminder

const ADVENT_CARD = `c.id, c.num, c.name, c.sci_name, c.type, c.rarity, c.art, c.views, c.thumb_url, c.image_url,
    (c.stats->>'hp')::int AS hp, (c.stats->>'atk')::int AS atk, (c.stats->>'def')::int AS def, (c.stats->>'spd')::int AS spd,
    c.stats->'focus' AS focus, c.stats->>'event' AS event, (c.stats->>'day')::int AS day, c.stats->>'note' AS note`;

// Paris date → { day: 1..31 in December of ADVENT_YEAR, or null; phase: before | open | after }
// ADVENT_FAKE_DATE (YYYY-MM-DD) is for local tests only, never set on the deployed function.
async function today(db) {
    const date = process.env.ADVENT_FAKE_DATE
        || (await db.query(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS d`)).rows[0].d;
    const [y, m, d] = date.split('-').map(Number);
    if (y < ADVENT_YEAR || (y === ADVENT_YEAR && m < 12)) return { date, day: null, phase: 'before' };
    if (y === ADVENT_YEAR && m === 12 && d <= DAYS) return { date, day: d, phase: 'open' };
    return { date, day: y === ADVENT_YEAR ? d : null, phase: 'after' };
}

const eventCards = async (db) => (await db.query(
    `SELECT ${ADVENT_CARD}, c.stats ? 'secret' AS secret FROM cards c WHERE c.source = 'event' AND c.stats->>'event' = $1`, [ADVENT_EVENT])).rows;

export function adventActions({ requireUser, inTransaction, HttpError, publicUser, giveCard, isAdmin }) {
    async function calendar(db, user) {
        const now = await today(db);
        const cards = await eventCards(db);
        const byDay = new Map(cards.filter((c) => !c.secret).map((c) => [c.day, c]));
        const { rows: claims } = await db.query(`SELECT day, card_id FROM advent_claims WHERE user_id = $1 AND year = $2`, [user.id, ADVENT_YEAR]);
        const claimed = new Map(claims.map((c) => [c.day, c.card_id]));
        const reveal = isAdmin(user) && now.phase === 'before'; // admin preview before December
        const doors = Array.from({ length: DAYS }, (_, i) => {
            const day = i + 1;
            const mine = claimed.get(day);
            const past = now.phase === 'after' || (now.phase === 'open' && day < now.day);
            const state = mine ? 'opened' : now.phase === 'open' && day === now.day ? 'today' : past ? 'missed' : 'future';
            const card = mine ? cards.find((c) => c.id === mine) : state === 'missed' || reveal ? byDay.get(day) : null;
            return { day, state, card: card ? { ...card, secret: undefined } : null };
        });
        return {
            year: ADVENT_YEAR, phase: now.phase, today: now.phase === 'open' ? now.day : null, doors,
            opened: claims.length, secretOdds: SECRET_ODDS,
            secret: reveal || claims.some((c) => cards.find((x) => x.id === c.card_id)?.secret) ? cards.find((c) => c.secret) : undefined,
        };
    }

    return {
        async advent(db, body, event) {
            const user = await requireUser(db, event);
            return calendar(db, user);
        },

        async adventOpen(db, body, event) {
            const user = await requireUser(db, event);
            const now = await today(db);
            const day = Number(body.day);
            if (now.phase !== 'open') throw new HttpError(400, now.phase === 'before' ? 'Le calendrier ouvre le 1er décembre' : 'Le calendrier de l\'Avent est terminé');
            if (day !== now.day) throw new HttpError(400, day < now.day ? 'Cette case est passée : sa carte est perdue' : 'Patience, cette case n\'est pas encore ouverte');
            const cards = await eventCards(db);
            const normal = cards.find((c) => c.day === day && !c.secret);
            if (!normal) throw new HttpError(503, 'Le calendrier est en cours de préparation');
            const secretCard = day === DAYS ? cards.find((c) => c.secret) : null;
            const won = secretCard && Math.random() < 1 / SECRET_ODDS ? secretCard : normal;
            const fresh = await inTransaction(db, async (client) => {
                const { rowCount } = await client.query(
                    `INSERT INTO advent_claims (user_id, year, day, card_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                    [user.id, ADVENT_YEAR, day, won.id]);
                if (rowCount) await giveCard(client, user.id, won.id);
                return rowCount > 0;
            });
            if (!fresh) throw new HttpError(409, 'Tu as déjà ouvert la case du jour');
            const { rows: [u] } = await db.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
            return { card: { ...won, secret: undefined }, secret: won === secretCard, calendar: await calendar(db, user), user: await publicUser(db, u) };
        },
    };
}

// Schedule (every minute): once a day from PUSH_HOUR, remind the players who have not opened today's door.
export async function adventPushTick(db, notify) {
    const now = await today(db);
    if (now.phase !== 'open') return;
    const { rows: [{ h }] } = await db.query(`SELECT extract(hour FROM now() AT TIME ZONE 'Europe/Paris')::int AS h`);
    if (h < PUSH_HOUR) return;
    const { rowCount } = await db.query(`INSERT INTO advent_pushes (year, day) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ADVENT_YEAR, now.day]);
    if (!rowCount) return;
    const { rows } = await db.query(
        `SELECT DISTINCT s.user_id FROM push_subscriptions s
         WHERE NOT EXISTS (SELECT 1 FROM advent_claims a WHERE a.user_id = s.user_id AND a.year = $1 AND a.day = $2)`, [ADVENT_YEAR, now.day]);
    if (!rows.length) return;
    const message = now.day === 1
        ? { title: 'Le calendrier de l\'Avent est ouvert 🎄', body: 'Une carte de Noël t\'attend chaque jour jusqu\'au 24 décembre.' }
        : now.day === DAYS
            ? { title: 'Dernière case : le père Noël 🎅', body: 'Ouvre-la vite, une chance sur dix de l\'avoir en version secrète !' }
            : { title: `Case n°${now.day} : ta carte du jour t'attend 🎁`, body: 'Ouvre-la aujourd\'hui, sinon elle sera perdue.' };
    await notify(db, rows.map((r) => r.user_id), 'advent', { ...message, url: '/avent', tag: `advent-${now.day}` });
}
