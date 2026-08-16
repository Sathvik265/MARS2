const pool = require('../src/db');

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'running_bills'
    ORDER BY ordinal_position;
  `);
  console.log("Running Bills columns:", res.rows);
  
  const rows = await pool.query("SELECT * FROM running_bills;");
  console.log("Running Bills data:", rows.rows);
  
  pool.end();
}

run().catch(console.error);
