const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkLastBill() {
  try {
    const res = await pool.query(
      "SELECT id, bill_number, items_json FROM bills WHERE bill_number > 0 ORDER BY created_at DESC LIMIT 1",
    );
    if (res.rows.length > 0) {
      console.log(
        "Last Bill ID:",
        res.rows[0].id,
        "Number:",
        res.rows[0].bill_number,
      );
      console.log("Items JSON:");
      console.log(JSON.stringify(res.rows[0].items_json, null, 2));
    } else {
      console.log("No bills found.");
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkLastBill();
