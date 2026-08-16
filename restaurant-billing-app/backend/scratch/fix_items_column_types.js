const pool = require('../src/db');

async function run() {
  console.log("Altering column category in items table to VARCHAR(255)...");
  
  await pool.query(`
    ALTER TABLE items ALTER COLUMN category TYPE varchar(255);
  `);
  
  console.log("Successfully altered category column to VARCHAR(255)!");
  pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
