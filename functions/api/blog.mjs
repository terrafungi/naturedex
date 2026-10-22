/**
 * Nature blog: one article a day, written by an LLM from real material only (Wikipédia
 * texts of our cards, recent nature news from RSS feeds). The model writes, the code picks
 * the subject, the image and the sources, so a link can never be invented.
 * Pages are server-rendered HTML under /api/blog (naturedex.fr/blog 301s there) for SEO.
 */

export const SITE = 'https://naturedex.fr';
export const BLOG = `${SITE}/api/blog`;
export const SPECIES = `${SITE}/api/especes`;
const UA = 'NatureDexBlog/1.0 (https://naturedex.fr)'; // Wikimedia asks for a contact URL
const MODEL = 'gemini-3.5-flash';
const FREE_FALLBACK_MODEL = 'gemini-flash-latest';
const LAUNCH_POSTS = 16; // first batch, one per category, generated one per minute
const DAILY_HOUR = 8; // Paris hour from which the daily article is written
const DAILY_ATTEMPTS = 6;
const RETRY_AFTER = 20; // minutes between two attempts of the same day, so one overload spike does not use them all
const PAGE_SIZE = 12;
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

// type filters reuse the card catalogue types; `topic` steers the angle of the article
export const CATEGORIES = {
    actualite: { label: 'Actualité nature', news: true, topic: "un article d'actualité qui résume et explique une découverte ou un événement récent" },
    'fun-fact': { label: 'Fun fact', count: 1, topic: "un article « fun fact » : les faits les plus surprenants et amusants sur l'espèce" },
    portrait: { label: "Portrait d'espèce", count: 1, rarities: ['legendary', 'epic', 'secret'], topic: "un portrait complet de l'espèce : identification, mode de vie, répartition, curiosités" },
    records: { label: 'Top 5 du vivant', count: 5, sameType: true, topic: 'un classement « top 5 » de ces cinq espèces autour d\'un thème commun que tu choisis à partir des textes (taille, longévité, vitesse, étrangeté, habitat…)' },
    mythe: { label: 'Mythe ou réalité ?', count: 1, types: ['mammal', 'bird', 'reptile', 'arthropod', 'fish'], topic: "un article « mythe ou réalité ? » : idées reçues ou croyances sur l'espèce, confrontées à ce que disent les sources" },
    menacee: { label: 'Espèce menacée', count: 1, iucn: ['CR', 'EN', 'VU'], topic: "un article sur une espèce menacée : pourquoi elle est en danger, les menaces, ce qui est fait pour la protéger" },
    fossiles: { label: 'Fossiles & préhistoire', count: 1, types: ['fossil'], topic: "un article sur cette espèce disparue : époque, découverte, ce qu'on sait d'elle" },
    champignons: { label: 'Champignons', count: 1, types: ['fungus', 'mold'], topic: 'un article sur ce champignon : reconnaissance, habitat, rôle écologique, comestibilité ou toxicité si les sources en parlent' },
    invisible: { label: 'Monde invisible', count: 1, types: ['bacteria', 'virus'], topic: 'un article de vulgarisation sur ce micro-organisme : où il vit, ce qu\'il fait, pourquoi il compte' },
    botanique: { label: 'Botanique', count: 1, types: ['plant', 'tree', 'alga'], topic: 'un article de botanique sur cette plante : description, habitat, usages, anecdotes' },
    comportement: { label: 'Comportement animal', count: 1, types: ['mammal', 'bird', 'fish', 'reptile'], topic: "un article sur le comportement de l'animal : alimentation, reproduction, vie sociale, communication" },
    oiseaux: { label: 'Oiseaux', count: 1, types: ['bird'], topic: "un article sur cet oiseau : reconnaissance, chant, migration, mode de vie" },
    oceans: { label: 'Océans', count: 1, types: ['marine', 'fish'], topic: 'un article sur cette espèce marine et son milieu' },
    insectes: { label: 'Insectes & cie', count: 1, types: ['arthropod'], topic: "un article sur cet arthropode : anatomie, cycle de vie, rôle dans l'écosystème" },
    saison: { label: 'Nature du mois', count: 4, types: ['bird', 'tree', 'plant', 'fungus', 'arthropod'], seasonal: true, living: true, topic: 'un article « que voir dans la nature ce mois-ci » autour de ces espèces, en ne parlant de saison que si les textes le permettent' },
    jardin: { label: 'Jardin & biodiversité', count: 3, types: ['plant', 'tree', 'arthropod', 'bird'], mustContain: /jardin/i, living: true, topic: 'un article « biodiversité au jardin » : comment ces espèces vivent près de nous et comment les accueillir ou les observer' },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Nature news feeds checked reachable; general science feeds are filtered by NATURE_WORDS.
const FEEDS = [
    { url: 'https://www.sciencesetavenir.fr/animaux/rss.xml', publisher: 'Sciences et Avenir' },
    { url: 'https://www.sciencesetavenir.fr/nature-environnement/rss.xml', publisher: 'Sciences et Avenir' },
    { url: 'https://lejournal.cnrs.fr/rss', publisher: 'CNRS Le Journal' },
    { url: 'https://reporterre.net/spip.php?page=backend', publisher: 'Reporterre' },
    { url: 'https://www.futura-sciences.com/rss/actualites.xml', publisher: 'Futura' },
    { url: 'https://www.science-et-vie.com/feed', publisher: 'Science et Vie' },
    { url: 'https://www.sciencedaily.com/rss/plants_animals.xml', publisher: 'ScienceDaily' },
];
const NATURE_WORDS = /animal|animaux|espèce|oiseau|plante|arbre|forêt|océan|marin|insecte|abeille|papillon|biodiversit|faune|flore|fossile|dinosaure|champignon|baleine|requin|dauphin|loup|ours|récif|corail|reptile|serpent|lézard|grenouille|amphibien|poisson|mammifère|primate|singe|chauve-souris|bactérie|microb|écosystème|zoolog|botani|species|wildlife|plant|bird|insect|mammal|fish|coral|forest|fungi/i;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SEASONS = ['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'été', 'été', 'été', 'automne', 'automne', 'automne', 'hiver'];

export const fetchText = async (url, ms = 8000) => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.text();
};
const decode = (s) => String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&#8217;/g, '’')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();

export const slugify = (s) => {
    const slug = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug.length <= 80 ? slug : slug.slice(0, 80).replace(/-[^-]*$/, ''); // cut on a word boundary
};

// Full plain-text Wikipédia article, cut before the reference sections.
async function wikiText(wikiUrl) {
    const title = decodeURIComponent(wikiUrl.split('/wiki/')[1] || '');
    if (!title) return '';
    const api = `https://fr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
    const data = JSON.parse(await fetchText(api));
    const page = Object.values(data.query?.pages || {})[0];
    let text = page?.extract || '';
    const cut = text.search(/\n==+ ?(Notes et références|Références|Voir aussi|Liens externes|Bibliographie|Annexes) ?==+/);
    if (cut > 0) text = text.slice(0, cut);
    return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
}

// Commons file page of an upload.wikimedia.org / thumb URL, for the image credit link.
export function commonsPage(url) {
    const path = String(url).split('?')[0];
    const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(path);
    return m ? `https://commons.wikimedia.org/wiki/File:${m[1]}` : 'https://commons.wikimedia.org/';
}

// Psychoactive species are welcome topics, but written as information, never as a how-to.
export const DRUGS = /psilocyb|hallucinog|psychotrop|psychoacti|enth[ée]og|narcoti|mescalin|cannabino|\bLSD\b|opiac|opioïd|cocaïn|ayahuasca/i;

// Popular cards for a category, never already featured in a post.
async function pickCards(db, cat) {
    const where = ['NOT EXISTS (SELECT 1 FROM blog_posts p WHERE c.id = ANY(p.card_ids))', 'c.image_url IS NOT NULL'];
    const params = [];
    if (cat.types) { params.push(cat.types); where.push(`c.type = ANY($${params.length})`); }
    if (cat.rarities) { params.push(cat.rarities); where.push(`c.rarity = ANY($${params.length})`); }
    if (cat.iucn) { params.push(cat.iucn); where.push(`c.iucn = ANY($${params.length})`); }
    if (cat.living) where.push(`c.iucn IS DISTINCT FROM 'EX' AND c.iucn IS DISTINCT FROM 'EW'`);
    if (cat.sameType) {
        const { rows: [t] } = await db.query(`SELECT type FROM cards WHERE type NOT IN ('virus','mold','bacteria','alga') GROUP BY type ORDER BY random() LIMIT 1`);
        params.push(t.type); where.push(`c.type = $${params.length}`);
    }
    const { rows } = await db.query(
        `SELECT * FROM (SELECT c.id, c.qid, c.name, c.sci_name, c.type, c.rarity, c.iucn, c.image_url, c.thumb_url, c.wiki_url
           FROM cards c WHERE ${where.join(' AND ')} ORDER BY c.views DESC LIMIT 600) s ORDER BY random() LIMIT ${cat.count * (cat.seasonal || cat.mustContain ? 12 : 4)}`, params);
    const picked = [];
    const month = new Date().toLocaleString('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });
    const seasonal = new RegExp(`(^|[^\\p{L}])(${month}|${SEASONS[MONTHS.indexOf(month)]})([^\\p{L}]|$)`, 'iu');
    for (let i = 0; i < rows.length && picked.length < cat.count; i += 3) {
        const texts = await Promise.all(rows.slice(i, i + 3).map((c) => wikiText(c.wiki_url).catch(() => '')));
        rows.slice(i, i + 3).forEach((card, j) => {
            const text = texts[j];
            if (picked.length >= cat.count || text.length < 1500) return;
            if (cat.mustContain && !cat.mustContain.test(text)) return;
            if (cat.seasonal && !seasonal.test(text)) return;
            picked.push({ ...card, text: cat.count > 1 ? text.slice(0, 6000) : text });
        });
    }
    if (picked.length < cat.count) throw new Error(`Pas assez d'espèces pour ${cat.label}`);
    return picked;
}

const parseFeed = (xml, feed) => [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([item]) => {
    const tag = (name) => decode((new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item) || [])[1]);
    return { title: tag('title'), link: tag('link').replace(/\?xtor=.*$/, ''), summary: tag('description'), date: new Date(tag('pubDate') || tag('dc:date')), publisher: feed.publisher };
});

// Most recent unused nature news item whose page has enough text and names a species we have.
async function pickNews(db) {
    const lists = await Promise.all(FEEDS.map((f) => fetchText(f.url, 6000).then((x) => parseFeed(x, f)).catch(() => [])));
    const since = Date.now() - 5 * 86400_000;
    const items = lists.flat()
        .filter((i) => i.link && i.title && !(i.date < since) && NATURE_WORDS.test(`${i.title} ${i.summary}`))
        .sort((a, b) => (b.date || 0) - (a.date || 0));
    const { rows: used } = await db.query(`SELECT source_key FROM blog_posts WHERE source_key = ANY($1)`, [items.map((i) => i.link)]);
    const usedSet = new Set(used.map((r) => r.source_key));
    for (const item of items.filter((i) => !usedSet.has(i.link)).slice(0, 8)) {
        const html = await fetchText(item.link).catch(() => '');
        const text = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1])).filter((p) => p.length > 60).join('\n').slice(0, 9000);
        if (text.length < 1200) continue;
        const { rows: cards } = await db.query(
            `SELECT id, qid, name, sci_name, type, rarity, iucn, image_url, thumb_url, wiki_url FROM cards
             WHERE length(name) > 4 AND (position(lower(name) in lower($1)) > 0 OR (sci_name IS NOT NULL AND length(sci_name) > 6 AND position(lower(sci_name) in lower($1)) > 0))
             ORDER BY position(lower(name) in lower($2)) > 0 DESC, views DESC LIMIT 3`, [`${item.title} ${text}`, item.title]);
        if (!cards.length) continue;
        const main = cards[0];
        main.text = (await wikiText(main.wiki_url).catch(() => '')).slice(0, 5000);
        return { item: { ...item, text }, cards };
    }
    throw new Error('Aucune actualité nature exploitable');
}

