const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function fixDosaStatus() {
  try {
    console.log(
      "Updating 'Dosa Plain' and 'Idli (2 pcs)' to be split items...",
    );
    await pool.query(
      "UPDATE items SET is_separate = true WHERE name ILIKE 'Dosa Plain' OR name ILIKE 'Idli (2 pcs)'",
    );
    console.log("Updating 'Water Bottle' and 'Tea' to be regular items...");
    await pool.query(
      "UPDATE items SET is_separate = false WHERE name ILIKE 'Water Bottle' OR name ILIKE 'Tea'",
    );

    const res = await pool.query(
      "SELECT name, is_separate FROM items WHERE name ILIKE 'Dosa Plain' OR name ILIKE 'Idli (2 pcs)' OR name ILIKE 'Water Bottle' OR name ILIKE 'Tea'",
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

fixDosaStatus();
