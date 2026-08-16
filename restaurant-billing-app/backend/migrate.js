const pool = require("./src/db/index");

async function migrate() {
  try {
    console.log("Starting migration...");
    await pool.query("ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_bill_date_key CASCADE");
    await pool.query("DROP INDEX IF EXISTS bills_bill_number_bill_date_key");
    await pool.query("CREATE UNIQUE INDEX bills_bill_num_date_track_unique ON bills (bill_number, bill_date, track)");
    console.log("Migration successful.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit();
  }
}

migrate();
