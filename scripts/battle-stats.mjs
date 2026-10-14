// Stores each card's battle stats (ATQ, DÉF, VIT) in cards.stats, from the shared engine.
// Run after build-catalog.mjs: DATABASE_URL=… node scripts/battle-stats.mjs
import pg from 'pg';
import { battleStats } from '../functions/api/battle.mjs';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
await db.connect();
const { rows } = await db.query(`SELECT id, type, rarity, stats FROM cards`);
for (let i = 0; i < rows.length; i += 5000) {
    const chunk = rows.slice(i, i + 5000).map((c) => ({ id: c.id, ...battleStats(c) }));
    await db.query(
        `UPDATE cards c SET stats = c.stats || jsonb_build_object('atk', v.atk, 'def', v.def, 'spd', v.spd)
         FROM unnest($1::int[], $2::int[], $3::int[], $4::int[]) AS v(id, atk, def, spd) WHERE c.id = v.id`,
        [chunk.map((c) => c.id), chunk.map((c) => c.atk), chunk.map((c) => c.def), chunk.map((c) => c.spd)]
    );
}
console.log(`${rows.length} cards updated`);
await db.end();
