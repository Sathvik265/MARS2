const pool = require('../src/db');

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type, character_maximum_length 
    FROM information_schema.columns 
    WHERE table_name = 'items'
    ORDER BY ordinal_position;
  `);
  console.log("Items columns:", res.rows);
  pool.end();
}

run().catch(console.error);
