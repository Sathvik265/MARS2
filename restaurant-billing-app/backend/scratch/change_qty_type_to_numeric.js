const pool = require('../src/db');

async function run() {
  console.log("Altering column quantity in orders table to NUMERIC...");
  
  await pool.query(`
    ALTER TABLE orders ALTER COLUMN quantity TYPE NUMERIC;
  `);
  
  console.log("Successfully altered quantity column to NUMERIC!");
  pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
