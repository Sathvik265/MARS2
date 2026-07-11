const pool = require('../src/db');
pool.query("SELECT * FROM items WHERE UPPER(alpha_code) = '100' OR CAST(numeric_code AS TEXT) = '100'").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
