const pool = require("../src/db");

async function fix() {
  const client = await pool.connect();
  try {
    console.log("Starting FIX migration...");
    await client.query("BEGIN");

    // Try dropping as constraint
    try {
      console.log(
        "Attempting to drop CONSTRAINT bills_bill_number_bill_date_key..."
      );
      await client.query(
        "ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_bill_date_key"
      );
      console.log("Drop constraint command executed.");
    } catch (e) {
      console.log("Error dropping constraint:", e.message);
    }

    // Try dropping as index
    try {
      console.log(
        "Attempting to drop INDEX bills_bill_number_bill_date_key..."
      );
      await client.query(
        "DROP INDEX IF EXISTS bills_bill_number_bill_date_key"
      );
      console.log("Drop index command executed.");
    } catch (e) {
      console.log("Error dropping index:", e.message);
    }

    // Add new constraint IF NOT EXISTS
    // We can't use IF NOT EXISTS for ADD CONSTRAINT in standard SQL easily without a block,
    // so we wrap in try/catch or assume it might fail if already added
    try {
      console.log("Adding new UNIQUE constraint...");
      await client.query(`
            ALTER TABLE bills 
            ADD CONSTRAINT bills_bill_number_bill_date_track_key 
            UNIQUE (bill_number, bill_date, track);
        `);
      console.log("New constraint added.");
    } catch (e) {
      console.log(
        "Error adding new constraint (might already exist):",
        e.message
      );
    }

    await client.query("COMMIT");
    console.log("FIX Migration successful");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FIX Migration failed:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

fix();
