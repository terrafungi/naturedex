/**
 * Species page enrichment: for cards whose Wikipédia intro is too short to make an indexable
 * page, gather the full French and English Wikipédia articles and have an LLM write an
 * original French fiche from them only. Sources are stored with the text and cited on the page.
 * Runs a few cards per scheduled minute on the free Gemini key, most popular species first;
 * a quota error pauses the job for an hour, so it simply resumes when the daily quota resets.
 */
import { DRUGS, fetchText } from './blog.mjs';

const MODEL = 'gemini-flash-lite-latest'; // own free-tier quota, separate from the blog's models
const PER_TICK = 4;
const MIN_SOURCE = 600; // characters of source text below which we do not write anything
const MIN_WORDS = 120;
const MAX_ATTEMPTS = 3;
const MIN_EXTRACT = 200; // same bar as species.mjs: above it the page is already indexable

const STOP_FR = /\n==+ ?(Notes et références|Références|Voir aussi|Liens externes|Bibliographie|Annexes|Publication originale) ?==+/;
const STOP_EN = /\n==+ ?(References|See also|External links|Notes|Further reading|Bibliography|Sources) ?==+/;

async function article(lang, title, stop, max) {
    const api = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|info&inprop=url&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
    const page = Object.values(JSON.parse(await fetchText(api)).query?.pages || {})[0];
    let text = page?.extract || '';
    const cut = text.search(stop);
    if (cut > 0) text = text.slice(0, cut);
    text = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
    return text ? { text, url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` } : null;
}

async function sources(card) {
    // Wikispecies cards link to en.wikipedia: they have no French article.
    const frTitle = card.wiki_url.includes('://fr.') ? decodeURIComponent(card.wiki_url.split('/wiki/')[1] || '') : '';
    const [fr, enTitle] = await Promise.all([
        frTitle ? article('fr', frTitle, STOP_FR, 9000).catch(() => null) : null,
        fetchText(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids=${card.qid}`)
            .then((t) => JSON.parse(t).entities?.[card.qid]?.sitelinks?.enwiki?.title).catch(() => null),
    ]);
    const en = enTitle ? await article('en', enTitle, STOP_EN, 7000).catch(() => null) : null;
    return [
        fr && { lang: 'fr', publisher: 'Wikipédia (français)', title: frTitle.replace(/_/g, ' '), ...fr },
        en && { lang: 'en', publisher: 'Wikipédia (anglais)', title: enTitle, ...en },
    ].filter(Boolean);
}

function prompt(card, docs) {
    const sci = card.sci_name && card.sci_name !== card.name ? ` (${card.sci_name})` : '';
    const text = docs.map((d) => d.text).join(' ');
    return `Tu rédiges la fiche encyclopédique de l'espèce « ${card.name}${sci} » pour NatureDex (naturedex.fr), un site sur les espèces du vivant.

${docs.map((d, i) => `### Document ${i + 1} — ${d.publisher} : ${d.title}\n${d.text}`).join('\n\n')}
${DRUGS.test(text) ? `
Cette espèce a des propriétés psychoactives : reste informatif (histoire, usages culturels, chimie, statut légal, risques), sans aucun conseil de cueillette, de préparation, de dosage ou de consommation.
` : ''}
Réponds UNIQUEMENT avec un objet JSON de cette forme :
{
  "intro": "2 à 3 phrases qui présentent l'espèce : ce qu'elle est, où elle vit, ce qui la distingue",
  "sections": [{ "h2": "intertitre court et descriptif", "paragraphs": ["1 à 3 paragraphes de 2 à 5 phrases"] }],
  "facts": ["0 à 4 faits marquants, une phrase courte chacun"]
}
Contraintes :
- En français, ton clair et vivant de vulgarisation scientifique, vouvoiement implicite (pas de « tu »).
- N'utilise QUE des informations présentes dans les documents. N'invente aucun chiffre, lieu, date ou comportement. Si les documents sont pauvres, écris court plutôt que de remplir.
- Sections possibles selon ce que disent les documents : Description, Répartition et habitat, Mode de vie, Alimentation, Reproduction, Classification, Conservation, Relations avec l'humain. Omets toute section sans matière. 1 à 5 sections.
- Reformule tout, ne recopie pas de phrases. Traduis ce qui vient de l'anglais.
- Pas de markdown, pas de liens, pas d'émojis, n'évoque pas les documents.`;
}

function validate(out) {
    const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
    if (!str(out.intro, 40, 900)) throw new Error('intro invalide');
    const sections = (Array.isArray(out.sections) ? out.sections : [])
        .filter((s) => str(s.h2, 3, 80) && Array.isArray(s.paragraphs))
        .map((s) => ({ h2: s.h2.trim(), paragraphs: s.paragraphs.filter((p) => str(p, 20, 2000)).map((p) => p.trim()) }))
        .filter((s) => s.paragraphs.length).slice(0, 6);
    const facts = (Array.isArray(out.facts) ? out.facts : []).filter((f) => str(f, 10, 300)).map((f) => f.trim()).slice(0, 4);
    const all = [out.intro, ...sections.flatMap((s) => [s.h2, ...s.paragraphs]), ...facts].join(' ');
    if (/[*#`]|https?:\/\//.test(all)) throw new Error('markdown ou lien');
    const words = all.split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS) throw new Error(`trop court (${words} mots)`);
    return { intro: out.intro.trim(), sections, facts, words };
}

