/**
 * Add Wikispecies taxa that have no fr.wikipedia article to the NaturDex catalog.
 *
 *   DATABASE_URL="$(openkbs postgres connection --libpq)" node scripts/import-wikispecies.mjs          # preview only
 *   DATABASE_URL="$(openkbs postgres connection --libpq)" node scripts/import-wikispecies.mjs --apply  # write the cards
 *
 * Candidates: species with a Wikispecies page, a Commons photo (P18) and an en.wikipedia article
 * (for the intro and the popularity), but no fr.wikipedia article (those already come from build-catalog.mjs).
 * - TOTAL cards (default 8000) are shared between types like the existing catalog, so the balance stays the same;
 *   inside a type the most read English articles win (pre-filtered by Wikidata sitelinks).
 * - Name: French vernacular name (P1843) when Wikidata has one, else the scientific name.
 * - Popularity: en.wikipedia yearly views, scaled to the fr.wikipedia figures of existing cards (median ratio),
 *   so the rarity reuses the existing per-type view thresholds. Never legendary or secret, and existing cards are untouched.
 * - Intro: left empty; the API translates the English summary to French the first time the card is opened.
 * New cards get source = 'wikispecies' (build-catalog.mjs leaves them alone) and numbers after the current last card.
 */
import fs from 'node:fs';
import pg from 'pg';
import { RANK, TYPES, IUCN, sleep, cache, sparql, commonsImage, qidOf, resolveAnchors, hpFor } from './build-catalog.mjs';
import { battleStats } from '../functions/api/battle.mjs';

const TOTAL = Number(process.env.TOTAL) || 8000;
const POOL_FACTOR = 2.5; // candidates per kept card whose page views are fetched
const APPLY = process.argv.includes('--apply');
const UA_CONTACT = 'NatureDex/1.0 (https://naturedex.fr; contact@naturedex.fr)';
const RARITIES = ['epic', 'rare', 'uncommon']; // highest first; below = common

async function fetchCandidates(type, anchorIds) {
    const taxonClause = type.fossilTaxon
        ? `?item wdt:P31 wd:Q23038290; wdt:P105 ${RANK.species}.`
        : `VALUES ?anchor { ${type.anchors.map((n) => anchorIds[n]).filter(Boolean).map((q) => `wd:${q}`).join(' ')} }
           ?item wdt:P171* ?anchor; wdt:P105 ${RANK.species}.`;
    const rows = await sparql(`SELECT ?item (SAMPLE(?title0) AS ?title) (SAMPLE(?sl0) AS ?sl) (SAMPLE(?img0) AS ?img) (SAMPLE(?sci0) AS ?sci)
               (SAMPLE(?vn0) AS ?vn) (SAMPLE(?gbif0) AS ?gbif) (SAMPLE(?iucn0) AS ?iucn) WHERE {
        ${taxonClause}
        ?item wdt:P18 ?img0; wikibase:sitelinks ?sl0.
        ?ws schema:about ?item; schema:isPartOf <https://species.wikimedia.org/>.
        ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title0.
        MINUS { ?fr schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>. }
        OPTIONAL { ?item wdt:P225 ?sci0. }
        OPTIONAL { ?item wdt:P1843 ?vn0. FILTER(LANG(?vn0) = "fr") }
        OPTIONAL { ?item wdt:P846 ?gbif0. }
        OPTIONAL { ?item wdt:P141 ?iucn0. }
    } GROUP BY ?item LIMIT 400000`, { timeoutMs: 180_000 });
    return rows.map((r) => ({
        qid: qidOf(r.item.value), title: r.title.value, sitelinks: Number(r.sl.value),
        image: decodeURIComponent(r.img.value.split('/Special:FilePath/').pop()),
        sci: r.sci?.value || null, vernacular: r.vn?.value || null,
        gbif: r.gbif && /^\d+$/.test(r.gbif.value) ? Number(r.gbif.value) : null,
        iucn: r.iucn ? IUCN[qidOf(r.iucn.value)] || null : null,
    }));
}

// en.wikipedia title -> yearly views estimate (last 60 days x 365/60), 50 titles per request, cached.
// One request at a time: Wikimedia rate-limits parallel calls (HTTP 429 with a Retry-After).
const viewsCache = cache('en-views-60d');
async function fetchEnViews(titles) {
    const todo = [...new Set(titles)].filter((t) => !(t in viewsCache.data));
    for (let i = 0; i < todo.length; i += 50) {
        const chunk = todo.slice(i, i + 50);
        const sums = Object.fromEntries(chunk.map((t) => [t, 0]));
        const alias = {}; // normalized / redirect target -> requested title
        let cont = {};
        do {
            const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'pageviews', pvipdays: '60', redirects: '1', titles: chunk.join('|'), ...cont });
            let data;
            for (let attempt = 1; !data; attempt++) {
                const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA_CONTACT }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
                if (res?.ok) { data = await res.json(); break; }
                if (attempt === 8) throw new Error(`pageviews HTTP ${res?.status}`);
                await sleep((Number(res?.headers.get('retry-after')) || 5 * attempt) * 1000 + 500);
            }
            for (const n of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) alias[n.to] = alias[n.from] || n.from;
            for (const p of data.query?.pages || []) {
                const t = alias[p.title] || p.title;
                if (t in sums) sums[t] += Object.values(p.pageviews || {}).reduce((a, v) => a + (v || 0), 0);
            }
            cont = data.continue || null;
        } while (cont);
        for (const t of chunk) viewsCache.data[t] = Math.round((sums[t] * 365) / 60);
        if ((i / 50) % 40 === 39) { console.log(`  ${i + 50}/${todo.length}`); viewsCache.save(); }
        await sleep(300);
    }
    viewsCache.save();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// Wikidata French labels are often English or Latin: only a real French vernacular name (P1843) replaces the scientific name.
