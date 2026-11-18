/**
 * The Naturaliste cards of the duel (tcg.mjs TRAINERS) are also regular collection cards
 * (type 'naturalist', qid 'tcg:<key>', stats.trainer = key): they come out of boosters, can be
 * traded and recycled like any species. Stades, the first naturalists and the scientists marked `full`
 * also have a Full art, one rarity up.
 * The duel counts 't:<key>' as every naturalist card with that trainer key the player owns.
 */
import { TRAINERS } from './tcg.mjs';

export const NATURALIST = 'naturalist';
const NEXT_RARITY = { common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary', legendary: 'secret' };
const KIND_LABEL = { item: 'Objet', tool: 'Outil', stadium: 'Stade' };
const WIKI = {
    jumelles: 'Jumelles', appareil: 'Appareil_photographique', gourde: 'Gourde', boussole: 'Boussole', filet: 'Épuisette',
    trousse: 'Trousse_de_secours', loupe: 'Loupe', gilet: 'Gilet', bottes: 'Chaussure_de_marche',
    pluie: 'Pluie', secheresse: 'Sécheresse', canopee: 'Canopée', blizzard: 'Blizzard',
    darwin: 'Charles_Darwin', linne: 'Carl_von_Linné', goodall: 'Jane_Goodall', cousteau: 'Jacques-Yves_Cousteau',
    fabre: 'Jean-Henri_Fabre', carson: 'Rachel_Carson', humboldt: 'Alexander_von_Humboldt', audubon: 'Jean-Jacques_Audubon',
    buffon: 'Georges-Louis_Leclerc_de_Buffon', fossey: 'Dian_Fossey', monod: 'Théodore_Monod', maathai: 'Wangari_Muta_Maathai',
    anning: 'Mary_Anning', cuvier: 'Georges_Cuvier', lamarck: 'Jean-Baptiste_de_Lamarck', mendel: 'Gregor_Mendel', pasteur: 'Louis_Pasteur',
};

/** Every naturalist card row, regular then Full art. */
export function naturalistRows() {
    const out = [];
    for (const [key, t] of Object.entries(TRAINERS)) {
        if (t.park) continue; // the place card is the Stade
        const base = {
            name: t.name, type: NATURALIST,
            sci_name: t.kind === 'supporter' ? `${t.role || 'Naturaliste'} · ${t.years}` : KIND_LABEL[t.kind],
            image_url: t.big || t.img.replace('/330px-', '/960px-'), thumb_url: t.img,
            wiki_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(t.wiki || WIKI[key] || t.name.replace(/ /g, '_'))}`,
            stats: { trainer: key, kind: t.kind },
        };
        out.push({ ...base, qid: `tcg:${key}`, rarity: t.rarity, art: null });
        if (t.kind === 'stadium' || (t.kind === 'supporter' && (t.full || !t.fx))) out.push({ ...base, qid: `tcg:${key}:full`, rarity: NEXT_RARITY[t.rarity], art: 'full', baseQid: `tcg:${key}` });
    }
    return out;
}

let synced = false;
/** Upserts the naturalist cards (once per container): new ones get the next card numbers. */
export async function syncNaturalistCards(db) {
    if (synced) return;
    const rows = naturalistRows();
    await db.query(
        `WITH v AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS v(qid text, name text, sci_name text, type text, rarity text,
             image_url text, thumb_url text, wiki_url text, stats jsonb, art text, ord int)),
         fresh AS (SELECT v.*, (SELECT COALESCE(max(num), 0) FROM cards) + row_number() OVER (ORDER BY ord) AS num
             FROM v WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.qid = v.qid))
         INSERT INTO cards (qid, name, sci_name, type, rarity, image_url, thumb_url, wiki_url, stats, art, num, source)
         SELECT qid, name, sci_name, type, rarity, image_url, thumb_url, wiki_url, stats, art, num, 'naturedex' FROM fresh
         UNION ALL SELECT qid, name, sci_name, type, rarity, image_url, thumb_url, wiki_url, stats, art, NULL, 'naturedex' FROM v
             WHERE EXISTS (SELECT 1 FROM cards c WHERE c.qid = v.qid)
         ON CONFLICT (qid) DO UPDATE SET name = EXCLUDED.name, sci_name = EXCLUDED.sci_name, type = EXCLUDED.type, rarity = EXCLUDED.rarity,
             image_url = EXCLUDED.image_url, thumb_url = EXCLUDED.thumb_url, wiki_url = EXCLUDED.wiki_url, stats = EXCLUDED.stats, art = EXCLUDED.art`,
        [JSON.stringify(rows.map((r, ord) => ({ ...r, ord })))]);
    // the famous Parcs & jardins cards are Stades too
    const parks = Object.entries(TRAINERS).filter(([, t]) => t.park);
    await db.query(
        `UPDATE cards c SET stats = c.stats || jsonb_build_object('trainer', p.key) FROM unnest($1::text[], $2::text[]) AS p(key, qid)
         WHERE c.qid = p.qid AND c.type = 'place' AND c.stats->>'trainer' IS DISTINCT FROM p.key`,
        [parks.map(([k]) => k), parks.map(([, t]) => t.qid)]);
    await db.query(
        `UPDATE cards f SET base_id = b.id FROM cards b
         WHERE f.type = $1 AND f.art = 'full' AND b.qid = split_part(f.qid, ':full', 1) AND f.base_id IS DISTINCT FROM b.id`, [NATURALIST]);
    synced = true;
}

/** 't:<key>' -> copies owned, over the regular and Full art cards. */
export async function ownedNaturalists(db, userId) {
    const { rows } = await db.query(
        `SELECT c.stats->>'trainer' AS key, sum(uc.count)::int AS n FROM user_cards uc JOIN cards c ON c.id = uc.card_id
         WHERE uc.user_id = $1 AND uc.count > 0 AND (c.type = $2 OR c.type = 'place' AND c.stats ? 'trainer') GROUP BY 1`, [userId, NATURALIST]);
    return Object.fromEntries(rows.map((r) => [`t:${r.key}`, r.n]));
}

/** Gives the regular card of each 't:<key>' (duel rewards, starter kit). */
export async function addNaturalists(db, userId, keys) {
    keys = keys.filter((k) => !TRAINERS[k.slice(2)]?.park); // a park Stade only comes with its place card
    if (!keys.length) return;
    await db.query(
        `INSERT INTO user_cards (user_id, card_id, count)
         SELECT $1, c.id, count(*) FROM unnest($2::text[]) AS k JOIN cards c ON c.qid = 'tcg:' || substr(k, 3) GROUP BY c.id
         ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_cards.count + EXCLUDED.count`, [userId, keys]);
}
