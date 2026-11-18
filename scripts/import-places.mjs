/**
 * Add remarkable natural places to the NaturDex catalog, one card type per set:
 * - place ("Parcs & jardins"): national parks, botanical gardens, French "Jardins remarquables",
 *   French regional natural parks and natural UNESCO World Heritage sites;
 * - water ("Mers & rivières", --set=water): oceans, seas, fleuves and rivières.
 *
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/import-places.mjs [--set=water]          # preview only
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/import-places.mjs [--set=water] --apply  # write the cards
 *
 * Candidates: Wikidata items with a fr.wikipedia article and a Commons photo (P18).
 * - Popularity: fr.wikipedia views of the last 60 days x 365/60, like import-minerals.mjs.
 * - Rarity: same percentiles as build-catalog.mjs inside the type, the 3 most read become secret cards.
 * - Scientific line: "<kind> · <country>" (e.g. "Parc national · Canada").
 * - stats.place = kind key, stats.area_km2 (stats.length_km for rivers) when Wikidata has it.
 * New cards get source = 'place' (build-catalog.mjs leaves them alone) and numbers after the current last card.
 */
import pg from 'pg';
import { sleep, sparql, commonsImage, qidOf, hpFor } from './build-catalog.mjs';
import { fetchFrViews, viewsCache, fetchRedirects, redirectCache } from './import-minerals.mjs';

const APPLY = process.argv.includes('--apply');
const SET = process.argv.find((a) => a.startsWith('--set='))?.slice(6) || 'place';
const SECRETS = 3;

// First kind wins when an item matches several (a botanical garden labelled "Jardin remarquable" is a Jardin remarquable).
const PLACE_KINDS = [
    ['remarkable', 'Jardin remarquable', '?item wdt:P1435 wd:Q498842.'],
    ['botanical', 'Jardin botanique', '?item wdt:P31/wdt:P279* wd:Q167346.'],
    ['regional', 'Parc naturel régional', '?item wdt:P31 wd:Q1818761.'],
    ['national', 'Parc national', '?item wdt:P31/wdt:P279* wd:Q46169.'],
    // natural World Heritage sites only: criteria (vii) to (x)
    ['unesco', 'Patrimoine mondial', '?item wdt:P1435 wd:Q9259; wdt:P2614 ?crit. VALUES ?crit { wd:Q23038981 wd:Q23038983 wd:Q23038985 wd:Q23038986 }'],
];

// A fleuve flows into a sea or an ocean (or one of their gulfs and bays), a rivière into another river or a lake.
const TO_SEA = '?mouth wdt:P31/wdt:P279* ?sea. VALUES ?sea { wd:Q165 wd:Q9430 wd:Q1322134 wd:Q39594 }';
const KNOWN_RIVER = 'FILTER(?sl0 >= 20 || EXISTS { ?item wdt:P17 wd:Q142 } && ?sl0 >= 8)'; // famous worldwide, or French
const WATER_KINDS = [
    ['ocean', 'Océan', '?item wdt:P31 wd:Q9430.'],
    ['sea', 'Mer', '?item wdt:P31/wdt:P279* wd:Q165.'],
    ['fleuve', 'Fleuve', `{ ?item wdt:P31 wd:Q573344. } UNION { ?item wdt:P31 wd:Q4022; wdt:P403 ?mouth. ${TO_SEA} } ${KNOWN_RIVER}`],
    ['river', 'Rivière', `?item wdt:P31 wd:Q4022. ${KNOWN_RIVER}`],
];
const SETS = { place: PLACE_KINDS, water: WATER_KINDS };
const KINDS = SETS[SET];

// fr.wikipedia titles that are lists or umbrella articles, or whose article is about a building, a museum
// or a zoo rather than the garden (many "Jardins remarquables" are château or abbey grounds).
const EXCLUDE = /^(Liste |Parcs nationaux |Réseau |Château |Abbaye |Prieuré |Manoir |Musée |Muséum |Hôtel |Pairi Daiza)/;

