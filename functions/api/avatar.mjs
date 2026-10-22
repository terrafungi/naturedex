/**
 * Avatar: a small drawn character (skin, hair, background) dressed with items in five slots —
 * t-shirt, hat, face, neck and a pet companion. Stored as JSON on the user and drawn in the browser.
 * Free items are worn by everyone; the others are bought once with pépites, and the Pass ones are
 * worn only while the Pass Naturaliste is active.
 * The drawings themselves live in web/src/components/PlayerAvatar.jsx, keyed by the same ids.
 */
import { passActive } from './shop.mjs';

const free = (id, name) => ({ id, name, price: 0 });
const paid = (id, name, price) => ({ id, name, price });
const pass = (id, name) => ({ id, name, price: 0, pass: true });
const theme = (name, items) => items.map((i) => ({ ...i, theme: name }));

export const ITEMS = {
    // T-shirts are grouped by theme in the editor.
    shirt: [
        ...theme('Basiques', [
            free('foret', 'Forêt'), free('ciel', 'Ciel'), free('terre', 'Terre'), paid('rayures', 'Marinière', 80),
            paid('carreaux', 'Chemise à carreaux', 120), paid('salopette', 'Salopette', 150), paid('flocons', 'Pull d\'hiver', 220),
            paid('camouflage', 'Camouflage', 250),
        ]),
        ...theme('Plantes', [
            free('feuille', 'Feuille'), paid('trefle', 'Trèfle', 80), paid('sapin', 'Sapin', 100), paid('fougere', 'Fougère', 120),
            paid('chene', 'Feuille de chêne', 120), paid('cactus', 'Cactus', 150), paid('lavande', 'Lavande', 150),
            paid('tournesol', 'Tournesol', 180), paid('monstera', 'Monstera', 200), paid('cerisier', 'Fleurs de cerisier', 250),
        ]),
        ...theme('Animaux', [
            paid('abeille', 'Abeille', 150), paid('coccinelle', 'Coccinelle', 180), paid('t_grenouille', 'Grenouille', 180),
            paid('papillon', 'Papillon', 200), paid('empreintes', 'Empreintes', 200), paid('t_herisson', 'Hérisson', 220),
            paid('ours', 'Ours', 220), paid('baleine', 'Baleine', 250), paid('t_chouette', 'Chouette', 250),
            paid('t_renard', 'Renard', 280), paid('zebre', 'Zèbre', 300), paid('leopard', 'Léopard', 300),
            paid('t_panda', 'Panda roux', 350), paid('loup', 'Loup et lune', 400),
        ]),
        ...theme('Champignons', [
            paid('champignon', 'Amanite', 120), paid('cepe', 'Cèpe', 150), paid('girolle', 'Girolles', 180),
            paid('morille', 'Morille', 220), paid('champis', 'Forêt de champignons', 350),
        ]),
        ...theme('Nature', [
            paid('ocean', 'Océan', 200), paid('montagne', 'Montagne', 200), paid('automne', 'Feuilles d\'automne', 220),
            paid('nuit', 'Nuit étoilée', 300), paid('coucher', 'Coucher de soleil', 300), paid('arcenciel', 'Arc-en-ciel', 350),
            paid('aurore', 'Aurore boréale', 400),
        ]),
        ...theme('Prestige', [paid('legende', 'Légende', 600), pass('mecene', 'Mécène')]),
    ],
    hat: [
        free('aucun', 'Aucun'), free('casquette', 'Casquette'), free('explorateur', 'Explorateur'), free('bandana', 'Bandana'),
        free('fleur', 'Fleur'), paid('bonnet', 'Bonnet', 80), paid('paille', 'Chapeau de paille', 100), paid('beret', 'Béret', 100),
        paid('bob', 'Bob', 120), paid('couronne_fleurs', 'Couronne de fleurs', 180), paid('champi', 'Chapeau champignon', 220),
        paid('renard', 'Oreilles de renard', 250), paid('sorcier', 'Chapeau de sorcier', 300), paid('couronne', 'Couronne', 600),
        pass('lauriers', 'Lauriers d\'or'),
    ],
    face: [
        free('aucun', 'Aucun'), free('lunettes', 'Lunettes'), free('rousseur', 'Taches de rousseur'),
        paid('soleil', 'Lunettes de soleil', 80), paid('moustache', 'Moustache', 120), paid('rondes', 'Lunettes dorées', 120),
        paid('monocle', 'Monocle', 150), paid('peinture', 'Peinture de feuilles', 150), paid('plongee', 'Masque de plongée', 200),
        paid('coeurs', 'Lunettes cœur', 250),
    ],
    neck: [
        free('aucun', 'Aucun'), free('jumelles', 'Jumelles'), free('foulard', 'Foulard'),
        paid('noeud', 'Nœud papillon', 100), paid('echarpe', 'Écharpe', 100), paid('loupe', 'Loupe', 120),
        paid('appareil', 'Appareil photo', 150), paid('coquillages', 'Collier de coquillages', 150), paid('medaille', 'Médaille d\'or', 400),
    ],
    pet: [
        free('aucun', 'Aucun'), free('coccinelle', 'Coccinelle'), paid('escargot', 'Escargot', 100), paid('grenouille', 'Grenouille', 150),
        paid('tortue', 'Tortue', 200), paid('herisson', 'Hérisson', 200), paid('lapin', 'Lapin', 200), paid('chat', 'Chat', 250),
        paid('ecureuil', 'Écureuil', 250), paid('chouette', 'Chouette', 300), paid('renard', 'Renardeau', 350),
        paid('panda', 'Panda roux', 500), paid('dragon', 'Dragonnet', 800), pass('faon', 'Faon'),
    ],
};
export const SLOTS = Object.keys(ITEMS);
const ITEM = Object.fromEntries(SLOTS.map((slot) => [slot, Object.fromEntries(ITEMS[slot].map((i) => [i.id, i]))]));
// What a Pass item turns into when the Pass is over.
const FALLBACK = { shirt: 'feuille', hat: 'aucun', face: 'aucun', neck: 'aucun', pet: 'aucun' };
const key = (slot, id) => `${slot}:${id}`;

