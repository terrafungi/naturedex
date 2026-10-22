/**
 * Avatar: a small drawn character (skin, hair, accessory, background, t-shirt), stored as JSON on
 * the user and drawn in the browser. Free t-shirts are worn by everyone; the others are bought once
 * with pépites, and the Mécène one is worn only while the Pass Naturaliste is active.
 * The drawings themselves live in web/src/components/PlayerAvatar.jsx, keyed by the same ids.
 */
import { passActive } from './shop.mjs';

export const SHIRTS = [
    { id: 'foret', name: 'Forêt', price: 0 },
    { id: 'ciel', name: 'Ciel', price: 0 },
    { id: 'terre', name: 'Terre', price: 0 },
    { id: 'feuille', name: 'Feuille', price: 0 },
    { id: 'rayures', name: 'Marinière', price: 80 },
    { id: 'sapin', name: 'Sapin', price: 100 },
    { id: 'champignon', name: 'Amanite', price: 120 },
    { id: 'abeille', name: 'Abeille', price: 150 },
    { id: 'ocean', name: 'Océan', price: 200 },
    { id: 'papillon', name: 'Papillon', price: 200 },
    { id: 'nuit', name: 'Nuit étoilée', price: 300 },
    { id: 'aurore', name: 'Aurore boréale', price: 400 },
    { id: 'legende', name: 'Légende', price: 600 },
    { id: 'mecene', name: 'Mécène', price: 0, pass: true },
];
const SHIRT = Object.fromEntries(SHIRTS.map((s) => [s.id, s]));
const FREE = SHIRTS.filter((s) => !s.price && !s.pass).map((s) => s.id);

const OPTIONS = {
    skin: 6, hairColor: 8, bg: 6,
    hair: ['court', 'meche', 'boucles', 'long', 'chignon', 'tresses', 'rase'],
    acc: ['aucun', 'lunettes', 'casquette', 'explorateur', 'bandana', 'jumelles', 'fleur'],
};

// Without the Pass, the Mécène t-shirt falls back to a free one (in SQL for player lists).
export const AVATAR_SQL = (u) => `CASE WHEN ${u}.avatar->>'shirt' = 'mecene' AND NOT COALESCE(${u}.pass_until > now(), false)
    THEN jsonb_set(${u}.avatar, '{shirt}', '"feuille"') ELSE ${u}.avatar END`;
export const avatarOf = (user) => (user?.avatar?.shirt === 'mecene' && !passActive(user) ? { ...user.avatar, shirt: 'feuille' } : user?.avatar || null);

function clean(a, HttpError) {
    if (!a || typeof a !== 'object') throw new HttpError(400, 'Avatar invalide');
    const index = (k) => {
        const v = Number(a[k]);
        if (!Number.isInteger(v) || v < 0 || v >= OPTIONS[k]) throw new HttpError(400, 'Avatar invalide');
        return v;
    };
    const pick = (k) => {
        if (!OPTIONS[k].includes(a[k])) throw new HttpError(400, 'Avatar invalide');
        return a[k];
    };
    if (!SHIRT[a.shirt]) throw new HttpError(400, 'Ce t-shirt n\'existe pas');
    return { skin: index('skin'), hair: pick('hair'), hairColor: index('hairColor'), acc: pick('acc'), bg: index('bg'), shirt: a.shirt };
}

export function avatarActions({ requireUser, inTransaction, HttpError, publicUser }) {
    const owned = async (db, userId) => new Set([...FREE,
        ...(await db.query(`SELECT shirt FROM user_shirts WHERE user_id = $1`, [userId])).rows.map((r) => r.shirt)]);

    const state = async (db, user) => {
        const mine = await owned(db, user.id);
        const pass = passActive(user);
        return {
            avatar: avatarOf(user),
            shirts: SHIRTS.map((s) => ({ ...s, owned: s.pass ? pass : mine.has(s.id) })),
            options: OPTIONS,
        };
    };

    return {
        async avatarGet(db, body, event) {
            return state(db, await requireUser(db, event));
        },

        // { avatar } → saved; the t-shirt must be free, bought, or the Pass one while it is active
        async avatarSave(db, body, event) {
            const user = await requireUser(db, event);
            const avatar = clean(body.avatar, HttpError);
            const s = SHIRT[avatar.shirt];
            if (s.pass && !passActive(user)) throw new HttpError(403, 'Le t-shirt Mécène est réservé au Pass Naturaliste');
            if (!s.pass && !(await owned(db, user.id)).has(s.id)) throw new HttpError(402, `Achète d'abord le t-shirt ${s.name}`);
            const { rows: [fresh] } = await db.query(`UPDATE users SET avatar = $2 WHERE id = $1 RETURNING *`, [user.id, avatar]);
            return { ...(await state(db, fresh)), user: await publicUser(db, fresh) };
        },

        // { shirt } → bought once with pépites
        async avatarBuyShirt(db, body, event) {
            const user = await requireUser(db, event);
            const s = SHIRT[body.shirt];
            if (!s || !s.price) throw new HttpError(400, 'Ce t-shirt ne s\'achète pas');
            const fresh = await inTransaction(db, async (client) => {
                const { rows: [u] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
                const { rowCount } = await client.query(
                    `INSERT INTO user_shirts (user_id, shirt, price) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [u.id, s.id, s.price]);
                if (!rowCount) throw new HttpError(409, 'Tu as déjà ce t-shirt');
                if (u.nuggets < s.price) throw new HttpError(402, `Il te faut ${s.price} pépites`);
                return (await client.query(`UPDATE users SET nuggets = nuggets - $2 WHERE id = $1 RETURNING *`, [u.id, s.price])).rows[0];
            });
            return { ...(await state(db, fresh)), user: await publicUser(db, fresh) };
        },

        // { usernames: [...] } → { avatars: { name: avatar | null } }, for player lists
        async avatars(db, body, event) {
            await requireUser(db, event);
            const names = [...new Set((Array.isArray(body.usernames) ? body.usernames : []).map(String))].slice(0, 100);
            if (!names.length) return { avatars: {} };
            const { rows } = await db.query(`SELECT u.username, ${AVATAR_SQL('u')} AS avatar FROM users u WHERE u.username = ANY($1)`, [names]);
            return { avatars: Object.fromEntries(rows.map((r) => [r.username, r.avatar])) };
        },
    };
}
