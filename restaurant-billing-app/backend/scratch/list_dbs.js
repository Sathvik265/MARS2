const pool = require('../src/db');

async function run() {
  try {
    const res = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('All databases in PG:', res.rows.map(r => r.datname));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    pool.end();
  }
}

run();
