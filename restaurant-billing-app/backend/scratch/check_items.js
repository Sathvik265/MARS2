const pool = require('../src/db');

async function run() {
  try {
    const res = await pool.query('SELECT count(*), max(created_at) FROM items');
    console.log('Total items in DB:', res.rows[0]);
    
    const sample = await pool.query('SELECT id, name, alpha_code, numeric_code, price_fixed, price_general, price_ac FROM items ORDER BY id DESC LIMIT 10');
    console.log('Most recent 10 items in DB:');
    console.table(sample.rows);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    pool.end();
  }
}

run();
