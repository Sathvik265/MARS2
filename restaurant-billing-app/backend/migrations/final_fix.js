const pool = require("../src/db");

async function finalFix() {
  const client = await pool.connect();
  try {
    console.log("Starting FINAL FIX...");
    await client.query("BEGIN");

    try {
      console.log("Dropping CONSTRAINT... CASCADE");
      await client.query(
        "ALTER TABLE bills DROP CONSTRAINT bills_bill_number_bill_date_key CASCADE"
      );
      console.log("Dropped constraint.");
    } catch (e) {
      console.log("Drop Constraint Error:", e.message);
    }

    try {
      console.log("Dropping INDEX... CASCADE");
      await client.query("DROP INDEX bills_bill_number_bill_date_key CASCADE");
      console.log("Dropped index.");
    } catch (e) {
      console.log("Drop Index Error:", e.message);
    }

    // Add new constraint
    try {
      console.log("Adding new constraint...");
      await client.query(`
            ALTER TABLE bills 
            ADD CONSTRAINT bills_bill_number_bill_date_track_key 
            UNIQUE (bill_number, bill_date, track);
        `);
      console.log("Added new constraint.");
    } catch (e) {
      // e.g. already exists
      console.log("Add Constraint Error:", e.message);
    }

    await client.query("COMMIT");
    console.log("FINAL FIX SUCCESS");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FINAL FIX FAILED:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

finalFix();