const OPTIONS = {
    skin: 6, hairColor: 8, bg: 6,
    hair: ['court', 'meche', 'boucles', 'long', 'chignon', 'tresses', 'rase'],
};

// Avatars saved before the slots had a single "acc" field.
const LEGACY_ACC = { lunettes: 'face', jumelles: 'neck', casquette: 'hat', explorateur: 'hat', bandana: 'hat', fleur: 'hat' };
function upgrade(a) {
    if (!a || !('acc' in a)) return a;
    const { acc, ...rest } = a;
    const out = { hat: 'aucun', face: 'aucun', neck: 'aucun', pet: 'aucun', ...rest };
    if (LEGACY_ACC[acc]) out[LEGACY_ACC[acc]] = acc;
    return out;
}

// Without the Pass, Pass items fall back to free ones (in SQL for player lists).
const PASS_ITEMS = SLOTS.flatMap((slot) => ITEMS[slot].filter((i) => i.pass).map((i) => [slot, i.id]));
export const AVATAR_SQL = (u) => `CASE WHEN ${u}.avatar IS NULL OR COALESCE(${u}.pass_until > now(), false) THEN ${u}.avatar
    ELSE ${u}.avatar || jsonb_strip_nulls(jsonb_build_object(${PASS_ITEMS.map(([slot, id]) =>
        `'${slot}', CASE WHEN ${u}.avatar->>'${slot}' = '${id}' THEN '${FALLBACK[slot]}' END`).join(', ')})) END`;
export function avatarOf(user) {
    const a = upgrade(user?.avatar);
    if (!a || passActive(user)) return a || null;
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, ITEM[k]?.[v]?.pass ? FALLBACK[k] : v]));
}

function clean(raw, HttpError) {
    const a = upgrade(raw);
    if (!a || typeof a !== 'object') throw new HttpError(400, 'Avatar invalide');
    const index = (k) => {
        const v = Number(a[k]);
        if (!Number.isInteger(v) || v < 0 || v >= OPTIONS[k]) throw new HttpError(400, 'Avatar invalide');
        return v;
    };
    if (!OPTIONS.hair.includes(a.hair)) throw new HttpError(400, 'Avatar invalide');
    const out = { skin: index('skin'), hair: a.hair, hairColor: index('hairColor'), bg: index('bg') };
    for (const slot of SLOTS) {
        const id = a[slot] ?? FALLBACK[slot];
        if (!ITEM[slot][id]) throw new HttpError(400, 'Cet objet n\'existe pas');
        out[slot] = id;
    }
    return out;
}

