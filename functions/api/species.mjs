/**
 * Public species directory for SEO: one server-rendered page per card (naturedex.fr/especes
 * 301s to /api/especes), browsable by group, plus the site-wide sitemap index.
 * Only species with a real Wikipédia text are indexable; the others stay reachable but
 * noindex, so Google never sees thousands of near-empty pages.
 */
import { BLOG, SITE, SPECIES, commonsPage, dateFr, esc, html, jsonLd, layout, slugify, speciesUrl, thumb, xml } from './blog.mjs';

const PAGE_SIZE = 60;
const SITEMAP_SIZE = 10000;
const MIN_EXTRACT = 200; // characters of Wikipédia text for a page to be worth indexing
const INDEXABLE = `length(coalesce(extract, '')) >= ${MIN_EXTRACT}`;

const TYPES = {
    mammal: ['Mammifère', 'Mammifères'], bird: ['Oiseau', 'Oiseaux'], reptile: ['Reptile & amphibien', 'Reptiles & amphibiens'],
    fish: ['Poisson', 'Poissons'], arthropod: ['Insecte & arachnide', 'Insectes & arachnides'], marine: ['Créature marine', 'Créatures marines'],
    plant: ['Plante', 'Plantes'], tree: ['Arbre', 'Arbres'], alga: ['Algue', 'Algues'], fungus: ['Champignon', 'Champignons'],
    mold: ['Moisissure & levure', 'Moisissures & levures'], bacteria: ['Bactérie', 'Bactéries'], virus: ['Virus', 'Virus'], fossil: ['Fossile', 'Fossiles'],
};
const RARITIES = {
    common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', secret: 'Secrète',
};
const IUCN = {
    LC: 'Préoccupation mineure', NT: 'Quasi menacée', VU: 'Vulnérable', EN: 'En danger', CR: 'En danger critique',
    EW: "Éteinte à l'état sauvage", EX: 'Éteinte', DD: 'Données insuffisantes',
};

const CSS = `<style>
.sp{display:grid;grid-template-columns:minmax(0,340px) 1fr;gap:34px;align-items:start;margin-top:10px}
.sp .hero{margin:0}.sp .hero img{aspect-ratio:1;object-fit:cover}
.sci{font-style:italic;color:var(--soft);font-size:1.15rem;margin:-.3em 0 .8em}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:18px 0}
.facts div{padding:10px 14px;border-radius:14px;background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.09)}
.facts dt{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--soft)}.facts dd{margin:2px 0 0;font-weight:700;color:#fff}
.types{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin:22px 0}
.types a{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:16px;text-decoration:none;color:#fff;font-weight:700;background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.1)}
.types a:hover{border-color:rgb(79 209 139/.45)}.types small{color:var(--soft);font-weight:600}
.cards small{display:block;padding:0 10px 8px;color:var(--soft);font-style:italic;font-size:.78rem;margin-top:-6px}
@media(max-width:760px){.sp{grid-template-columns:1fr}}
</style>`;

const typeUrl = (type, page = 1) => `${SPECIES}/groupe/${type}${page > 1 ? `?page=${page}` : ''}`;
const crumbsLd = (items) => jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});
const tile = (c) => `<a href="${speciesUrl(c)}"><img src="${esc(thumb(c.thumb_url, 330))}" alt="${esc(c.name)}" loading="lazy" width="330" height="330"><span>${esc(c.name)}</span>${c.sci_name && c.sci_name !== c.name ? `<small>${esc(c.sci_name)}</small>` : ''}</a>`;
const cta = (text) => `<aside class="box gold join"><div><h2 style="margin:0 0 4px;font-size:1.35rem">Collectionne le vivant</h2><span class="meta">${text}</span></div>
<a class="cta" href="${SITE}/connexion?mode=register">Créer mon compte gratuit</a></aside>`;
// First sentences of the Wikipédia text, cut on a sentence boundary, for meta descriptions.
function summary(text, max = 158) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const dot = cut.lastIndexOf('. ');
    return dot > 80 ? cut.slice(0, dot + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

async function hubPage(db) {
    const [{ rows: counts }, { rows: stars }] = await Promise.all([
        db.query(`SELECT type, count(*)::int AS n FROM cards GROUP BY type ORDER BY n DESC`),
        db.query(`SELECT id, name, sci_name, thumb_url FROM cards WHERE ${INDEXABLE} ORDER BY views DESC LIMIT 24`),
    ]);
    const total = counts.reduce((a, r) => a + r.n, 0);
    const title = `Encyclopédie des espèces : ${total.toLocaleString('fr-FR')} animaux, plantes et champignons | NatureDex`;
    const description = `Fiches de ${total.toLocaleString('fr-FR')} espèces réelles : mammifères, oiseaux, insectes, plantes, champignons, bactéries, virus et fossiles, avec photo, nom scientifique et statut de conservation.`;
    const body = `<main class="wrap">
<p class="crumbs"><a href="${SITE}/">NatureDex</a> › Espèces</p>
<h1>Toutes les espèces de NatureDex</h1>
<p class="lead" style="max-width:760px">${total.toLocaleString('fr-FR')} espèces réelles, chacune avec sa photo, son nom scientifique, son statut de conservation UICN et sa présentation tirée de Wikipédia. Choisis un groupe pour explorer le vivant.</p>
<nav class="types" aria-label="Groupes d'espèces">${counts.filter((r) => TYPES[r.type]).map((r) => `<a href="${typeUrl(r.type)}">${esc(TYPES[r.type][1])}<small>${r.n.toLocaleString('fr-FR')}</small></a>`).join('')}</nav>
<h2>Les espèces les plus populaires</h2>
<div class="cards">${stars.map(tile).join('')}</div>
${cta('Chaque espèce est une carte à collectionner : ouvre des boosters gratuits, fais le quiz du jour, échange avec tes amis.')}
</main>`;
    const head = jsonLd({
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Espèces NatureDex', url: SPECIES, inLanguage: 'fr-FR', description,
        mainEntity: { '@type': 'ItemList', itemListElement: stars.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: speciesUrl(c), name: c.name })) },
    }) + crumbsLd([['NatureDex', `${SITE}/`], ['Espèces', SPECIES]]);
    return html(layout({ title, description, canonical: SPECIES, image: `${SITE}/og.png`, head: CSS + head, body, tag: 'Espèces' }), 200, 3600);
}