// Google AI Studio free tier first (GEMINI_API_KEY), then the paid OpenKBS proxy.
function llmEndpoints() {
    const key = process.env.GEMINI_API_KEY;
    const free = (model) => ({ name: `free:${model}`, url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, headers: { 'x-goog-api-key': key } });
    return [
        ...(key ? [free(MODEL), free(FREE_FALLBACK_MODEL)] : []),
        { name: 'openkbs', url: `https://proxy.openkbs.com/v1/google/models/${MODEL}:generateContent`, headers: { Authorization: `Bearer ${process.env.OPENKBS_API_KEY}` } },
    ];
}

async function llm(prompt) {
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 12000 },
    });
    const errors = [];
    const deadline = Date.now() + 95_000; // the whole chain must fit in the 120 s Lambda
    const PAID_RESERVE = 50_000; // a slow or overloaded free tier must never eat the paid fallback's time
    let res;
    for (const ep of llmEndpoints()) {
        const left = deadline - Date.now();
        if (left < (ep.name === 'openkbs' ? 20_000 : PAID_RESERVE + 15_000)) continue;
        res = await fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ep.headers }, body, signal: AbortSignal.timeout(ep.name === 'openkbs' ? left : Math.min(left - PAID_RESERVE, 50_000)) })
            .catch((err) => ({ ok: false, status: 0, text: async () => err.message }));
        if (res.ok) { console.log(`blog: LLM via ${ep.name}`); break; }
        console.log(`blog: ${ep.name} failed ${res.status}`);
        errors.push(`${ep.name} ${res.status} ${(await res.text()).slice(0, 150)}`);
    }
    if (!res?.ok) throw new Error(`LLM ${errors.join(' | ')}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

const OUTPUT = `Réponds UNIQUEMENT avec un objet JSON de cette forme :
{
  "title": "titre accrocheur de 45 à 65 caractères contenant le mot-clé principal",
  "metaDescription": "130 à 155 caractères, donne envie de cliquer, contient le mot-clé",
  "excerpt": "chapeau de 1 à 2 phrases (max 220 caractères)",
  "keyword": "mot-clé principal (ex. nom de l'espèce)",
  "imageAlt": "description courte et concrète de la photo de l'espèce principale",
  "keyFacts": ["3 à 5 faits marquants, une phrase courte chacun"],
  "sections": [{ "h2": "intertitre descriptif (pas « Introduction »)", "paragraphs": ["2 à 4 paragraphes de 3 à 5 phrases"], "bullets": ["optionnel : liste à puces"] }],
  "faq": [{ "q": "question que les gens tapent sur Google", "a": "réponse de 2 à 3 phrases" }],
  "tags": ["3 à 5 tags courts en minuscules"]
}
Contraintes :
- 4 à 6 sections, 3 questions de FAQ, texte en français impeccable, ton vivant et passionné, tutoiement du lecteur.
- N'utilise QUE des faits présents dans les documents fournis. N'invente aucun chiffre, date, nom de chercheur ou citation. Si une information manque, n'en parle pas.
- Ne recopie pas de phrases des documents : reformule tout.
- Pas de markdown, pas de liens, pas d'émojis dans les textes.
- N'évoque pas les documents (« selon le texte fourni ») ; écris comme un journaliste nature.`;

function prompt(cat, material) {
    const docs = material.cards.filter((c) => c.text).map((c, i) => `### Document ${i + 1} — Wikipédia : ${c.name}${c.sci_name && c.sci_name !== c.name ? ` (${c.sci_name})` : ''}${c.iucn ? ` — statut UICN ${c.iucn}` : ''}\n${c.text}`);
    if (material.news) docs.unshift(`### Article d'actualité — ${material.news.publisher}, ${material.news.date ? material.news.date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : ''}\nTitre : ${material.news.title}\n${material.news.text}`);
    const month = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    return `Tu es rédacteur pour le blog nature de NatureDex (naturedex.fr), un jeu de cartes à collectionner sur les espèces du vivant.
Écris ${cat.topic}. Nous sommes en ${month}. Longueur visée : ${cat.news ? '700 à 1000' : '900 à 1300'} mots au total.
Espèces concernées : ${material.cards.map((c) => c.name).join(', ')}.

${docs.join('\n\n')}
${DRUGS.test(docs.join(' ')) ? `
Cette espèce a des propriétés psychoactives : traite-les de façon informative (ethnobotanie, histoire, usages culturels ou rituels, chimie, recherche médicale, statut légal en France, risques et confusions dangereuses), sans jamais donner de conseils de cueillette, de préparation, de dosage ou de consommation, ni de section « comment la reconnaître pour la récolter ».
` : ''}
${OUTPUT}`;
}

const words = (post) => [post.excerpt, ...(post.keyFacts || []), ...post.sections.flatMap((s) => [s.h2, ...(s.paragraphs || []), ...(s.bullets || [])]), ...post.faq.flatMap((f) => [f.q, f.a])]
    .join(' ').split(/\s+/).filter(Boolean).length;

function validate(post, cat) {
    const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
    if (!str(post.title, 20, 110) || !str(post.metaDescription, 60, 200) || !str(post.excerpt, 30, 320)) throw new Error('Champs de tête invalides');
    if (!Array.isArray(post.sections) || post.sections.length < 3 || post.sections.some((s) => !str(s.h2, 3, 140) || !Array.isArray(s.paragraphs) || !s.paragraphs.length)) throw new Error('Sections invalides');
    post.faq = Array.isArray(post.faq) ? post.faq.filter((f) => str(f.q, 5, 200) && str(f.a, 10, 800)) : [];
    post.keyFacts = Array.isArray(post.keyFacts) ? post.keyFacts.filter((f) => str(f, 5, 300)).slice(0, 5) : [];
    post.tags = Array.isArray(post.tags) ? post.tags.filter((t) => str(t, 2, 40)).slice(0, 6).map((t) => t.toLowerCase()) : [];
    const n = words(post);
    if (n < (cat.news ? 450 : 600)) throw new Error(`Article trop court (${n} mots)`);
    post.words = n;
    return post;
}

async function uniqueSlug(db, title) {
    const base = slugify(title) || 'article';
    const { rows } = await db.query(`SELECT slug FROM blog_posts WHERE slug = $1 OR slug LIKE $1 || '-%'`, [base]);
    const taken = new Set(rows.map((r) => r.slug));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    return slug;
}

// Writes the post for the claimed row `id`.
async function writePost(db, id, category) {
    const cat = CATEGORIES[category];
    let material;
    if (cat.news) {
        const { item, cards } = await pickNews(db);
        material = { news: item, cards, sourceKey: item.link };
    } else {
        const cards = await pickCards(db, cat);
        material = { cards, sourceKey: cards.length === 1 ? `card:${cards[0].qid}` : null };
    }
    const post = validate(await llm(prompt(cat, material)), cat);
    const main = material.cards[0];
    const sources = [
        ...(material.news ? [{ title: material.news.title, url: material.news.link, publisher: material.news.publisher }] : []),
        ...material.cards.map((c) => ({ title: `${c.name} — Wikipédia`, url: c.wiki_url, publisher: 'Wikipédia' })),
    ];
    const slug = await uniqueSlug(db, post.title);
    await db.query(
        `UPDATE blog_posts SET status = 'published', slug = $2, title = $3, description = $4, excerpt = $5, body = $6, sources = $7,
            image_url = $8, image_alt = $9, image_credit = $10, card_ids = $11, tags = $12, source_key = $13, published_at = now(), error = NULL
         WHERE id = $1`,
        [id, slug, post.title.trim(), post.metaDescription.trim(), post.excerpt.trim(),
            { keyword: post.keyword, keyFacts: post.keyFacts, sections: post.sections, faq: post.faq, words: post.words },
            JSON.stringify(sources), main.image_url, post.imageAlt || main.name, commonsPage(main.image_url),
            material.cards.map((c) => c.id), post.tags, material.sourceKey]);
    return slug;
}

const parisNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
};