function cardName(c) {
    if (c.vernacular) return c.vernacular[0].toUpperCase() + c.vernacular.slice(1);
    return c.sci || c.title.replace(/ \([^)]*\)$/, '');
}

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();

    const { rows: existing } = await db.query(`SELECT qid, name, sci_name, type, rarity, views, source FROM cards`);
    const known = new Set(existing.map((c) => c.qid));
    // Same species under another Wikidata item (synonym, duplicate item): match on the scientific and French names too.
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const knownNames = new Set(existing.flatMap((c) => [norm(c.sci_name), norm(c.name)]).filter(Boolean));
    const frwiki = existing.filter((c) => c.source === 'frwiki');

    console.log('Resolving taxon anchors…');
    const anchorIds = await resolveAnchors(TYPES.flatMap((t) => t.anchors || []));

    console.log('Querying Wikidata (Wikispecies + photo + en.wikipedia, no fr.wikipedia) per type…');
    const byType = {};
    const seen = new Set();
    const candidatesCache = cache('wikispecies-candidates'); // delete the file to re-query Wikidata
    for (const type of TYPES) {
        if (!candidatesCache.data[type.key]) {
            candidatesCache.data[type.key] = await fetchCandidates(type, anchorIds);
            candidatesCache.save();
            await sleep(2_000);
        }
        const items = candidatesCache.data[type.key]
            .filter((c) => !seen.has(c.qid) && !seen.has(norm(c.sci)) && !known.has(c.qid) && !knownNames.has(norm(c.sci)) && !(c.vernacular && knownNames.has(norm(c.vernacular))) && commonsImage(c.image) && !/\.svg$/i.test(c.image));
        items.forEach((c) => { seen.add(c.qid); if (c.sci) seen.add(norm(c.sci)); });
        byType[type.key] = items;
        console.log(`  ${type.key}: ${items.length}`);
    }

    // Quotas follow the current catalog's type shares; what a type cannot fill goes to the others.
    const share = {};
    for (const c of frwiki) share[c.type] = (share[c.type] || 0) + 1 / frwiki.length;
    const quota = Object.fromEntries(TYPES.map((t) => [t.key, 0]));
    let left = TOTAL;
    for (let pass = 0; pass < 5 && left > 0; pass++) {
        const open = TYPES.map((t) => t.key).filter((k) => byType[k].length > quota[k]);
        const sum = open.reduce((a, k) => a + (share[k] || 0), 0);
        if (!sum) break;
        const before = left;
        for (const k of open) {
            const add = Math.min(byType[k].length - quota[k], Math.round((before * (share[k] || 0)) / sum));
            quota[k] += add; left -= add;
        }
    }

    // Page views only for the best-linked candidates of each type.
    const pool = TYPES.flatMap((t) => byType[t.key].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, Math.ceil(quota[t.key] * POOL_FACTOR)));
    console.log(`Fetching en.wikipedia views for ${pool.length} candidates…`);
    await fetchEnViews(pool.map((c) => c.title));
    for (const c of pool) c.enViews = viewsCache.data[c.title];

    // Same species under another name: a taxon linked to an existing card as synonym, original combination,
    // basionym or "said to be the same" (e.g. Osphranter rufus / Macropus rufus), or a fossil species whose genus is a card.
    console.log('Checking synonyms of existing cards…');
    const linksCache = cache('wikispecies-links'); // qid -> { syn: [qids], parent: [qids] }
    const unchecked = pool.map((c) => c.qid).filter((q) => !(q in linksCache.data));
    for (let i = 0; i < unchecked.length; i += 2000) {
        const chunk = unchecked.slice(i, i + 2000);
        const rows = await sparql(`SELECT ?c ?o ?parent WHERE { VALUES ?c { ${chunk.map((q) => `wd:${q}`).join(' ')} }
            { ?c wdt:P1420|wdt:P1403|wdt:P566|wdt:P460 ?o. } UNION { ?o wdt:P1420|wdt:P1403|wdt:P566|wdt:P460 ?c. } UNION { ?c wdt:P171 ?parent. } }`, { timeoutMs: 120_000 });
        for (const q of chunk) linksCache.data[q] = { syn: [], parent: [] };
        for (const r of rows) {
            const l = linksCache.data[qidOf(r.c.value)];
            if (r.o) l.syn.push(qidOf(r.o.value));
            if (r.parent) l.parent.push(qidOf(r.parent.value));
        }
        linksCache.save();
        await sleep(2_000);
    }
    const fossils = new Set(byType.fossil.map((c) => c.qid));
    const dropped = new Set(pool.filter((c) => {
        const l = linksCache.data[c.qid];
        return l.syn.some((q) => known.has(q)) || (fossils.has(c.qid) && l.parent.some((q) => known.has(q)));
    }).map((c) => c.qid));
    console.log(`  ${dropped.size} candidates dropped as duplicates`);
    for (const c of pool) if (dropped.has(c.qid)) c.enViews = undefined;

    // Scale: median (en.wikipedia views / fr.wikipedia views) over existing cards that also have an English article.
    console.log('Calibrating en → fr views…');
    // Fixed sample (every n-th card by qid) so that re-runs give the same rarities.
    const eligible = frwiki.filter((c) => c.views > 50).sort((a, b) => a.qid.localeCompare(b.qid));
    const sample = eligible.filter((_, i) => i % Math.ceil(eligible.length / 1500) === 0);
    const enTitles = await sparql(`SELECT ?item ?title WHERE { VALUES ?item { ${sample.map((c) => `wd:${c.qid}`).join(' ')} }
        ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title. }`);
    await fetchEnViews(enTitles.map((r) => r.title.value));
    const pairs = [];
    for (const r of enTitles) {
        const fr = sample.find((c) => c.qid === qidOf(r.item.value));
        const en = viewsCache.data[r.title.value];
        if (en > 0) pairs.push(en / Number(fr.views));
    }
    const ratio = median(pairs);
    console.log(`  ${pairs.length} pairs, en/fr ratio ≈ ${ratio.toFixed(2)}`);

    // Lowest views of each rarity among existing cards of the type.
    const thresholds = {};
    for (const c of frwiki) {
        if (!RARITIES.includes(c.rarity)) continue;
        const t = (thresholds[c.type] ||= {});
        t[c.rarity] = Math.min(t[c.rarity] ?? Infinity, Number(c.views));
    }

    const cards = [];
    for (const t of TYPES) {
        const chosen = byType[t.key].filter((c) => c.enViews !== undefined && !knownNames.has(norm(cardName(c))))
            .sort((a, b) => b.enViews - a.enViews).slice(0, quota[t.key]);
        for (const c of chosen) {
            const views = Math.round(c.enViews / ratio);
            const rarity = RARITIES.find((r) => views >= (thresholds[t.key]?.[r] ?? Infinity)) || 'common';
            const img = commonsImage(c.image);
            const stats = { sitelinks: c.sitelinks, mass_kg: null, length_m: null, height_m: null, hp: hpFor(views, rarity) };
            Object.assign(stats, battleStats({ type: t.key, stats }));
            cards.push({
                qid: c.qid, name: cardName(c), sci_name: c.sci, type: t.key, rarity, views,
                image_url: img.image, thumb_url: img.thumb, wiki_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, '_'))}`,
                iucn: c.iucn, gbif_key: c.gbif, stats, enTitle: c.title,
            });
        }
    }

    // Report
    const table = {};
    for (const c of cards) (table[c.type] ||= { total: 0, common: 0, uncommon: 0, rare: 0, epic: 0 }), table[c.type].total++, table[c.type][c.rarity]++;
    console.table(table);
    console.log(`${cards.length} cards, ${cards.filter((c) => c.name !== c.sci_name).length} with a French name, ${cards.filter((c) => c.gbif_key).length} with a GBIF id`);
    fs.writeFileSync('/tmp/wikispecies-preview.json', JSON.stringify(cards, null, 1));
    console.log('Preview written to /tmp/wikispecies-preview.json');

    if (!APPLY) { console.log('Preview only: re-run with --apply to write the cards.'); await db.end(); return; }

    const { rows: [{ last }] } = await db.query(`SELECT COALESCE(MAX(num), 0)::int AS last FROM cards`);
    cards.sort((a, b) => a.type.localeCompare(b.type) || b.views - a.views).forEach((c, i) => { c.num = last + i + 1; });
    let inserted = 0;
    for (let i = 0; i < cards.length; i += 500) {
        const batch = cards.slice(i, i + 500);
        const col = (k) => batch.map((c) => c[k]);
        const res = await db.query(
            `INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, wiki_url, iucn, gbif_key, stats, num, source)
             SELECT *, 'wikispecies' FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[],
                                  $8::text[], $9::text[], $10::text[], $11::int[], $12::jsonb[], $13::int[])
             ON CONFLICT (qid) DO NOTHING`,
            [col('qid'), col('name'), col('sci_name'), col('type'), col('rarity'), col('views'), col('image_url'),
             col('thumb_url'), col('wiki_url'), col('iucn'), col('gbif_key'), batch.map((c) => JSON.stringify(c.stats)), col('num')],
        );
        inserted += res.rowCount;
    }
    const { rows: [{ n }] } = await db.query(`SELECT COUNT(*)::int AS n FROM cards`);
    console.log(`Inserted ${inserted} cards — catalog now ${n} cards`);
    await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
