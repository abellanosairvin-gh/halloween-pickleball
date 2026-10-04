// Applies db/migrations/*.sql in order (each once), then loads the roster from db/seed.sql if the
// players table is empty. Safe to re-run. Uses DATABASE_URL from the environment or .env.
// Run with: npm run db:setup
import { Client } from '@neondatabase/serverless';
import { readdirSync, readFileSync } from 'node:fs';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file; DATABASE_URL may already be in the environment.
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (in .env or the environment) to your Neon connection string first.');
  process.exit(1);
}

const client = new Client(url);
await client.connect();
try {
  await client.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const file of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    await client.query('begin');
    try {
      await client.query(readFileSync(`db/migrations/${file}`, 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  const { rows } = await client.query('select count(*)::int as n from players');
  if (rows[0].n === 0) {
    await client.query(readFileSync('db/seed.sql', 'utf8'));
    const after = await client.query('select count(*)::int as n from players');
    console.log(`Loaded ${after.rows[0].n} players from db/seed.sql`);
  } else {
    console.log(`Players already loaded (${rows[0].n}); left them as they are.`);
  }
} finally {
  await client.end();
}