/** Called every minute by the schedule: the launch batch first, then one article per Paris day. */
export async function blogTick(db) {
    if (!process.env.OPENKBS_API_KEY) return;
    await db.query(`UPDATE blog_posts SET status = 'failed', error = coalesce(error, 'timeout') WHERE status = 'generating' AND created_at < now() - interval '4 minutes'`);
    const { rows: [s] } = await db.query(`SELECT count(*) FILTER (WHERE status = 'published')::int AS published,
        count(*) FILTER (WHERE status = 'failed' AND created_at > now() - interval '1 hour')::int AS recent_failures FROM blog_posts`);
    if (s.recent_failures >= 6) return;
    const { day, hour, weekday } = parisNow();
    let category, postDay = null;
    if (s.published < LAUNCH_POSTS) {
        const { rows } = await db.query(`SELECT category, count(*) FILTER (WHERE status = 'published')::int AS n,
            count(*) FILTER (WHERE status = 'failed')::int AS f FROM blog_posts GROUP BY category`);
        const done = Object.fromEntries(rows.map((r) => [r.category, r]));
        // categories without a post yet, those that failed least first
        category = CATEGORY_KEYS.filter((k) => !done[k]?.n && (done[k]?.f || 0) < 3).sort((a, b) => (done[a]?.f || 0) - (done[b]?.f || 0))[0]
            ?? CATEGORY_KEYS.filter((k) => !CATEGORIES[k].news)[s.published % (CATEGORY_KEYS.length - 1)];
    } else {
        if (hour < DAILY_HOUR) return;
        const { rows: [d] } = await db.query(`SELECT count(*) FILTER (WHERE status = 'published')::int AS done, count(*)::int AS tries,
            bool_or(created_at > now() - interval '${RETRY_AFTER} minutes') AS recent FROM blog_posts WHERE day = $1`, [day]);
        if (d.done || d.tries >= DAILY_ATTEMPTS || d.recent) return;
        postDay = day;
        // news on Monday, Wednesday and Friday (falls back to another category when no usable news)
        if (['Mon', 'Wed', 'Fri'].includes(weekday) && d.tries === 0) category = 'actualite';
        else {
            const { rows } = await db.query(`SELECT category, max(published_at) AS last FROM blog_posts WHERE status = 'published' GROUP BY category`);
            const last = Object.fromEntries(rows.map((r) => [r.category, r.last?.getTime() || 0]));
            category = CATEGORY_KEYS.filter((k) => !CATEGORIES[k].news).sort((a, b) => (last[a] || 0) - (last[b] || 0) || Math.random() - 0.5)[0];
        }
    }
    let id;
    try {
        ({ rows: [{ id }] } = await db.query(`INSERT INTO blog_posts (category, day) VALUES ($1, $2) RETURNING id`, [category, postDay]));
    } catch (err) {
        if (err.code === '23505') return; // another invocation is writing
        throw err;
    }
    try {
        const slug = await writePost(db, id, category);
        console.log('blog published', category, slug);
    } catch (err) {
        console.error('blog', category, err.message);
        await db.query(`UPDATE blog_posts SET status = 'failed', error = $2 WHERE id = $1`, [id, String(err.message).slice(0, 500)]);
    }
}

