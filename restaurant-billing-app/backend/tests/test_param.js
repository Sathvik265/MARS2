const pool = require('../src/db');
async function run() {
  const code = '100';
  const result = await pool.query(
    "SELECT * FROM items WHERE (UPPER(alpha_code) = $1 OR CAST(numeric_code AS TEXT) = $1) LIMIT 1",
    [code.toUpperCase()]
  );
  console.log('Result for $1:', result.rows);
  process.exit(0);
}
run();
