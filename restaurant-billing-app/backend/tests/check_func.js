const pool = require('../src/db');
async function check() {
  const result = await pool.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'move_orders_to_bill_json'
  `);
  console.log(result.rows[0].pg_get_functiondef);
  process.exit(0);
}
check().catch(console.error);
