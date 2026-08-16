const pool = require('../src/db');

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'orders'
    ORDER BY ordinal_position;
  `);
  console.log("Orders columns:", res.rows);
  pool.end();
}

run().catch(console.error);