/* ---------- public data ---------- */

// Public species page (served by species.mjs); the slug is cosmetic, the id is the key.
export const speciesUrl = (c) => `${SPECIES}/${c.id}-${slugify(c.name)}`;

const POST_COLS = `id, slug, category, title, description, excerpt, image_url, image_alt, published_at, tags, (body->>'words')::int AS words`;
const postUrl = (slug) => `${BLOG}/${slug}`;
// Wikimedia only serves standard thumbnail widths (330, 500, 960…); card images are stored at 960px.
export const thumb = (url, w = 500) => String(url).replace(/\/(\d+)px-([^/?]+)/, `/${w}px-$2`);

export async function latestPosts(db, limit = 3) {
    const { rows } = await db.query(`SELECT ${POST_COLS} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT $1`, [limit]);
    return rows.map((p) => ({
        slug: p.slug, title: p.title, excerpt: p.excerpt, image: thumb(p.image_url), imageAlt: p.image_alt,
        category: CATEGORIES[p.category]?.label || p.category, date: p.published_at, url: postUrl(p.slug), minutes: Math.max(1, Math.round((p.words || 800) / 200)),
    }));
}

/* ---------- HTML pages ---------- */

export const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const CSS = `
:root{--night:#05130d;--deep:#10261b;--ink:#eef5ef;--soft:#a3b5a9;--forest:#4fd18b;--mint:#a8f0c6;--brass:#e9c46a}
*{box-sizing:border-box}html{background:var(--night);color-scheme:dark}
body{margin:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:var(--ink);line-height:1.7;background:radial-gradient(900px 600px at 90% -10%,rgb(46 140 90/.2),transparent 60%),radial-gradient(800px 600px at -10% 30%,rgb(233 196 106/.07),transparent 60%),var(--night);background-attachment:fixed}
a{color:var(--mint)}a:hover{color:#fff}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}.narrow{max-width:760px}
header.top{position:sticky;top:0;z-index:5;backdrop-filter:blur(14px);background:rgb(5 19 13/.82);border-bottom:1px solid rgb(255 255 255/.08)}
header.top .wrap{display:flex;align-items:center;gap:14px;height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;margin-right:auto}
.brand img{width:34px;height:34px}.brand b{font-family:"Playfair Display",Georgia,serif;font-size:1.5rem;font-weight:600}
.brand span{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);border-left:1px solid rgb(255 255 255/.15);padding-left:10px}
.nav a{color:var(--soft);text-decoration:none;font-weight:600;font-size:.9rem}.nav a:hover{color:#fff}
.cta{display:inline-block;padding:10px 18px;border-radius:999px;font-weight:800;text-decoration:none;color:#2a1d02!important;background:linear-gradient(135deg,#f4d88f,#e9c46a 50%,#c9a227);box-shadow:0 6px 24px rgb(233 196 106/.25);white-space:nowrap}
.cta:hover{filter:brightness(1.08)}
h1,h2,h3,.serif{font-family:"Playfair Display",Georgia,serif;letter-spacing:-.01em;line-height:1.2}
h1{font-size:clamp(2rem,5vw,3.2rem);margin:.3em 0 .4em;color:#fff}
h2{font-size:clamp(1.45rem,3vw,1.9rem);margin:1.8em 0 .5em;color:#fff}
.chip{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:rgb(79 209 139/.14);color:var(--mint);border:1px solid rgb(79 209 139/.3);text-decoration:none}
.chip.on{background:var(--forest);color:#05130d}
.meta{color:var(--soft);font-size:.9rem}
.crumbs{font-size:.85rem;color:var(--soft);margin-top:28px}.crumbs a{color:var(--soft)}
.hero{margin:22px 0 8px;border-radius:22px;overflow:hidden;background:var(--deep);border:1px solid rgb(255 255 255/.08)}
.hero img{display:block;width:100%;height:auto;max-height:520px;object-fit:cover}
figcaption{font-size:.75rem;color:var(--soft);padding:8px 14px}
.lead{font-size:1.2rem;color:#fff;font-weight:500}
article p{font-size:1.06rem;color:#dfe9e1}
article ul{padding-left:1.2em}article li{margin:.3em 0;color:#dfe9e1}
.box{border-radius:18px;padding:18px 22px;margin:28px 0;background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.1)}
.box.gold{background:linear-gradient(135deg,rgb(233 196 106/.12),rgb(233 196 106/.03));border-color:rgb(233 196 106/.35)}
.box h2,.box h3{margin-top:0}
details{border-bottom:1px solid rgb(255 255 255/.1);padding:12px 0}summary{cursor:pointer;font-weight:700;color:#fff}
.sources li{word-break:break-word}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.cards a{display:block;text-decoration:none;border-radius:14px;overflow:hidden;background:var(--deep);border:1px solid rgb(233 196 106/.3);color:#fff}
.cards img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.cards span{display:block;padding:8px 10px;font-weight:700;font-size:.9rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}
.post{display:flex;flex-direction:column;text-decoration:none;color:inherit;border-radius:20px;overflow:hidden;background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.09);transition:transform .2s,border-color .2s}
.post:hover{transform:translateY(-3px);border-color:rgb(79 209 139/.45)}
.post img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--deep)}
.post .in{padding:16px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.post h3{font-size:1.25rem;margin:0;color:#fff}.post p{margin:0;color:var(--soft);font-size:.95rem}
.post.big{display:grid;grid-template-columns:1.3fr 1fr}.post.big img{height:100%;aspect-ratio:auto;min-height:280px}.post.big h3{font-size:1.8rem}
@media(max-width:760px){.post.big{display:flex}.post.big img{aspect-ratio:16/10;min-height:0}.brand span,.nav{display:none}header.top .cta{padding:8px 14px;font-size:.85rem}.brand b{font-size:1.3rem}.brand img{width:28px;height:28px}}
.cats{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 30px}
.pager{display:flex;justify-content:center;gap:12px;margin:40px 0}.pager a{padding:10px 18px;border-radius:999px;border:1px solid rgb(255 255 255/.15);text-decoration:none;color:#fff}
footer{margin-top:70px;border-top:1px solid rgb(255 255 255/.08);padding:30px 0 50px;color:var(--soft);font-size:.85rem}
.join{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
`;

