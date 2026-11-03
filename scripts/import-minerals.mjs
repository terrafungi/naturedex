/**
 * Add minerals and rocks to the NaturDex catalog, as one "mineral" card type.
 *
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/import-minerals.mjs          # preview only
 *   DATABASE_URL="$(openkbs postgres connection)" node scripts/import-minerals.mjs --apply  # write the cards
 *
 * Candidates: Wikidata mineral species (Q12089225), mineral varieties (Q429795: ruby, amethyst, agate…)
 * and rock types (subclasses of rock, Q8063), each with a fr.wikipedia article and a Commons photo (P18).
 * Man-made materials, archaeology terms and generic rock families are left out (EXCLUDE).
 * - Popularity: fr.wikipedia views of the last 60 days x 365/60, like the yearly figures of the other cards.
 * - Rarity: same percentiles as build-catalog.mjs inside the type, the 3 most read become secret cards.
 * - Scientific line: the chemical formula when Wikidata has one.
 * New cards get source = 'mineral' (build-catalog.mjs leaves them alone) and numbers after the current last card.
 */
import pg from 'pg';
import { sleep, cache, sparql, commonsImage, qidOf, hpFor } from './build-catalog.mjs';

const APPLY = process.argv.includes('--apply');
const UA_CONTACT = 'NatureDex/1.0 (https://naturedex.fr; contact@naturedex.fr)';
const SECRETS = 3;

// fr.wikipedia titles that are rock "types" in Wikidata but not natural stones worth a card.
const EXCLUDE = /^(Béton|Opus caementicium|Coulis|Gravats|Pierre artificielle|Pierre naturelle|Pierre de Coade|Plastiglomérat|Liste |Éclat \(|Lame \(|Denticulé|Déblais|Dragon-cochon|Bi \(|Suiseki|Sieidi|Bétyle|Roches vivantes|Roche (magmatique|sédimentaire|métamorphique|volcanique|carbonatée|siliceuse|siliciclastique|aphanitique|verte)|Minerai$|Porphyrique|Sial |Mudrock|Cumulat)/;

async function fetchCandidates() {
    const kinds = [
        ['mineral', '?item wdt:P31 wd:Q12089225.'],
        ['variety', '?item wdt:P31 wd:Q429795.'],
        ['rock', '?item wdt:P279+ wd:Q8063.'],
    ];
    const out = new Map();
    for (const [kind, clause] of kinds) {
        const rows = await sparql(`SELECT ?item (SAMPLE(?title0) AS ?title) (SAMPLE(?sl0) AS ?sl) (SAMPLE(?img0) AS ?img) (SAMPLE(?f0) AS ?formula) WHERE {
            ${clause}
            ?item wdt:P18 ?img0; wikibase:sitelinks ?sl0.
            ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>; schema:name ?title0.
            OPTIONAL { ?item wdt:P274 ?f0. }
        } GROUP BY ?item`, { timeoutMs: 180_000 });
        let added = 0;
        for (const r of rows) {
            const qid = qidOf(r.item.value);
            const title = r.title.value;
            if (out.has(qid) || EXCLUDE.test(title)) continue;
            out.set(qid, {
                qid, title, kind, sitelinks: Number(r.sl.value),
                image: decodeURIComponent(r.img.value.split('/Special:FilePath/').pop()),
                formula: r.formula?.value || null,
            });
            added++;
        }
        console.log(`  ${kind}: ${rows.length} found, ${added} kept`);
        await sleep(500);
    }
    return [...out.values()];
}

// fr.wikipedia title -> yearly views estimate (last 60 days x 365/60), 50 titles per request, cached.
// One request at a time: Wikimedia rate-limits parallel calls (HTTP 429 with a Retry-After).
const viewsCache = cache('fr-views-60d');
async function fetchFrViews(titles) {
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
                const res = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA_CONTACT }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
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
        if ((i / 50) % 10 === 9) { console.log(`  ${i + 50}/${todo.length}`); viewsCache.save(); }
        await sleep(300);
    }
    viewsCache.save();
}

// Some sitelinks are redirects to another candidate's article (Cristal de roche -> Quartz): title -> target.
const redirectCache = cache('fr-redirects');
async function fetchRedirects(titles) {
    const todo = [...new Set(titles)].filter((t) => !(t in redirectCache.data));
    for (let i = 0; i < todo.length; i += 50) {
        const chunk = todo.slice(i, i + 50);
        const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: chunk.join('|') });
        const res = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA_CONTACT }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`redirects HTTP ${res.status}`);
        const data = await res.json();
        const norm = Object.fromEntries((data.query?.normalized || []).map((n) => [n.to, n.from]));
        for (const t of chunk) redirectCache.data[t] = null;
        for (const r of data.query?.redirects || []) redirectCache.data[norm[r.from] || r.from] = r.to;
        await sleep(300);
    }
    redirectCache.save();
}

// Wikidata formulas use plain digits: H2O -> H₂O (digits after a letter or a closing bracket only).
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const prettyFormula = (f) => f && f.length <= 40 ? f.replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + [...d].map((x) => SUB[x]).join('')) : null;

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const { rows: existing } = await db.query(`SELECT qid FROM cards`);
    const known = new Set(existing.map((r) => r.qid));

    console.log('Querying Wikidata…');
    let candidates = (await fetchCandidates()).filter((c) => !known.has(c.qid) && commonsImage(c.image));
    await fetchRedirects(candidates.map((c) => c.title));
    const redirected = candidates.filter((c) => redirectCache.data[c.title]);
    if (redirected.length) console.log(`  redirects dropped: ${redirected.map((c) => `${c.title} → ${redirectCache.data[c.title]}`).join(', ')}`);
    candidates = candidates.filter((c) => !redirectCache.data[c.title]);
    console.log(`${candidates.length} new candidates`);

    console.log('Fetching fr.wikipedia views…');
    await fetchFrViews(candidates.map((c) => c.title));

    const cards = candidates.map((c) => {
        const img = commonsImage(c.image);
        const key = c.title.replace(/ /g, '_');
        return {
            qid: c.qid, name: c.title.replace(/ \([^)]*\)$/, ''), sci_name: prettyFormula(c.formula), type: 'mineral',
            views: viewsCache.data[c.title] || 0, image_url: img.image, thumb_url: img.thumb,
            wiki_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(key)}`,
            stats: { sitelinks: c.sitelinks, mass_kg: null, length_m: null, height_m: null },
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
    console.log(`sample commons: ${cards.slice(-8).map((c) => `${c.name} (${c.views})`).join(', ')}`);

    if (!APPLY) { console.log('Preview only: re-run with --apply to write the cards.'); await db.end(); return; }

    const { rows: [{ last }] } = await db.query(`SELECT COALESCE(MAX(num), 0)::int AS last FROM cards`);
    cards.forEach((c, i) => { c.num = last + i + 1; });
    let inserted = 0;
    for (let i = 0; i < cards.length; i += 500) {
        const batch = cards.slice(i, i + 500);
        const col = (k) => batch.map((c) => c[k]);
        const res = await db.query(
            `INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, wiki_url, stats, num, source)
             SELECT *, 'mineral' FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[],
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
