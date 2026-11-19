/**
 * Note the lead picture of each card's Wikipedia article (the one shown at the top of the page) and whether the card
 * uses it, for the admin filter « Photo différente de Wikipédia ».
 *
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/scan-wiki-leads.mjs          # cards never checked
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/scan-wiki-leads.mjs --all    # check every card again
 *
 * Rarest cards first, 50 titles per request, one request at a time: Wikipedia answers 429 when hit faster
 * (then the script waits and retries). Stopping it is safe, the next run carries on where it stopped.
 * wiki_lead = Commons file name with spaces, '' when the article has no usable photo (none, SVG, local file).
 */
import pg from 'pg';

const ALL = process.argv.includes('--all');
const BATCH = 50;
const PAUSE = 1500;
const UA = { 'User-Agent': 'NatureDex/1.0 (https://naturedex.fr)' };
const PHOTO = /\.(jpe?g|png|webp)$/i;
const RARITY_ORDER = `CASE c.rarity WHEN 'secret' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 WHEN 'uncommon' THEN 1 ELSE 0 END`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (name) => name.replace(/_/g, ' ').trim();
// original or thumbnail URL (…/commons/thumb/a/ab/File.jpg/960px-File.jpg?utm_…) → "File.jpg"
const cardFile = (url) => {
    const m = /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(url || '');
    return m && norm(decodeURIComponent(m[1]));
};
const wikiPage = (url) => {
    const m = /^https:\/\/([a-z-]+\.wikipedia\.org)\/wiki\/(.+)$/.exec(url || '');
    return m && { host: m[1], title: norm(decodeURIComponent(m[2])) };
};

// lead file of each title (after normalisation and redirects), null when Wikipedia has no such page
async function leads(host, titles) {
    const url = `https://${host}/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=name&pilimit=50&titles=${encodeURIComponent(titles.join('|'))}`;
    for (let wait = 30_000; ; wait = Math.min(wait * 2, 600_000)) {
        const res = await fetch(url, { headers: UA }).catch(() => null);
        if (res?.ok) {
            const { query = {} } = await res.json();
            const to = new Map();
            for (const { from, to: t } of [...(query.normalized || []), ...(query.redirects || [])]) to.set(from, t);
            const pages = new Map((query.pages || []).map((p) => [p.title, p]));
            return new Map(titles.map((t) => {
                let cur = t;
                for (let i = 0; i < 3 && to.has(cur); i++) cur = to.get(cur);
                const p = pages.get(cur);
                return [t, !p || p.missing ? null : p.pageimage ? norm(p.pageimage) : ''];
            }));
        }
        console.log(`  ${res?.status || 'réseau'}: pause ${wait / 1000} s`);
        await sleep(Number(res?.headers.get('retry-after')) * 1000 || wait);
    }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query(
    `SELECT c.id, c.rarity, c.image_url, c.wiki_url FROM cards c
     WHERE c.wiki_url LIKE 'https://%.wikipedia.org/wiki/%' ${ALL ? '' : 'AND c.wiki_lead_at IS NULL'}
     ORDER BY ${RARITY_ORDER} DESC, c.num`);
console.log(`${rows.length} cartes à vérifier`);

// same article, same host: one batch per host, in rarity order
const queues = new Map();
for (const c of rows) {
    const page = wikiPage(c.wiki_url);
    if (!page) continue;
    if (!queues.has(page.host)) queues.set(page.host, []);
    queues.get(page.host).push({ ...c, title: page.title });
}
let done = 0, differs = 0;
for (const [host, cards] of queues) {
    for (let i = 0; i < cards.length; i += BATCH) {
        const batch = cards.slice(i, i + BATCH);
        const found = await leads(host, [...new Set(batch.map((c) => c.title))]);
        const values = batch.map((c) => {
            const lead = found.get(c.title);
            const usable = lead && PHOTO.test(lead) ? lead : lead === null ? null : '';
            // a card drawn by us (fan art on naturedex.fr) keeps its picture on purpose
            const own = cardFile(c.image_url);
            const diff = Boolean(usable && own && usable !== own);
            differs += diff;
            return [c.id, usable, diff];
        });
        await db.query(
            // an admin chose or kept the photo (photo_differs = false): left alone while Wikipedia keeps the same lead
            `UPDATE cards c SET wiki_lead = v.lead, wiki_lead_at = now(),
                    photo_differs = CASE WHEN c.photo_differs = false AND c.wiki_lead IS NOT DISTINCT FROM v.lead THEN false ELSE v.diff END
             FROM unnest($1::int[], $2::text[], $3::boolean[]) AS v(id, lead, diff) WHERE c.id = v.id`,
            [values.map((v) => v[0]), values.map((v) => v[1]), values.map((v) => v[2])]);
        done += batch.length;
        if (done % 1000 < BATCH) console.log(`${done}/${rows.length} · ${differs} différentes · ${batch.at(-1).rarity}`);
        await sleep(PAUSE);
    }
}
console.log(`total ${done} · ${differs} différentes`);
await db.end();