export function layout({ title, description, canonical, image, type = 'website', head = '', body, prev, next, tag = 'Blog nature', robots = 'index, follow, max-image-preview:large' }) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#05130d">
<link rel="icon" href="${SITE}/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Blog NatureDex" href="${BLOG}/rss.xml">
${prev ? `<link rel="prev" href="${esc(prev)}">` : ''}${next ? `<link rel="next" href="${esc(next)}">` : ''}
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="NatureDex">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500..800&family=Plus+Jakarta+Sans:wght@400..800&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="${SITE}/"><img src="${SITE}/favicon.svg" alt="" width="34" height="34"><b>NatureDex</b><span>${esc(tag)}</span></a>
<nav class="nav"><a href="${BLOG}">Blog</a> · <a href="${SPECIES}">Espèces</a></nav>
<a class="cta" href="${SITE}/connexion?mode=register">Jouer gratuitement</a>
</div></header>
${body}
<footer><div class="wrap join">
<span>© ${new Date().getFullYear()} NatureDex · Articles rédigés à partir de Wikipédia et de médias scientifiques, sources citées sous chaque article · Images : Wikimedia Commons (licences libres)</span>
<span><a href="${BLOG}">Blog</a> · <a href="${SPECIES}">Toutes les espèces</a> · <a href="${BLOG}/rss.xml">RSS</a> · <a href="${SITE}/">NatureDex</a></span>
</div></footer>
</body>
</html>`;
}

export const html = (body, status = 200, maxAge = 600) => ({ statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` }, body });
export const xml = (body) => ({ statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' }, body });

const card = (p, big = false) => `<a class="post${big ? ' big' : ''}" href="${postUrl(p.slug)}">
<img src="${esc(thumb(p.image_url, big ? 960 : 500))}" alt="${esc(p.image_alt || p.title)}" loading="${big ? 'eager' : 'lazy'}" width="500" height="313">
<div class="in"><span><span class="chip">${esc(CATEGORIES[p.category]?.label || p.category)}</span></span>
<h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>
<span class="meta">${dateFr(p.published_at)} · ${Math.max(1, Math.round((p.words || 800) / 200))} min de lecture</span></div></a>`;

const catChips = (active) => `<nav class="cats" aria-label="Rubriques"><a class="chip${active ? '' : ' on'}" href="${BLOG}">Tout</a>${CATEGORY_KEYS.map((k) => `<a class="chip${active === k ? ' on' : ''}" href="${BLOG}/rubrique/${k}">${esc(CATEGORIES[k].label)}</a>`).join('')}</nav>`;

async function listPage(db, { category, page }) {
    const cat = category ? CATEGORIES[category] : null;
    if (category && !cat) return null;
    const params = category ? [category] : [];
    const where = `status = 'published'${category ? ' AND category = $1' : ''}`;
    const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total FROM blog_posts WHERE ${where}`, params);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) return null;
    const { rows } = await db.query(`SELECT ${POST_COLS} FROM blog_posts WHERE ${where} ORDER BY published_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
    const base = category ? `${BLOG}/rubrique/${category}` : BLOG;
    const pageUrl = (n) => (n === 1 ? base : `${base}?page=${n}`);
    const title = cat ? `${cat.label} : articles nature | Blog NatureDex` : `Blog nature : fun facts, actualités et portraits d'espèces | NatureDex`;
    const description = cat
        ? `Tous les articles « ${cat.label} » du blog NatureDex : des textes sourcés pour découvrir le vivant autrement.`
        : 'Fun facts, actualités nature, espèces menacées, fossiles, champignons, oiseaux… Un nouvel article sourcé chaque jour sur le blog NatureDex.';
    const [first, ...rest] = rows;
    const body = `<main class="wrap">
<p class="crumbs"><a href="${SITE}/">NatureDex</a> › ${cat ? `<a href="${BLOG}">Blog</a> › ${esc(cat.label)}` : 'Blog'}</p>
<h1>${cat ? esc(cat.label) : 'Le blog nature de NatureDex'}</h1>
<p class="lead" style="max-width:720px">${cat ? esc(description) : 'Un nouvel article chaque jour pour découvrir le vivant : fun facts, actualités, portraits d\'espèces, records, fossiles et petites bêtes. Toujours avec les sources.'}</p>
${catChips(category)}
${rows.length ? `${page === 1 && first ? card(first, true) : ''}
<div class="grid" style="margin-top:22px">${(page === 1 ? rest : rows).map((p) => card(p)).join('')}</div>` : '<p class="meta">Les premiers articles arrivent très bientôt.</p>'}
${pages > 1 ? `<nav class="pager">${page > 1 ? `<a href="${pageUrl(page - 1)}">← Plus récents</a>` : ''}${page < pages ? `<a href="${pageUrl(page + 1)}">Plus anciens →</a>` : ''}</nav>` : ''}
</main>`;
    const head = (rows.length ? '' : '<meta name="robots" content="noindex, follow">') + jsonLd({
        '@context': 'https://schema.org', '@type': cat ? 'CollectionPage' : 'Blog', name: cat ? cat.label : 'Blog NatureDex', url: pageUrl(page), inLanguage: 'fr-FR', description,
        publisher: { '@type': 'Organization', name: 'NatureDex', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/og.png` } },
    });
    return html(layout({
        title: page > 1 ? `${title} – page ${page}` : title, description, canonical: pageUrl(page), image: first ? first.image_url : `${SITE}/og.png`, head, body,
        prev: page > 1 ? pageUrl(page - 1) : null, next: page < pages ? pageUrl(page + 1) : null,
    }));
}

async function postPage(db, slug) {
    const { rows: [p] } = await db.query(`SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published'`, [slug]);
    if (!p) return null;
    const cat = CATEGORIES[p.category] || { label: p.category };
    const { rows: cards } = await db.query(`SELECT id, name, sci_name, thumb_url FROM cards WHERE id = ANY($1)`, [p.card_ids]);
    const { rows: related } = await db.query(
        `SELECT ${POST_COLS} FROM blog_posts WHERE status = 'published' AND id <> $1 ORDER BY (category = $2) DESC, published_at DESC LIMIT 3`, [p.id, p.category]);
    const b = p.body;
    const url = postUrl(p.slug);
    const minutes = Math.max(1, Math.round((b.words || 800) / 200));
    const section = (s) => `<h2>${esc(s.h2)}</h2>${(s.paragraphs || []).map((t) => `<p>${esc(t)}</p>`).join('')}${s.bullets?.length ? `<ul>${s.bullets.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
    const body = `<main class="wrap narrow">
<p class="crumbs"><a href="${SITE}/">NatureDex</a> › <a href="${BLOG}">Blog</a> › <a href="${BLOG}/rubrique/${p.category}">${esc(cat.label)}</a></p>
<article>
<a class="chip" href="${BLOG}/rubrique/${p.category}">${esc(cat.label)}</a>
<h1>${esc(p.title)}</h1>
<p class="meta">Publié le <time datetime="${p.published_at.toISOString()}">${dateFr(p.published_at)}</time> · ${minutes} min de lecture · par la rédaction NatureDex</p>
<figure class="hero" style="margin-left:0;margin-right:0"><img src="${esc(thumb(p.image_url, 960))}" alt="${esc(p.image_alt)}" width="960" height="640" fetchpriority="high">
<figcaption>${esc(p.image_alt)} — Photo : <a href="${esc(p.image_credit)}" rel="noopener" target="_blank">Wikimedia Commons</a>, licence libre</figcaption></figure>
<p class="lead">${esc(p.excerpt)}</p>
${b.keyFacts?.length ? `<aside class="box gold"><h2 style="font-size:1.3rem">À retenir</h2><ul>${b.keyFacts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></aside>` : ''}
${b.sections.map(section).join('\n')}
${cards.length ? `<section class="box"><h2 style="font-size:1.3rem">${cards.length > 1 ? 'Ces espèces' : 'Cette espèce'} dans NatureDex</h2>
<p class="meta">Leur fiche complète, et leur carte à collectionner en ouvrant des boosters gratuits.</p>
<div class="cards">${cards.map((c) => `<a href="${speciesUrl(c)}"><img src="${esc(thumb(c.thumb_url, 330))}" alt="${esc(c.name)}" loading="lazy" width="330" height="330"><span>${esc(c.name)}</span></a>`).join('')}</div></section>` : ''}
${b.faq?.length ? `<section><h2>Questions fréquentes</h2>${b.faq.map((f) => `<details open><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
<section class="sources"><h2 style="font-size:1.3rem">Sources</h2><ul>${p.sources.map((s) => `<li>${esc(s.publisher)} : <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a></li>`).join('')}</ul>
<p class="meta">Article rédigé avec l'aide d'une IA à partir de ces sources, puis publié par NatureDex.</p></section>
${p.tags?.length ? `<p>${p.tags.map((t) => `<span class="chip" style="margin:0 6px 6px 0;text-transform:none">#${esc(t)}</span>`).join('')}</p>` : ''}
</article>
<aside class="box gold join"><div><h3 style="margin:0 0 4px;font-size:1.35rem;color:#fff">Collectionne le vivant</h3><span class="meta">60 000 espèces réelles en cartes : ouvre des boosters, fais le quiz du jour, échange avec tes amis.</span></div>
<a class="cta" href="${SITE}/connexion?mode=register">Créer mon compte gratuit</a></aside>
${related.length ? `<section><h2>À lire aussi</h2><div class="grid">${related.map((r) => card(r)).join('')}</div></section>` : ''}
</main>`;
    const head = `<meta property="article:published_time" content="${p.published_at.toISOString()}">
<meta property="article:section" content="${esc(cat.label)}">
${(p.tags || []).map((t) => `<meta property="article:tag" content="${esc(t)}">`).join('')}
${jsonLd({
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description, image: [p.image_url], datePublished: p.published_at.toISOString(),
        dateModified: p.published_at.toISOString(), inLanguage: 'fr-FR', mainEntityOfPage: url, url, articleSection: cat.label, keywords: (p.tags || []).join(', '), wordCount: b.words,
        author: { '@type': 'Organization', name: 'NatureDex', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'NatureDex', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/og.png` } },
        citation: p.sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url, publisher: s.publisher })),
    })}
${jsonLd({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'NatureDex', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: BLOG },
            { '@type': 'ListItem', position: 3, name: cat.label, item: `${BLOG}/rubrique/${p.category}` },
            { '@type': 'ListItem', position: 4, name: p.title, item: url },
        ],
    })}
