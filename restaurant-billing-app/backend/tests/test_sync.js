const pool = require('../src/db');
(async () => {
  const r1 = await pool.query('SELECT * FROM running_bills');
  console.log('running_bills:', r1.rows);
  const r2 = await pool.query(
    "SELECT track, MAX(bill_number) as max_bn FROM bills WHERE bill_date = '2026-04-06' AND bill_number > 0 GROUP BY track"
  );
  console.log('actual max bills:', r2.rows);
  process.exit(0);
})();
