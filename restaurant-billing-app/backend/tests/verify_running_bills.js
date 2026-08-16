const pool = require("../src/db/index");

async function verify() {
  try {
    const result = await pool.query("SELECT * FROM running_bills");
    console.log("running_bills content:", result.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
verify();
