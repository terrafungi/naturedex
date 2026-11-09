/**
 * Biome of each card, for the card game's energy system: an LLM picks the one biome where
 * the species mostly lives (or lived). stats.biome = one of BIOMES; 'none' when it cannot tell.
 * Runs a few batches per scheduled minute until every card has one.
 */
const MODEL = 'gemini-3.5-flash';
const PER_BATCH = 150;
const BATCHES = 2;
export const BIOMES = ['foret', 'ocean', 'montagne', 'desert', 'prairie', 'humide', 'ciel'];

async function llm(text) {
    const res = await fetch(`https://proxy.openkbs.com/v1/google/models/${MODEL}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENKBS_API_KEY}` }, signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 12000 } }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status} ${(await res.text()).slice(0, 150)}`);
    const data = await res.json();
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

const prompt = (cards) => `Pour chaque espèce ou élément naturel ci-dessous, choisis LE biome où on le trouve le plus typiquement :
foret (forêts, bois, jungles), ocean (mers, récifs, littoral marin), montagne (montagnes, falaises, grottes, roches),
desert (déserts, steppes arides, savanes sèches), prairie (prairies, champs, jardins, villes), humide (rivières, lacs, marais, mares),
ciel (espèces qui passent l'essentiel de leur vie en vol : martinets, hirondelles, grands rapaces planeurs, albatros…).
Un oiseau forestier va en foret, un oiseau d'eau en humide ou ocean. Pour un fossile : son milieu de vie. Pour un minéral : où il se forme.
Pour un microbe ou un virus : le milieu de son hôte. Réponds uniquement en JSON : [{"id": <id>, "b": "<biome>"}]

${cards.map((c) => `${c.id} | ${c.sci_name || ''} | ${c.name} | ${c.type}`).join('\n')}`;

async function batch(db) {
    // claim a batch (a claim older than 5 minutes is a crashed run: take it again)
    const { rows: cards } = await db.query(`
        UPDATE cards SET stats = stats || jsonb_build_object('biome_claim', extract(epoch FROM now())::int)
        WHERE id IN (
            SELECT id FROM cards
            WHERE stats->>'biome' IS NULL AND type <> 'naturalist' AND coalesce((stats->>'biome_claim')::int, 0) < extract(epoch FROM now()) - 300
            ORDER BY EXISTS (SELECT 1 FROM user_cards uc WHERE uc.card_id = cards.id) DESC, views DESC -- players' cards first: their decks need them
            LIMIT ${PER_BATCH} FOR UPDATE SKIP LOCKED)
        RETURNING id, name, sci_name, type`);
    if (!cards.length) return 0;
    const answers = await llm(prompt(cards));
    const byId = new Map((Array.isArray(answers) ? answers : []).map((a) => [Number(a.id), String(a.b || '').toLowerCase()]));
    const ids = [], biomes = [];
    for (const c of cards) {
        if (!byId.has(c.id)) continue; // left out of the answer: retried after the claim expires
        ids.push(c.id);
        biomes.push(BIOMES.includes(byId.get(c.id)) ? byId.get(c.id) : 'none');
    }
    await db.query(`UPDATE cards c SET stats = (c.stats - 'biome_claim') || jsonb_build_object('biome', v.b)
                    FROM unnest($1::int[], $2::text[]) AS v(id, b) WHERE c.id = v.id`, [ids, biomes]);
    return ids.length;
}

/** Called every minute by the schedule. */
export async function biomeCheckTick(db) {
    if (!process.env.OPENKBS_API_KEY) return;
    const done = await Promise.all(Array.from({ length: BATCHES }, () => batch(db).catch((err) => { console.error('biomeCheck', err.message); return 0; })));
    const n = done.reduce((a, b) => a + b, 0);
    if (n) console.log(`biome check: ${n} cartes`);
}
