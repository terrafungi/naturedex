/**
 * Body mass check: Wikidata's mass (P2067) is often a newborn, an egg or a typo (a jaguar at
 * 0.8 kg, a kangaroo at 0.8 g). An LLM gives the typical adult mass of each species; a stored
 * value more than MAX_RATIO away from it is replaced (the Wikidata value is kept as mass_wd).
 * stats.mass_checked: 'ok' = trusted (the quiz only compares these), 'unknown' = no estimate.
 * Runs one batch per scheduled minute until every card with a mass is checked.
 * Free Gemini key only (GEMINI_API_KEY): never billed to the project's credits.
 */
const MODEL = 'gemini-flash-lite-latest';
const PER_TICK = 50;
const MAX_RATIO = 3;

async function llm(text) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 8000 } }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status} ${(await res.text()).slice(0, 150)}`);
    const data = await res.json();
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

const prompt = (cards) => `Pour chaque espèce ci-dessous, donne la masse corporelle typique d'un individu ADULTE, en kilogrammes
(moyenne adulte, pas un nouveau-né, pas un œuf ; pour une espèce fossile, l'estimation scientifique usuelle).
Si tu ne sais vraiment pas, mets null. Réponds uniquement en JSON : [{"id": <id>, "kg": <nombre ou null>}]

${cards.map((c) => `${c.id} | ${c.sci_name || ''} | ${c.name} | ${c.type}`).join('\n')}`;

/** Called every minute by the schedule. */
export async function massCheckTick(db) {
    if (!process.env.GEMINI_API_KEY) return;
    // claim a batch (a claim older than 5 minutes is a crashed run: take it again)
    const { rows: cards } = await db.query(`
        UPDATE cards SET stats = stats || jsonb_build_object('mass_claim', extract(epoch FROM now())::int)
        WHERE id IN (
            SELECT id FROM cards
            WHERE (stats->>'mass_kg')::float > 0 AND stats->>'mass_checked' IS NULL
              AND coalesce((stats->>'mass_claim')::int, 0) < extract(epoch FROM now()) - 300
            ORDER BY views DESC LIMIT ${PER_TICK} FOR UPDATE SKIP LOCKED)
        RETURNING id, name, sci_name, type, (stats->>'mass_kg')::float AS kg`);
    if (!cards.length) return;
    const answers = await llm(prompt(cards));
    const byId = new Map((Array.isArray(answers) ? answers : []).map((a) => [Number(a.id), Number(a.kg)]));
    let fixed = 0;
    for (const c of cards) {
        const ai = byId.get(c.id);
        if (!byId.has(c.id)) continue; // left out of the answer: retried after the claim expires
        if (!(ai > 0)) {
            await db.query(`UPDATE cards SET stats = (stats - 'mass_claim') || '{"mass_checked": "unknown"}' WHERE id = $1`, [c.id]);
            continue;
        }
        const off = Math.max(ai / c.kg, c.kg / ai) > MAX_RATIO;
        if (off) fixed++;
        await db.query(`UPDATE cards SET stats = (stats - 'mass_claim') || $2::jsonb WHERE id = $1`,
            [c.id, JSON.stringify(off ? { mass_checked: 'ok', mass_kg: Number(ai.toPrecision(3)), mass_wd: c.kg } : { mass_checked: 'ok' })]);
    }
    console.log(`mass check: ${cards.length} vérifiées, ${fixed} corrigées`);
}
