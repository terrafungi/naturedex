/**
 * Build the NaturDex card catalog from Wikidata + Wikipedia (fr) and upsert it into Postgres.
 *
 *   cd scripts && npm install
 *   DATABASE_URL="$(openkbs postgres connection --libpq)" node build-catalog.mjs
 *
 * Everything comes from bulk sources (the per-page Wikipedia API rate-limits 100k+ lookups):
 * - taxa, fr.wikipedia titles and images (Wikidata P18) from QLever SPARQL;
 * - popularity from the monthly Wikimedia pageview dump, pre-filtered to fr.wikipedia:
 *     curl -s https://dumps.wikimedia.org/other/pageview_complete/monthly/YYYY/YYYY-MM/pageviews-YYYYMM-user.bz2 \
 *       | bzip2 -dc | LC_ALL=C awk '$1=="fr.wikipedia"{print $2" "$5; s=1; next} s{exit}' > /tmp/fr-views.txt
 *   then pass VIEWS_FILE=/tmp/fr-views-07.txt,/tmp/fr-views-08.txt,... (averaged, x12 = yearly estimate).
 * Article intros are fetched lazily by the API the first time a card is looked at.
 *
 * Rarity = popularity, ranked by percentile inside each card type (every type gets its own legendaries).
 * The most famous species become secret cards: the top SECRETS_PER_TYPE of each type, topped up
 * to SECRET_COUNT with the next most read ones overall.
 * Wikidata responses are cached in scripts/.cache so re-runs are cheap.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

export const UA = 'NaturDex/0.1 (OpenKBS card game; contact via openkbs.com)';
// QLever: same Wikidata data as query.wikidata.org, but handles deep taxonomy traversals in seconds.
const SPARQL = 'https://qlever.dev/api/wikidata';
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/> PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/>`;
const CACHE_DIR = path.join(import.meta.dirname, '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

export const RANK = { species: 'wd:Q7432', genus: 'wd:Q34740', strain: 'wd:Q855769' };

// Order = priority: an item matching several types keeps the first one.
// No quota: every taxon with a fr.wikipedia article (and, later, a lead image) becomes a card.
export const TYPES = [
    { key: 'fossil', fossilTaxon: true },
    { key: 'virus', anchors: ['Riboviria', 'Duplodnaviria', 'Monodnaviria', 'Varidnaviria', 'Adnaviria', 'Ribozyviria'], ranks: ['species', 'genus', 'strain'] },
    { key: 'bacteria', anchors: ['Bacteria', 'Archaea'], ranks: ['species', 'genus'] },
    { key: 'mold', anchors: ['Penicillium', 'Aspergillus', 'Mucor', 'Rhizopus', 'Botrytis', 'Fusarium', 'Alternaria', 'Cladosporium', 'Stachybotrys', 'Trichoderma', 'Neurospora', 'Erysiphe', 'Plasmopara', 'Phytophthora', 'Saccharomyces', 'Candida', 'Claviceps', 'Physarum', 'Saccharomycetes', 'Myxogastria', 'Mucorales', 'Erysiphales', 'Peronosporales'], ranks: ['species', 'genus'] },
    { key: 'fungus', anchors: ['Fungi'], ranks: ['species', 'genus'] },
    { key: 'alga', anchors: ['Rhodophyta', 'Chlorophyta', 'Phaeophyceae', 'Bacillariophyta', 'Charophyceae', 'Dinoflagellata', 'Ulvophyceae', 'Zygnematophyceae'], ranks: ['species', 'genus'] },
    { key: 'tree', anchors: ['Pinophyta', 'Ginkgo', 'Arecaceae', 'Quercus', 'Acer', 'Fagus', 'Betula', 'Fraxinus', 'Tilia', 'Ulmus', 'Populus', 'Castanea', 'Juglans', 'Eucalyptus', 'Adansonia', 'Magnolia', 'Platanus', 'Carpinus', 'Alnus', 'Sorbus', 'Olea', 'Ceiba', 'Tectona', 'Swietenia', 'Ficus', 'Salix', 'Aesculus', 'Robinia', 'Prunus', 'Malus', 'Pyrus', 'Citrus', 'Mangifera', 'Cinnamomum', 'Theobroma', 'Coffea', 'Hevea', 'Liriodendron', 'Dracaena', 'Ceratonia', 'Acacia', 'Shorea', 'Dipterocarpus', 'Terminalia', 'Diospyros', 'Corymbia', 'Cecropia', 'Bombax', 'Cycadopsida'], ranks: ['species'] },
    { key: 'plant', anchors: ['Plantae'], ranks: ['species'] },
    { key: 'mammal', anchors: ['Mammalia'], ranks: ['species'] },
    { key: 'bird', anchors: ['Aves'], ranks: ['species'] },
    { key: 'reptile', anchors: ['Reptilia', 'Squamata', 'Testudines', 'Crocodilia', 'Amphibia'], ranks: ['species'] },
    { key: 'fish', anchors: ['Actinopterygii', 'Chondrichthyes', 'Coelacanthiformes', 'Dipnoi', 'Petromyzontiformes', 'Myxini'], ranks: ['species'] },
    { key: 'arthropod', anchors: ['Insecta', 'Arachnida', 'Myriapoda', 'Entognatha', 'Merostomata'], ranks: ['species'] },
    // Land-dwelling small animals: land snails and slugs, earthworms, woodlice, land crabs.
    { key: 'terrestrial', anchors: ['Stylommatophora', 'Veronicellidae', 'Rathouisiidae', 'Cyclophoroidea', 'Helicinidae', 'Pomatiidae', 'Aciculidae', 'Diplommatinidae', 'Carychium', 'Zospeum', 'Crassiclitellata', 'Lumbricidae', 'Eudrilidae', 'Enchytraeidae', 'Oniscidea', 'Gecarcinidae', 'Coenobitidae'], ranks: ['species', 'genus'] },
    { key: 'aquatic', anchors: ['Mollusca'], ranks: ['species', 'genus'] },
    { key: 'marine', anchors: ['Cnidaria', 'Echinodermata', 'Porifera', 'Crustacea', 'Annelida', 'Ctenophora', 'Tunicata', 'Bryozoa', 'Brachiopoda'], ranks: ['species', 'genus'] },
];

export const IUCN = {
    Q211005: 'LC', Q719675: 'NT', Q278113: 'VU', Q11394: 'EN', Q219127: 'CR',
    Q239509: 'EW', Q237350: 'EX', Q3245245: 'DD',
};

// ---------- helpers ----------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function cache(name) {
    const file = path.join(CACHE_DIR, `${name}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return { data, save: () => fs.writeFileSync(file, JSON.stringify(data)) };
}

export async function sparql(query, { timeoutMs = 65_000 } = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(SPARQL, {
                method: 'POST',
                headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ query: `${PREFIXES}\n${query}` }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status === 429) { if (attempt === 3) throw new Error("SPARQL HTTP 429"); await sleep(10_000 * attempt); continue; }
            if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
            return (await res.json()).results.bindings;
        } catch (err) {
            if (attempt === 3) throw err;
            await sleep(3_000 * attempt);
        }
    }
}

// Commons file name -> direct upload.wikimedia.org URLs (original + 500px thumbnail).
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg)$/i;
export function commonsImage(file) {
    if (!file || !IMAGE_EXT.test(file)) return null;
    const name = file.replace(/ /g, '_');
    const hash = crypto.createHash('md5').update(name).digest('hex');
    const enc = encodeURIComponent(name);
    const dir = `${hash[0]}/${hash.slice(0, 2)}`;
    return {
        image: `https://upload.wikimedia.org/wikipedia/commons/${dir}/${enc}`,
        thumb: `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${enc}/500px-${enc}${/\.svg$/i.test(name) ? '.png' : ''}`,
    };
}

// fr.wikipedia title -> yearly views estimate, from pre-filtered monthly dumps (see header).
// Several months smooth out one-off spikes (news, bots).
async function loadViews(files) {
    const views = new Map();
    for (const file of files) {
        const rl = readline.createInterface({ input: fs.createReadStream(file) });
        for await (const line of rl) {
            const sp = line.lastIndexOf(' ');
            const title = line.slice(0, sp);
            views.set(title, (views.get(title) || 0) + Number(line.slice(sp + 1)));
        }
    }
    for (const [t, v] of views) views.set(t, Math.round((v * 12) / files.length));
    return views;
}

export const qidOf = (uri) => uri.split('/').pop();

// ---------- steps ----------

export async function resolveAnchors(names) {
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

async function fetchType(type, anchorIds) {
    const taxonClause = type.fossilTaxon
        ? '?item wdt:P31 wd:Q23038290.'
        : `VALUES ?anchor { ${type.anchors.map((n) => anchorIds[n]).filter(Boolean).map((q) => `wd:${q}`).join(' ')} }
           ?item wdt:P171* ?anchor.
           VALUES ?rank { ${type.ranks.map((r) => RANK[r]).join(' ')} } ?item wdt:P105 ?rank.
           ${type.exclude ? `MINUS { VALUES ?ex { ${type.exclude.map((n) => `wd:${anchorIds[n]}`).join(' ')} } ?item wdt:P171* ?ex. }` : ''}`;
    const rows = await sparql(`SELECT ?item (SAMPLE(?title0) AS ?title) (SAMPLE(?sl0) AS ?sl) (SAMPLE(?img0) AS ?img) WHERE {
        ${taxonClause}
        ?item wikibase:sitelinks ?sl0.
        ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?title0.
        OPTIONAL { ?item wdt:P18 ?img0. }
    } GROUP BY ?item LIMIT 400000`, { timeoutMs: 180_000 });
    return rows.map((r) => ({
        qid: qidOf(r.item.value), title: r.title.value, sitelinks: Number(r.sl.value),
        image: r.img ? decodeURIComponent(r.img.value.split('/Special:FilePath/').pop()) : null,
    }));
}

async function fetchDetails(qids, out = {}) {
    for (let i = 0; i < qids.length; i += 400) {
        if (i % 8000 === 0) console.log(`  ${i}/${qids.length}`);
        const values = qids.slice(i, i + 400).map((q) => `wd:${q}`).join(' ');
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

export function hpFor(views, rarity) {
    const bonus = { common: 0, uncommon: 10, rare: 20, epic: 40, legendary: 60, secret: 80 }[rarity];
    const base = Math.round((30 + 22 * Math.log10(views + 1)) / 10) * 10;
    return Math.min(rarity === 'secret' ? 300 : 260, Math.max(30, base + bonus));
}

const SECRET_COUNT = 50;
const SECRETS_PER_TYPE = 3;

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
    const secrets = new Set(Object.values(byType).flatMap((list) => list.slice(0, SECRETS_PER_TYPE)));
    const rest = cards.filter((c) => !secrets.has(c)).sort((a, b) => b.views - a.views);
    for (const c of rest.slice(0, SECRET_COUNT - secrets.size)) secrets.add(c);
    for (const c of secrets) c.rarity = 'secret';
}

// ---------- main ----------

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    if (!process.env.VIEWS_FILE) throw new Error('VIEWS_FILE is required (see header)');

    console.log('Resolving taxon anchors…');
    const anchorIds = await resolveAnchors(TYPES.flatMap((t) => [...(t.anchors || []), ...(t.exclude || [])]));

    console.log('Querying Wikidata per type…');
    const seen = new Map();
    for (const type of TYPES) {
        const items = await fetchType(type, anchorIds);
        let added = 0;
        for (const it of items) {
            if (seen.has(it.qid)) continue;
            seen.set(it.qid, { ...it, type: type.key });
            added++;
        }
        console.log(`  ${type.key}: ${items.length} found, ${added} new`);
        await sleep(500);
    }
    const candidates = [...seen.values()];

    console.log(`Fetching Wikidata details for ${candidates.length} items…`);
    const detailsCache = cache('details');
    await fetchDetails(candidates.map((c) => c.qid).filter((q) => !(q in detailsCache.data)), detailsCache.data);
    detailsCache.save();
    const details = detailsCache.data;

    console.log('Loading fr.wikipedia page views…');
    const views = await loadViews(process.env.VIEWS_FILE.split(','));
    console.log(`  ${views.size} titles`);

    // Cards from earlier builds keep their fr.wikipedia lead image and intro (summaries cache).
    const summaries = cache('summaries').data;
    const cards = [];
    for (const c of candidates) {
        const s = summaries[c.qid];
        const img = s ? { image: s.image, thumb: s.thumb } : commonsImage(c.image);
        if (!img) continue; // no illustration, no card
        const d = details[c.qid] || {};
        const key = c.title.replace(/ /g, '_');
        cards.push({
            qid: c.qid, type: c.type, name: c.title.replace(/ \([^)]*\)$/, ''), sci_name: d.sci, iucn: d.iucn,
            views: views.get(key) || 0, image_url: img.image, thumb_url: img.thumb,
            extract: s?.extract || null, wiki_url: s?.url || `https://fr.wikipedia.org/wiki/${encodeURIComponent(key)}`,
            stats: { sitelinks: c.sitelinks, mass_kg: d.mass, length_m: d.length, height_m: d.height },
        });
    }
    assignRarity(cards);
    for (const c of cards) c.stats.hp = hpFor(c.views, c.rarity);

    console.log(`Upserting ${cards.length} cards…`);
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(fs.readFileSync(path.join(import.meta.dirname, '../functions/api/schema.sql'), 'utf8'));
    for (let i = 0; i < cards.length; i += 500) {
        const batch = cards.slice(i, i + 500);
        const col = (k) => batch.map((c) => c[k]);
        await db.query(
            `INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, extract, wiki_url, iucn, stats)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[],
                                  $8::text[], $9::text[], $10::text[], $11::text[], $12::jsonb[])
             ON CONFLICT (qid) DO UPDATE SET name=EXCLUDED.name, sci_name=EXCLUDED.sci_name, type=EXCLUDED.type,
                rarity=EXCLUDED.rarity, views=EXCLUDED.views, image_url=EXCLUDED.image_url, thumb_url=EXCLUDED.thumb_url,
                extract=EXCLUDED.extract, wiki_url=EXCLUDED.wiki_url, iucn=EXCLUDED.iucn, stats=EXCLUDED.stats, source='frwiki'`,
            [col('qid'), col('name'), col('sci_name'), col('type'), col('rarity'), col('views'), col('image_url'),
             col('thumb_url'), col('extract'), col('wiki_url'), col('iucn'), batch.map((c) => JSON.stringify(c.stats))],
        );
        if ((i / 500) % 20 === 0) console.log(`  ${Math.min(i + 500, cards.length)}/${cards.length}`);
    }
    // Drop cards that left the catalog, unless a player already owns them (Wikispecies imports have their own script).
    const gone = await db.query(
        `DELETE FROM cards WHERE NOT (qid = ANY($1)) AND source = 'frwiki' AND id NOT IN (SELECT card_id FROM user_cards) RETURNING id`,
        [cards.map((c) => c.qid)],
    );
    console.log(`Removed ${gone.rowCount} stale cards`);
    // Stable card numbers for the collection: by type, then popularity.
    await db.query(`UPDATE cards c SET num = n.num FROM (
        SELECT id, row_number() OVER (ORDER BY type, views DESC, id) AS num FROM cards) n WHERE n.id = c.id`);
    const { rows } = await db.query(`SELECT type, rarity, COUNT(*)::int AS n FROM cards GROUP BY 1, 2 ORDER BY 1, 2`);
    console.table(rows);
    await db.end();
}

// Importable (scripts/import-wikispecies.mjs reuses the helpers): only build when run directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((err) => { console.error(err); process.exit(1); });