class QuotaError extends Error {}

async function llm(text) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new QuotaError('pas de clé Gemini gratuite');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 4000 } }),
    });
    if (res.status === 429) throw new QuotaError('quota Gemini gratuit atteint');
    if (!res.ok) throw new Error(`LLM ${res.status} ${(await res.text()).slice(0, 150)}`);
    const data = await res.json();
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

async function enrich(db, card) {
    const docs = await sources(card);
    const size = docs.reduce((a, d) => a + d.text.length, 0);
    if (size < MIN_SOURCE) {
        await db.query(`UPDATE species_texts SET status = 'thin', error = $2, updated_at = now() WHERE card_id = $1`, [card.id, `${size} caractères de source`]);
        return 'thin';
    }
    const body = validate(await llm(prompt(card, docs)));
    await db.query(`UPDATE species_texts SET status = 'ok', body = $2, sources = $3, model = $4, error = NULL, updated_at = now() WHERE card_id = $1`,
        [card.id, body, JSON.stringify(docs.map(({ lang, publisher, title, url }) => ({ lang, publisher, title, url }))), MODEL]);
    return 'ok';
}

/** Called every minute by the schedule. */
export async function speciesEnrichTick(db) {
    if (!process.env.GEMINI_API_KEY) return;
    const { rows: [paused] } = await db.query(`SELECT 1 FROM species_texts WHERE status = 'quota' AND updated_at > now() - interval '1 hour' LIMIT 1`);
    if (paused) return;
    // claim the next cards atomically, so overlapping invocations never write the same fiche
    const { rows: cards } = await db.query(`
        WITH next AS (
            SELECT c.id FROM cards c LEFT JOIN species_texts t ON t.card_id = c.id
            WHERE length(coalesce(c.extract, '')) < ${MIN_EXTRACT}
              AND (t.card_id IS NULL OR (t.status IN ('failed', 'quota') AND t.attempts < ${MAX_ATTEMPTS})
                   OR (t.status = 'working' AND t.updated_at < now() - interval '5 minutes'))
            ORDER BY c.views DESC LIMIT ${PER_TICK}
        )
        INSERT INTO species_texts (card_id, status, attempts) SELECT id, 'working', 1 FROM next
        ON CONFLICT (card_id) DO UPDATE SET status = 'working', attempts = species_texts.attempts + 1, updated_at = now()
        RETURNING card_id`);
    if (!cards.length) return;
    const { rows } = await db.query(`SELECT id, qid, name, sci_name, wiki_url FROM cards WHERE id = ANY($1)`, [cards.map((c) => c.card_id)]);
    const results = await Promise.all(rows.map((card) => enrich(db, card).catch(async (err) => {
        const quota = err instanceof QuotaError;
        // a quota error is not the card's fault: give the attempt back
        await db.query(`UPDATE species_texts SET status = $2, error = $3, attempts = attempts - $4, updated_at = now() WHERE card_id = $1`,
            [card.id, quota ? 'quota' : 'failed', String(err.message).slice(0, 300), quota ? 1 : 0]);
        if (!quota) console.error('species enrich', card.id, err.message);
        return quota ? 'quota' : 'failed';
    })));
    console.log('species enrich', results.join(' '));
}