async function fetchCandidates() {
    const out = new Map();
    for (const [kind, label, clause] of KINDS) {
        const rows = await sparql(`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?item (SAMPLE(?title0) AS ?title) (SAMPLE(?sl0) AS ?sl) (SAMPLE(?img0) AS ?img) (SAMPLE(?cl0) AS ?country) (COUNT(DISTINCT ?c) AS ?nc) (SAMPLE(?area0) AS ?area) (MAX(?len0) AS ?len) WHERE {
            ${clause}
            ?item wdt:P18 ?img0; wikibase:sitelinks ?sl0.
            ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?title0.
            OPTIONAL { ?item wdt:P17 ?c. ?c rdfs:label ?cl0. FILTER(LANG(?cl0) = "fr") }
            OPTIONAL { ?item p:P2046/psn:P2046/wikibase:quantityAmount ?area0. }
            OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?len0. }
        } GROUP BY ?item`, { timeoutMs: 180_000 });
        let added = 0;
        for (const r of rows) {
            const qid = qidOf(r.item.value);
            const title = r.title.value;
            if (out.has(qid) || EXCLUDE.test(title)) continue;
            const area = r.area ? Number(r.area.value) / 1e6 : null; // normalized value is in m²
            out.set(qid, {
                qid, title, kind, label, sitelinks: Number(r.sl.value),
                image: decodeURIComponent(r.img.value.split('/Special:FilePath/').pop()),
                country: Number(r.nc?.value) === 1 ? r.country?.value || null : null, // a river or sea across borders: no country
                area: area && area < 1e9 ? Math.round(area * 100) / 100 : null,
                length: r.len ? Math.round(Number(r.len.value) / 1000) : null, // normalized value is in m
            });
            added++;
        }
        console.log(`  ${kind}: ${rows.length} found, ${added} kept`);
        await sleep(500);
    }
    return [...out.values()];
}

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const { rows: existing } = await db.query(`SELECT qid FROM cards`);
    const known = new Set(existing.map((r) => r.qid));

    console.log('Querying Wikidata…');
    let candidates = (await fetchCandidates()).filter((c) => !known.has(c.qid) && commonsImage(c.image));
    await fetchRedirects(candidates.map((c) => c.title));
    candidates = candidates.filter((c) => !redirectCache.data[c.title]);
    console.log(`${candidates.length} new candidates`);

    console.log('Fetching fr.wikipedia views…');
    await fetchFrViews(candidates.map((c) => c.title));

    const cards = candidates.map((c) => {
        const img = commonsImage(c.image);
        const key = c.title.replace(/ /g, '_');
        return {
            qid: c.qid, name: c.title.replace(/ \([^)]*\)$/, ''), sci_name: [c.label, c.country].filter(Boolean).join(' · '), type: SET,
            views: viewsCache.data[c.title] || 0, image_url: img.image, thumb_url: img.thumb,
            wiki_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(key)}`,
            stats: { sitelinks: c.sitelinks, place: c.kind, area_km2: c.kind === 'river' || c.kind === 'fleuve' ? null : c.area, length_km: c.length || null, mass_kg: null, length_m: null, height_m: null },
            kind: c.kind,
        };
    }).sort((a, b) => b.views - a.views || b.stats.sitelinks - a.stats.sitelinks);

    // Same cuts as build-catalog.mjs assignRarity, inside the type.
    const n = cards.length;
    const cut = { legendary: Math.max(1, Math.round(n * 0.01)), epic: Math.max(2, Math.round(n * 0.06)), rare: Math.round(n * 0.20), uncommon: Math.round(n * 0.50) };
    cards.forEach((c, i) => {
        c.rarity = i < SECRETS ? 'secret' : i < cut.legendary ? 'legendary' : i < cut.epic ? 'epic' : i < cut.rare ? 'rare' : i < cut.uncommon ? 'uncommon' : 'common';
        c.stats.hp = hpFor(c.views, c.rarity);
    });

    const table = {};
    for (const c of cards) (table[c.kind] ||= { total: 0 }), table[c.kind].total++, table[c.kind][c.rarity] = (table[c.kind][c.rarity] || 0) + 1;
    console.table(table);
    for (const r of ['secret', 'legendary', 'epic']) console.log(`${r}: ${cards.filter((c) => c.rarity === r).map((c) => `${c.name} (${c.views})`).join(', ')}`);
    console.log(`sample commons: ${cards.slice(-8).map((c) => `${c.name} [${c.sci_name}] (${c.views})`).join(', ')}`);

    if (!APPLY) { console.log('Preview only: re-run with --apply to write the cards.'); await db.end(); return; }

    const { rows: [{ last }] } = await db.query(`SELECT COALESCE(MAX(num), 0)::int AS last FROM cards`);
    cards.forEach((c, i) => { c.num = last + i + 1; });
    let inserted = 0;
    for (let i = 0; i < cards.length; i += 500) {
        const batch = cards.slice(i, i + 500);
        const col = (k) => batch.map((c) => c[k]);
        const res = await db.query(
            `INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, wiki_url, stats, num, source)
             SELECT *, 'place' FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[],
                                  $8::text[], $9::text[], $10::jsonb[], $11::int[])
             ON CONFLICT (qid) DO NOTHING`,
            [col('qid'), col('name'), col('sci_name'), col('type'), col('rarity'), col('views'), col('image_url'),
             col('thumb_url'), col('wiki_url'), batch.map((c) => JSON.stringify(c.stats)), col('num')],
        );
        inserted += res.rowCount;
    }
    const { rows: [{ total }] } = await db.query(`SELECT COUNT(*)::int AS total FROM cards`);
    console.log(`Inserted ${inserted} cards — catalog now ${total} cards`);
    await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