export function avatarActions({ requireUser, inTransaction, HttpError, publicUser }) {
    const owned = async (db, userId) => new Set(
        (await db.query(`SELECT item FROM user_items WHERE user_id = $1`, [userId])).rows.map((r) => r.item));
    const has = (mine, user, slot, item) => (item.pass ? passActive(user) : !item.price || mine.has(key(slot, item.id)));

    const state = async (db, user) => {
        const mine = await owned(db, user.id);
        return {
            avatar: avatarOf(user),
            items: Object.fromEntries(SLOTS.map((slot) => [slot, ITEMS[slot].map((i) => ({ ...i, owned: has(mine, user, slot, i) }))])),
            options: OPTIONS,
        };
    };

    // { items: [{ slot, id }] } → all bought in one go with pépites
    async function avatarBuy(db, body, event) {
        const user = await requireUser(db, event);
        const wanted = (Array.isArray(body.items) ? body.items : []).slice(0, 20).map(({ slot, id } = {}) => {
            const item = ITEM[slot]?.[id];
            if (!item || !item.price) throw new HttpError(400, 'Cet objet ne s\'achète pas');
            return { slot, item };
        });
        if (!wanted.length) throw new HttpError(400, 'Rien à acheter');
        const fresh = await inTransaction(db, async (client) => {
            const { rows: [u] } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            let total = 0;
            for (const { slot, item } of wanted) {
                const { rowCount } = await client.query(
                    `INSERT INTO user_items (user_id, item, price) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [u.id, key(slot, item.id), item.price]);
                total += rowCount ? item.price : 0;
            }
            if (!total) throw new HttpError(409, 'Tu as déjà tout ça');
            if (u.nuggets < total) throw new HttpError(402, `Il te faut ${total} pépites`);
            return (await client.query(`UPDATE users SET nuggets = nuggets - $2 WHERE id = $1 RETURNING *`, [u.id, total])).rows[0];
        });
        return { ...(await state(db, fresh)), user: await publicUser(db, fresh) };
    }

    return {
        async avatarGet(db, body, event) {
            return state(db, await requireUser(db, event));
        },

        // { avatar } → saved; every item must be free, bought, or a Pass one while it is active
        async avatarSave(db, body, event) {
            const user = await requireUser(db, event);
            const avatar = clean(body.avatar, HttpError);
            const mine = await owned(db, user.id);
            for (const slot of SLOTS) {
                const item = ITEM[slot][avatar[slot]];
                if (item.pass && !passActive(user)) throw new HttpError(403, `${item.name} est réservé au Pass Naturaliste`);
                if (!has(mine, user, slot, item)) throw new HttpError(402, `Achète d'abord : ${item.name}`);
            }
            const { rows: [fresh] } = await db.query(`UPDATE users SET avatar = $2 WHERE id = $1 RETURNING *`, [user.id, avatar]);
            return { ...(await state(db, fresh)), user: await publicUser(db, fresh) };
        },

        avatarBuy,
        // Older clients still in a browser tab
        avatarBuyShirt: (db, body, event) => avatarBuy(db, { items: [{ slot: 'shirt', id: body.shirt }] }, event),

        // { usernames: [...] } → { avatars: { name: avatar | null } }, for player lists
        async avatars(db, body, event) {
            await requireUser(db, event);
            const names = [...new Set((Array.isArray(body.usernames) ? body.usernames : []).map(String))].slice(0, 100);
            if (!names.length) return { avatars: {} };
            const { rows } = await db.query(`SELECT u.username, ${AVATAR_SQL('u')} AS avatar FROM users u WHERE u.username = ANY($1)`, [names]);
            return { avatars: Object.fromEntries(rows.map((r) => [r.username, upgrade(r.avatar)])) };
        },
    };
}
