const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
  try {
    const billsRes = await pool.query("SELECT * FROM bills WHERE table_no = 18");
    console.log("=== BILLS FOR TABLE 18 ===");
    console.log(billsRes.rows);

    const ordersRes = await pool.query("SELECT * FROM orders WHERE table_no = 18");
    console.log("\n=== ORDERS FOR TABLE 18 ===");
    console.log(ordersRes.rows);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();
