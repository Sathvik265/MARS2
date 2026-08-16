const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkBill12() {
  try {
    const res = await pool.query(
      "SELECT id, bill_number, items_json FROM bills WHERE bill_number = 12 AND bill_date = '2026-02-12' OR (bill_number = 12 AND bill_date = '2026-02-11')",
    );
    if (res.rows.length > 0) {
      res.rows.forEach((row) => {
        console.log("Bill ID:", row.id, "Number:", row.bill_number);
        console.log("Items JSON:");
        console.log(JSON.stringify(row.items_json, null, 2));
      });
    } else {
      console.log("Bill #12 not found.");
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkBill12();
