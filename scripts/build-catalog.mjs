/**
 * Build the NaturDex card catalog from Wikidata + Wikipedia (fr) and upsert it into Postgres.
 *
 *   cd scripts && npm install
 *   DATABASE_URL="$(openkbs postgres connection --libpq)" node build-catalog.mjs
 *
 * Rarity = popularity: page views of the fr.wikipedia article over the last 12 months,
 * ranked by percentile inside each card type (every type gets its own legendaries).
 * Network responses are cached in scripts/.cache so re-runs are cheap.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const UA = 'NaturDex/0.1 (OpenKBS card game; contact via openkbs.com)';
// QLever: same Wikidata data as query.wikidata.org, but handles deep taxonomy traversals in seconds.
const SPARQL = 'https://qlever.dev/api/wikidata';
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/> PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/>`;
const CACHE_DIR = path.join(import.meta.dirname, '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const RANK = { species: 'wd:Q7432', genus: 'wd:Q34740', strain: 'wd:Q855769' };

// Order = priority: an item matching several types keeps the first one.
// `limit` = number of cards kept per type (the best-known taxa by sitelinks).
const TYPES = [
    { key: 'fossil', fossilTaxon: true, limit: 240 },
    { key: 'virus', anchors: ['Riboviria', 'Duplodnaviria', 'Monodnaviria', 'Varidnaviria'], ranks: ['species', 'genus', 'strain'], limit: 150 },
    { key: 'bacteria', anchors: ['Bacteria', 'Archaea'], ranks: ['species', 'genus'], limit: 180 },
    { key: 'mold', anchors: ['Penicillium', 'Aspergillus', 'Mucor', 'Rhizopus', 'Botrytis', 'Fusarium', 'Alternaria', 'Cladosporium', 'Stachybotrys', 'Trichoderma', 'Neurospora', 'Erysiphe', 'Plasmopara', 'Phytophthora', 'Saccharomyces', 'Candida', 'Claviceps', 'Physarum'], ranks: ['species', 'genus'], limit: 120 },
    { key: 'fungus', anchors: ['Agaricomycetes', 'Pezizomycotina'], ranks: ['species', 'genus'], limit: 200 },
    { key: 'alga', anchors: ['Rhodophyta', 'Chlorophyta', 'Phaeophyceae', 'Bacillariophyta', 'Charophyceae'], ranks: ['species', 'genus'], limit: 140 },
    { key: 'tree', anchors: ['Pinophyta', 'Ginkgo', 'Arecaceae', 'Quercus', 'Acer', 'Fagus', 'Betula', 'Fraxinus', 'Tilia', 'Ulmus', 'Populus', 'Castanea', 'Juglans', 'Eucalyptus', 'Adansonia', 'Magnolia', 'Platanus', 'Carpinus', 'Alnus', 'Sorbus', 'Olea', 'Ceiba', 'Tectona', 'Swietenia', 'Ficus', 'Salix', 'Aesculus', 'Robinia', 'Prunus', 'Malus', 'Citrus', 'Mangifera', 'Cinnamomum', 'Theobroma', 'Coffea', 'Hevea', 'Liriodendron', 'Dracaena', 'Ceratonia'], ranks: ['species'], limit: 200 },
    { key: 'plant', anchors: ['Angiospermae', 'Magnoliophyta', 'Polypodiopsida', 'Bryophyta', 'Lycopodiopsida'], ranks: ['species'], limit: 260 },
    { key: 'mammal', anchors: ['Mammalia'], ranks: ['species'], limit: 260 },
    { key: 'bird', anchors: ['Aves'], ranks: ['species'], limit: 240 },
    { key: 'reptile', anchors: ['Reptilia', 'Squamata', 'Testudines', 'Crocodilia', 'Amphibia'], ranks: ['species'], limit: 200 },
    { key: 'fish', anchors: ['Actinopterygii', 'Chondrichthyes', 'Coelacanthiformes'], ranks: ['species'], limit: 200 },
    { key: 'arthropod', anchors: ['Insecta', 'Arachnida', 'Myriapoda'], ranks: ['species'], limit: 240 },
    { key: 'marine', anchors: ['Cephalopoda', 'Bivalvia', 'Cnidaria', 'Echinodermata', 'Porifera', 'Decapoda'], ranks: ['species', 'genus'], limit: 180 },
];

const IUCN = {
    Q211005: 'LC', Q719675: 'NT', Q278113: 'VU', Q11394: 'EN', Q219127: 'CR',
    Q239509: 'EW', Q237350: 'EX', Q3245245: 'DD',
};

// ---------- helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cache(name) {
    const file = path.join(CACHE_DIR, `${name}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return { data, save: () => fs.writeFileSync(file, JSON.stringify(data)) };
}

async function sparql(query, { timeoutMs = 65_000 } = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(SPARQL, {
                method: 'POST',
                headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ query: `${PREFIXES}\n${query}` }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status === 429) { await sleep(10_000 * attempt); continue; }
            if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
            return (await res.json()).results.bindings;
        } catch (err) {
            if (attempt === 3) throw err;
            await sleep(3_000 * attempt);
        }
    }
}

async function getJson(url) {
    for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (res?.ok) return res.json();
        if (res && res.status === 404) return null;
        await sleep(1_500 * attempt);
    }
    return null;
}

async function pool(items, concurrency, fn) {
    let i = 0, done = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
        while (i < items.length) {
            const item = items[i++];
            await fn(item);
            if (++done % 100 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
        }
    }));
}

const qidOf = (uri) => uri.split('/').pop();

// ---------- steps ----------

async function resolveAnchors(names) {
    const values = [...new Set(names)].map((n) => JSON.stringify(n)).join(' ');
    const rows = await sparql(`SELECT ?n ?q ?sl WHERE { VALUES ?n { ${values} } ?q wdt:P225 ?n; wikibase:sitelinks ?sl. }`);
    // Several taxa can share a name (homonyms across kingdoms): keep the best-known one.
    const best = {};
    for (const r of rows) {
        const sl = Number(r.sl.value);
        if (!best[r.n.value] || sl > best[r.n.value].sl) best[r.n.value] = { q: qidOf(r.q.value), sl };
    }
    const missing = names.filter((n) => !best[n]);
    if (missing.length) console.warn(`  ! anchors not found: ${missing.join(', ')}`);
    return Object.fromEntries(Object.entries(best).map(([n, v]) => [n, v.q]));
}

// Over-fetch so a type still fills its quota after higher-priority types claimed some items.
async function fetchType(type, anchorIds) {
    const taxonClause = type.fossilTaxon
        ? '?item wdt:P31 wd:Q23038290.'
        : `VALUES ?anchor { ${type.anchors.map((n) => anchorIds[n]).filter(Boolean).map((q) => `wd:${q}`).join(' ')} }
           ?item wdt:P171* ?anchor.
           VALUES ?rank { ${type.ranks.map((r) => RANK[r]).join(' ')} } ?item wdt:P105 ?rank.`;
    const rows = await sparql(`SELECT DISTINCT ?item ?title ?sl WHERE {
        ${taxonClause}
        ?item wikibase:sitelinks ?sl.
        ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?title.
    } ORDER BY DESC(?sl) LIMIT ${type.limit * 3}`);
    return rows.map((r) => ({ qid: qidOf(r.item.value), title: r.title.value, sitelinks: Number(r.sl.value) }));
}

async function fetchDetails(qids) {
    const out = {};
    for (let i = 0; i < qids.length; i += 150) {
        const values = qids.slice(i, i + 150).map((q) => `wd:${q}`).join(' ');
        const rows = await sparql(`SELECT ?item (SAMPLE(?sci0) AS ?sci) (SAMPLE(?iucn0) AS ?iucn)
                (MAX(?mass0) AS ?mass) (MAX(?len0) AS ?len) (MAX(?height0) AS ?height) WHERE {
            VALUES ?item { ${values} }
            OPTIONAL { ?item wdt:P225 ?sci0. }
            OPTIONAL { ?item wdt:P141 ?iucn0. }
            OPTIONAL { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?mass0. }
            OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?len0. }
            OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?height0. }
        } GROUP BY ?item`);
        for (const r of rows) {
            out[qidOf(r.item.value)] = {
                sci: r.sci?.value || null,
                iucn: r.iucn ? IUCN[qidOf(r.iucn.value)] || null : null,
                mass: r.mass ? Number(r.mass.value) : null,
                length: r.len ? Number(r.len.value) : null,
                height: r.height ? Number(r.height.value) : null,
            };
        }
    }
    return out;
}

// Wikimedia only serves a fixed set of thumbnail widths.
function sizedImage(summary, width) {
    const orig = summary.originalimage;
    if (orig && orig.width <= width) return orig.source;
    const thumb = summary.thumbnail?.source;
    return thumb ? thumb.replace(/\/\d+px-/, `/${width}px-`) : orig?.source;
}

function viewsRange() {
    const end = new Date();
    end.setUTCDate(0); // last day of previous month
    const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
    const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
    return [fmt(start), fmt(end)];
}

function hpFor(views, rarity) {
    const bonus = { common: 0, uncommon: 10, rare: 20, epic: 40, legendary: 60 }[rarity];
    const base = Math.round((30 + 22 * Math.log10(views + 1)) / 10) * 10;
    return Math.min(260, Math.max(30, base + bonus));
}

function assignRarity(cards) {
    const byType = {};
    for (const c of cards) (byType[c.type] ||= []).push(c);
    for (const list of Object.values(byType)) {
        list.sort((a, b) => b.views - a.views);
        const n = list.length;
        const cut = {
            legendary: Math.max(1, Math.round(n * 0.01)),
            epic: Math.max(2, Math.round(n * 0.06)),
            rare: Math.round(n * 0.20),
            uncommon: Math.round(n * 0.50),
        };
        list.forEach((c, i) => {
            c.rarity = i < cut.legendary ? 'legendary' : i < cut.epic ? 'epic' : i < cut.rare ? 'rare' : i < cut.uncommon ? 'uncommon' : 'common';
        });
    }
}

// ---------- main ----------

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

    console.log('Resolving taxon anchors…');
    const anchorIds = await resolveAnchors(TYPES.flatMap((t) => t.anchors || []));

    console.log('Querying Wikidata per type…');
    const seen = new Map();
    for (const type of TYPES) {
        const items = await fetchType(type, anchorIds);
        let added = 0;
        for (const it of items) {
            if (seen.has(it.qid)) continue;
            if (added >= type.limit) break;
            seen.set(it.qid, { ...it, type: type.key });
            added++;
        }
        console.log(`  ${type.key}: ${items.length} found, ${added} new`);
        await sleep(500);
    }
    const candidates = [...seen.values()];

    console.log(`Fetching Wikidata details for ${candidates.length} items…`);
    const details = await fetchDetails(candidates.map((c) => c.qid));

    console.log('Fetching Wikipedia summaries…');
    const summaries = cache('summaries');
    await pool(candidates.filter((c) => !(c.qid in summaries.data)), 8, async (c) => {
        const s = await getJson(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c.title.replace(/ /g, '_'))}`);
        summaries.data[c.qid] = s && s.type !== 'disambiguation' && s.thumbnail ? {
            title: s.title,
            canonical: s.titles?.canonical || s.title.replace(/ /g, '_'),
            extract: s.extract,
            image: sizedImage(s, 960),
            thumb: sizedImage(s, 500),
            url: s.content_urls?.desktop?.page,
        } : null;
    });
    summaries.save();

    const [from, to] = viewsRange();
    console.log(`Fetching page views ${from}→${to}…`);
    const views = cache(`views-${from}-${to}`);
    const withSummary = candidates.filter((c) => summaries.data[c.qid]);
    await pool(withSummary.filter((c) => !(c.qid in views.data)), 8, async (c) => {
        const article = encodeURIComponent(summaries.data[c.qid].canonical);
        const res = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${article}/monthly/${from}/${to}`);
        views.data[c.qid] = (res?.items || []).reduce((sum, m) => sum + m.views, 0);
    });
    views.save();

    const cards = withSummary.map((c) => {
        const s = summaries.data[c.qid];
        const d = details[c.qid] || {};
        return {
            qid: c.qid, type: c.type, name: s.title, sci_name: d.sci, iucn: d.iucn,
            views: views.data[c.qid] || 0, image_url: s.image, thumb_url: s.thumb,
            extract: s.extract, wiki_url: s.url,
            stats: { sitelinks: c.sitelinks, mass_kg: d.mass, length_m: d.length, height_m: d.height },
        };
    });
    assignRarity(cards);
    for (const c of cards) c.stats.hp = hpFor(c.views, c.rarity);

    console.log(`Upserting ${cards.length} cards…`);
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(fs.readFileSync(path.join(import.meta.dirname, '../functions/api/schema.sql'), 'utf8'));
    for (const c of cards) {
        await db.query(
            `INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, extract, wiki_url, iucn, stats)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (qid) DO UPDATE SET name=$2, sci_name=$3, type=$4, rarity=$5, views=$6, image_url=$7,
                thumb_url=$8, extract=$9, wiki_url=$10, iucn=$11, stats=$12`,
            [c.qid, c.name, c.sci_name, c.type, c.rarity, c.views, c.image_url, c.thumb_url, c.extract, c.wiki_url, c.iucn, c.stats],
        );
    }
    const { rows } = await db.query(`SELECT type, rarity, COUNT(*)::int AS n FROM cards GROUP BY 1, 2 ORDER BY 1, 2`);
    console.table(rows);
    await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
