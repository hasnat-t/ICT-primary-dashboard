// Optional Postgres storage for the ICT Primary dashboard: keeps the last good payload so a fresh deploy
// starts with data instead of waiting for the first refresh. Without DATABASE_URL the server uses only its
// cache file, which a redeploy wipes.
let pool = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_cache (
  id smallint PRIMARY KEY,
  payload jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);`;

async function init() {
  if (!process.env.DATABASE_URL) return false;
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  await pool.query(SCHEMA);
  return true;
}
const enabled = () => pool !== null;

async function loadCache() {
  if (!pool) return null;
  const r = await pool.query('SELECT payload FROM app_cache WHERE id = 1');
  return r.rows[0] ? r.rows[0].payload : null;
}

async function saveCache(payload) {
  await pool.query(`INSERT INTO app_cache (id, payload, saved_at) VALUES (1, $1, now())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, saved_at = now()`, [JSON.stringify(payload)]);
}

const getPool = () => pool;

module.exports = { init, enabled, loadCache, saveCache, getPool };
