const pool = require('../src/db');

async function run() {
  console.log("Adding is_separate column to orders table...");
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_separate BOOLEAN DEFAULT FALSE;
  `);
  console.log("Column is_separate successfully added to orders table!");
  pool.end();
}

run().catch(console.error);