${b.faq?.length ? jsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: b.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) : ''}`;
    return html(layout({ title: `${p.title} | NatureDex`, description: p.description, canonical: url, image: p.image_url, type: 'article', head, body }));
}

async function sitemap(db) {
    const { rows } = await db.query(`SELECT slug, category, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`);
    const last = rows[0]?.published_at?.toISOString() || new Date().toISOString();
    const url = (loc, lastmod, extra = '') => `<url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod>${extra}</url>`;
    const catLast = {};
    for (const r of rows) catLast[r.category] ??= r.published_at.toISOString();
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url(BLOG, last)}
${Object.entries(catLast).map(([k, d]) => url(`${BLOG}/rubrique/${k}`, d)).join('\n')}
${rows.map((r) => url(postUrl(r.slug), r.published_at.toISOString())).join('\n')}
</urlset>`);
}

async function rss(db) {
    const { rows } = await db.query(`SELECT ${POST_COLS} FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30`);
    return { ...xml(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Blog NatureDex</title><link>${BLOG}</link><description>Un article nature sourcé chaque jour.</description><language>fr</language>
<atom:link href="${BLOG}/rss.xml" rel="self" type="application/rss+xml"/>
${rows.map((p) => `<item><title>${esc(p.title)}</title><link>${postUrl(p.slug)}</link><guid>${postUrl(p.slug)}</guid><pubDate>${p.published_at.toUTCString()}</pubDate><category>${esc(CATEGORIES[p.category]?.label || p.category)}</category><description>${esc(p.excerpt)}</description><enclosure url="${esc(thumb(p.image_url))}" type="image/jpeg" length="0"/></item>`).join('\n')}
</channel></rss>`), headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } };
}

const notFound = () => html(layout({
    title: 'Article introuvable | NatureDex', description: "Cet article n'existe pas ou plus.", canonical: BLOG, image: `${SITE}/og.png`,
    head: '<meta name="robots" content="noindex">',
    body: `<main class="wrap narrow"><h1>Article introuvable</h1><p>Cet article n'existe pas ou plus. <a href="${BLOG}">Voir tous les articles du blog</a>.</p></main>`,
}), 410, 60); // 410, not 404: the site's SPA fallback would turn a 404 into the app shell

/** GET /api/blog… → HTML page, sitemap or RSS. Returns null when the path is not a blog path. */
export async function blogRoute(db, path, query = {}) {
    const m = /^\/(?:api\/)?blog(\/.*)?$/.exec(path);
    if (!m) return null;
    const rest = (m[1] || '/').replace(/\/+$/, '') || '/';
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    if (rest === '/') return (await listPage(db, { page })) || notFound();
    if (rest === '/sitemap.xml') return sitemap(db);
    if (rest === '/rss.xml') return rss(db);
    const cat = /^\/rubrique\/([a-z-]+)$/.exec(rest);
    if (cat) return (await listPage(db, { category: cat[1], page })) || notFound();
    const post = /^\/([a-z0-9-]+)$/.exec(rest);
    return (post && (await postPage(db, post[1]))) || notFound();
}
