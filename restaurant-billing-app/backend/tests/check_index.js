const pool = require("../src/db/index");

async function checkIndex() {
  try {
    const res = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'bills' AND indexname = 'bills_bill_number_bill_date_key'
    `);
    console.log("INDEX INFO:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkIndex();
