const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkItems() {
  try {
    const res = await pool.query(
      "SELECT name, alpha_code, numeric_code, is_separate FROM items WHERE name ILIKE '%Dosa%' OR name ILIKE '%Coffee%' OR name ILIKE '%Tea%' OR name ILIKE '%water%'",
    );
    console.log("Items and their is_separate status:");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkItems();
