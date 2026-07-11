const pool = require('../src/db');
async function test() {
  const result = await pool.query("SELECT id, bill_date FROM orders ORDER BY id DESC LIMIT 1");
  const d = result.rows[0].bill_date;
  console.log("Type:", typeof d);
  console.log("instanceof Date:", d instanceof Date);
  console.log("Value:", d);
  console.log("toISOString:", d instanceof Date ? d.toISOString() : "N/A");
  
  // Also check local formatting
  if (d instanceof Date) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      console.log("Local Date:", `${year}-${month}-${day}`);
  }
}
test().then(() => process.exit(0));