async function typePage(db, type, page) {
    const names = TYPES[type];
    if (!names) return null;
    const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total FROM cards WHERE type = $1`, [type]);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) return null;
    const { rows } = await db.query(
        `SELECT id, name, sci_name, thumb_url FROM cards WHERE type = $1 ORDER BY views DESC, id LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, [type]);
    const label = names[1];
    const title = `${label} : ${total.toLocaleString('fr-FR')} espèces en photos${page > 1 ? ` – page ${page}` : ''} | NatureDex`;
    const description = `Découvre ${total.toLocaleString('fr-FR')} espèces de ${label.toLowerCase()} classées par popularité, avec photo, nom scientifique et statut de conservation${page > 1 ? ` (page ${page} sur ${pages})` : ''}.`;
    const body = `<main class="wrap">
<p class="crumbs"><a href="${SITE}/">NatureDex</a> › <a href="${SPECIES}">Espèces</a> › ${esc(label)}</p>
<h1>${esc(label)}${page > 1 ? ` <span class="meta" style="font-size:1rem">page ${page} / ${pages}</span>` : ''}</h1>
<p class="lead" style="max-width:760px">${total.toLocaleString('fr-FR')} espèces de ${esc(label.toLowerCase())}, des plus connues aux plus discrètes.</p>
<div class="cards">${rows.map(tile).join('')}</div>
<nav class="pager">${page > 1 ? `<a href="${typeUrl(type, page - 1)}">← Précédentes</a>` : ''}${page < pages ? `<a href="${typeUrl(type, page + 1)}">Suivantes →</a>` : ''}</nav>
<nav class="cats" aria-label="Autres groupes">${Object.entries(TYPES).map(([k, n]) => `<a class="chip${k === type ? ' on' : ''}" href="${typeUrl(k)}">${esc(n[1])}</a>`).join('')}</nav>
</main>`;
    const head = jsonLd({
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: label, url: typeUrl(type, page), inLanguage: 'fr-FR', description,
        mainEntity: { '@type': 'ItemList', numberOfItems: total, itemListElement: rows.map((c, i) => ({ '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + i + 1, url: speciesUrl(c), name: c.name })) },
    }) + crumbsLd([['NatureDex', `${SITE}/`], ['Espèces', SPECIES], [label, typeUrl(type)]]);
    return html(layout({
        title, description, canonical: typeUrl(type, page), image: rows[0] ? thumb(rows[0].thumb_url, 960) : `${SITE}/og.png`, head: CSS + head, body, tag: 'Espèces',
        prev: page > 1 ? typeUrl(type, page - 1) : null, next: page < pages ? typeUrl(type, page + 1) : null,
    }), 200, 3600);
}

async function speciesPage(db, id, slug) {
    const { rows: [c] } = await db.query(`SELECT * FROM cards WHERE id = $1`, [id]);
    if (!c) return null;
    const url = speciesUrl(c);
    if (slug !== slugify(c.name)) return { statusCode: 301, headers: { Location: url, 'Cache-Control': 'public, max-age=86400' }, body: '' };
    // neighbours in popularity within the same group: the internal links that let crawlers reach every page
    const [{ rows: related }, { rows: posts }] = await Promise.all([
        db.query(`(SELECT id, name, sci_name, thumb_url FROM cards WHERE type = $1 AND id <> $2 AND views >= $3 ORDER BY views LIMIT 6)
                  UNION ALL (SELECT id, name, sci_name, thumb_url FROM cards WHERE type = $1 AND id <> $2 AND views < $3 ORDER BY views DESC LIMIT 6)`, [c.type, c.id, c.views]),
        db.query(`SELECT slug, title, published_at FROM blog_posts WHERE status = 'published' AND $1 = ANY(card_ids) ORDER BY published_at DESC LIMIT 5`, [c.id]),
    ]);
    const [typeLabel, typePlural] = TYPES[c.type] || [c.type, c.type];
    const sci = c.sci_name && c.sci_name !== c.name ? c.sci_name : '';
    const s = c.stats || {};
    const indexable = String(c.extract || '').length >= MIN_EXTRACT;
    const extract = String(c.extract || '').trim();
    const facts = [
        ['Groupe', `<a href="${typeUrl(c.type)}">${esc(typeLabel)}</a>`],
        sci && ['Nom scientifique', `<i>${esc(sci)}</i>`],
        c.iucn && IUCN[c.iucn] && ['Statut UICN', `${esc(IUCN[c.iucn])} (${esc(c.iucn)})`],
        s.mass_kg && ['Masse', s.mass_kg >= 1 ? `${Number(s.mass_kg).toLocaleString('fr-FR')} kg` : `${Math.round(s.mass_kg * 1000).toLocaleString('fr-FR')} g`],
        s.length_m && ['Longueur', s.length_m >= 1 ? `${Number(s.length_m).toLocaleString('fr-FR')} m` : `${Math.round(s.length_m * 100).toLocaleString('fr-FR')} cm`],
        s.height_m && ['Hauteur', `${Number(s.height_m).toLocaleString('fr-FR')} m`],
        ['Rareté de la carte', esc(RARITIES[c.rarity] || c.rarity)],
        s.hp && ['Points de vie', s.hp],
        s.atk && ['Attaque / défense', `${s.atk} / ${s.def ?? '–'}`],
        s.sitelinks && ['Wikipédia', `${s.sitelinks} langues`],
    ].filter(Boolean);
    const paragraphs = extract.split(/\n+/).map((t) => t.trim()).filter(Boolean);
    const title = `${c.name}${sci ? ` (${sci})` : ''} : fiche espèce, photo${c.iucn ? ' et statut' : ''} | NatureDex`;
    const description = summary(extract) || `${c.name}${sci ? ` (${sci})` : ''} : ${typeLabel.toLowerCase()} de l'encyclopédie NatureDex, avec photo, nom scientifique et carte à collectionner.`;
    const image = thumb(c.image_url || c.thumb_url, 960);
    const body = `<main class="wrap">
<p class="crumbs"><a href="${SITE}/">NatureDex</a> › <a href="${SPECIES}">Espèces</a> › <a href="${typeUrl(c.type)}">${esc(typePlural)}</a> › ${esc(c.name)}</p>
<article class="sp">
<figure class="hero"><img src="${esc(thumb(c.image_url || c.thumb_url, 500))}" alt="${esc(c.name)}${sci ? ` (${esc(sci)})` : ''}" width="500" height="500" fetchpriority="high">
<figcaption>Photo : <a href="${esc(commonsPage(c.image_url || c.thumb_url))}" rel="noopener" target="_blank">Wikimedia Commons</a>, licence libre</figcaption></figure>
<div>
<a class="chip" href="${typeUrl(c.type)}">${esc(typeLabel)}</a>
<h1>${esc(c.name)}</h1>
${sci ? `<p class="sci">${esc(sci)}</p>` : ''}
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
<h2 style="margin-top:.6em">Présentation</h2>
${paragraphs.length ? paragraphs.map((t) => `<p>${esc(t)}</p>`).join('') : `<p>${esc(c.name)} fait partie des ${esc(typePlural.toLowerCase())} de NatureDex.</p>`}
<p class="meta">Source : <a href="${esc(c.wiki_url)}" rel="noopener" target="_blank">article « ${esc(c.name)} » sur Wikipédia</a> (licence CC BY-SA).</p>
</div>
</article>
${posts.length ? `<section><h2>À lire sur le blog</h2><ul>${posts.map((p) => `<li><a href="${BLOG}/${esc(p.slug)}">${esc(p.title)}</a> <span class="meta">· ${dateFr(p.published_at)}</span></li>`).join('')}</ul></section>` : ''}
${cta(`${esc(c.name)} est une carte ${esc((RARITIES[c.rarity] || '').toLowerCase())} de NatureDex : ouvre des boosters gratuits pour l'ajouter à ta collection.`)}
${related.length ? `<section><h2>Autres ${esc(typePlural.toLowerCase())}</h2><div class="cards">${related.map(tile).join('')}</div></section>` : ''}
</main>`;
    const head = jsonLd({
        '@context': 'https://schema.org', '@type': 'WebPage', url, name: title, description, inLanguage: 'fr-FR', primaryImageOfPage: image,
        isPartOf: { '@type': 'WebSite', name: 'NatureDex', url: `${SITE}/` },
        about: {
            '@type': 'Taxon', name: sci || c.name, ...(sci ? { alternateName: c.name } : {}), image, url,
            sameAs: [c.wiki_url, c.qid && `https://www.wikidata.org/wiki/${c.qid}`].filter(Boolean),
        },
    }) + crumbsLd([['NatureDex', `${SITE}/`], ['Espèces', SPECIES], [typePlural, typeUrl(c.type)], [c.name, url]]);
    return html(layout({
        title, description, canonical: url, image, head: CSS + head, body, tag: 'Espèces',
        robots: indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
    }), 200, 86400);
}

