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
    { key: 'reptile', anchors: ['Reptilia', 'Squamata', 'Testudines', 'Crocodilia', 'Amphibia'], exclude: ['Aves', 'Mammalia'], ranks: ['species'], limit: 200 },
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
    for (let attempt = 1; attempt <= 6; attempt++) {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (res?.ok) return res.json();
        if (res && res.status === 404) return null;
        await sleep((res?.status === 429 ? 20_000 : 1_500) * attempt);
    }
    return undefined; // failed: not cached, retried on the next run
}

// Batched intro + image lookup via the MediaWiki action API (20 titles per call;
// the REST summary endpoint rate-limits one-by-one lookups hard).
async function fetchSummaries(titles) {
    const out = {};
    for (let i = 0; i < titles.length; i += 20) {
        const batch = titles.slice(i, i + 20);
        const params = new URLSearchParams({
            action: 'query', format: 'json', formatversion: '2', redirects: '1',
            prop: 'extracts|pageimages|pageprops|info', exintro: '1', explaintext: '1', exsentences: '3', exlimit: '20',
            piprop: 'thumbnail|original', pithumbsize: '960', ppprop: 'disambiguation', inprop: 'url',
            titles: batch.join('|'),
        });
        const res = await getJson(`https://fr.wikipedia.org/w/api.php?${params}`);
        if (!res?.query) continue;
        const alias = new Map();
        for (const n of [...(res.query.normalized || []), ...(res.query.redirects || [])]) alias.set(n.from, n.to);
        const pages = new Map((res.query.pages || []).map((p) => [p.title, p]));
        for (const t of batch) {
            let final = t;
            for (let k = 0; k < 3 && alias.has(final); k++) final = alias.get(final);
            const p = pages.get(final);
            if (!p || p.missing) { out[t] = null; continue; }
            const thumb = p.thumbnail?.source || p.original?.source;
            out[t] = p.pageprops?.disambiguation !== undefined || !thumb || !p.extract ? null : {
                title: p.title,
                canonical: p.title.replace(/ /g, '_'),
                extract: p.extract,
                image: thumb,
                thumb: thumb.includes('/960px-') ? thumb.replace('/960px-', '/500px-') : thumb,
                url: p.fullurl,
            };
        }
        if ((i / 20) % 20 === 0) console.log(`  ${Math.min(i + 20, titles.length)}/${titles.length}`);
        await sleep(200);
    }
    return out;
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
           VALUES ?rank { ${type.ranks.map((r) => RANK[r]).join(' ')} } ?item wdt:P105 ?rank.
           ${type.exclude ? `MINUS { VALUES ?ex { ${type.exclude.map((n) => `wd:${anchorIds[n]}`).join(' ')} } ?item wdt:P171* ?ex. }` : ''}`;
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

// Popularity = fr.wikipedia page views over the last 60 days (the max the action API
// serves), batched 50 titles per call and scaled to a yearly estimate. The per-article
// REST pageviews endpoint rate-limits bulk lookups far too hard.
const VIEW_DAYS = 60;
async function fetchPageviews(titles) {
    const out = {};
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
        let cont = {};
        do { // the API returns pageviews for part of the batch, then a `continue` token
            const params = new URLSearchParams({
                action: 'query', format: 'json', formatversion: '2',
                prop: 'pageviews', pvipdays: String(VIEW_DAYS), titles: batch.join('|'), ...cont,
            });
            const res = await getJson(`https://fr.wikipedia.org/w/api.php?${params}`);
            for (const p of res?.query?.pages || []) {
                if (!p.pageviews) continue;
                const sum = Object.values(p.pageviews).reduce((a, v) => a + (v || 0), 0);
                out[p.title] = Math.round((sum * 365) / VIEW_DAYS);
            }
            cont = res?.continue || null;
            if (cont) await sleep(1_000);
        } while (cont);
        if ((i / 50) % 10 === 0) console.log(`  ${Math.min(i + 50, titles.length)}/${titles.length}`);
        await sleep(3_000);
    }
    return out;
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
    const anchorIds = await resolveAnchors(TYPES.flatMap((t) => [...(t.anchors || []), ...(t.exclude || [])]));

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
    const missing = candidates.filter((c) => !(c.qid in summaries.data));
    const byTitle = await fetchSummaries(missing.map((c) => c.title));
    for (const c of missing) if (c.title in byTitle) summaries.data[c.qid] = byTitle[c.title];
    summaries.save();

    console.log(`Fetching page views (last ${VIEW_DAYS} days)…`);
    const views = cache(`views-${new Date().toISOString().slice(0, 7)}`);
    const withSummary = candidates.filter((c) => summaries.data[c.qid]);
    const todo = withSummary.filter((c) => !(c.qid in views.data));
    const byPage = await fetchPageviews(todo.map((c) => summaries.data[c.qid].title));
    for (const c of todo) {
        const v = byPage[summaries.data[c.qid].title];
        if (v !== undefined) views.data[c.qid] = v;
    }
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
    // Drop cards that left the catalog, unless a player already owns them.
    const gone = await db.query(
        `DELETE FROM cards WHERE NOT (qid = ANY($1)) AND id NOT IN (SELECT card_id FROM user_cards) RETURNING id`,
        [cards.map((c) => c.qid)],
    );
    console.log(`Removed ${gone.rowCount} stale cards`);
    const { rows } = await db.query(`SELECT type, rarity, COUNT(*)::int AS n FROM cards GROUP BY 1, 2 ORDER BY 1, 2`);
    console.table(rows);
    await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
