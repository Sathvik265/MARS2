const pool = require('../src/db');

async function run() {
  const res = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'items'::regclass;
  `);
  console.log("Constraints on items table:", res.rows);
  pool.end();
}

run().catch(console.error);