// Sitemap index for the whole site: home page + blog sitemap + species sitemaps.
async function sitemapIndex(db) {
    const { rows: [{ n }] } = await db.query(`SELECT count(*)::int AS n FROM cards WHERE ${INDEXABLE}`);
    const parts = [`${SITE}/api/sitemap-pages.xml`, `${BLOG}/sitemap.xml`];
    for (let i = 0; i * SITEMAP_SIZE < n; i++) parts.push(`${SPECIES}/sitemap-${i + 1}.xml`);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.map((loc) => `<sitemap><loc>${esc(loc)}</loc></sitemap>`).join('\n')}
</sitemapindex>`);
}

async function pagesSitemap(db) {
    const { rows } = await db.query(`SELECT type, count(*)::int AS n FROM cards GROUP BY type`);
    const urls = [`${SITE}/`, SPECIES];
    for (const r of rows) if (TYPES[r.type]) for (let p = 1; p <= Math.ceil(r.n / PAGE_SIZE); p++) urls.push(typeUrl(r.type, p));
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `<url><loc>${esc(loc)}</loc></url>`).join('\n')}
</urlset>`);
}

async function speciesSitemap(db, n) {
    const { rows } = await db.query(
        `SELECT id, name, image_url, thumb_url FROM cards WHERE ${INDEXABLE} ORDER BY id LIMIT ${SITEMAP_SIZE} OFFSET ${(n - 1) * SITEMAP_SIZE}`);
    if (!rows.length) return null;
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${rows.map((c) => `<url><loc>${esc(speciesUrl(c))}</loc><image:image><image:loc>${esc(thumb(c.image_url || c.thumb_url, 960))}</image:loc></image:image></url>`).join('\n')}
</urlset>`);
}

const notFound = () => html(layout({
    title: 'Espèce introuvable | NatureDex', description: "Cette page n'existe pas.", canonical: SPECIES, image: `${SITE}/og.png`, robots: 'noindex', tag: 'Espèces',
    body: `<main class="wrap narrow"><h1>Espèce introuvable</h1><p>Cette page n'existe pas. <a href="${SPECIES}">Voir toutes les espèces</a>.</p></main>`,
}), 410, 60); // 410, not 404: the site's SPA fallback would turn a 404 into the app shell

/** GET /api/especes…, /api/sitemap.xml → HTML page or sitemap. Returns null for other paths. */
export async function speciesRoute(db, path, query = {}) {
    if (/^\/(api\/)?sitemap\.xml$/.test(path)) return sitemapIndex(db);
    if (/^\/(api\/)?sitemap-pages\.xml$/.test(path)) return pagesSitemap(db);
    const m = /^\/(?:api\/)?especes(\/.*)?$/.exec(path);
    if (!m) return null;
    const rest = (m[1] || '/').replace(/\/+$/, '') || '/';
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    if (rest === '/') return hubPage(db);
    const map = /^\/sitemap-(\d+)\.xml$/.exec(rest);
    if (map) return (await speciesSitemap(db, Number(map[1]))) || notFound();
    const group = /^\/groupe\/([a-z]+)$/.exec(rest);
    if (group) return (await typePage(db, group[1], page)) || notFound();
    const sp = /^\/(\d+)(?:-([a-z0-9-]*))?$/.exec(rest);
    return (sp && (await speciesPage(db, Number(sp[1]), sp[2] || ''))) || notFound();
}
