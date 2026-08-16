const pool = require('../src/db');

async function run() {
  try {
    const res = await pool.query("SELECT * FROM settings");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
