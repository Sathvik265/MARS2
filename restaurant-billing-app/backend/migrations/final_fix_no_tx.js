const pool = require("../src/db");

async function finalFixNoTx() {
  // Use a new client for each op or handle errors gracefully without transaction state
  // Actually, we can use one client, but if we don't BEGIN, errors won't block subsequent queries.
  const client = await pool.connect();
  try {
    console.log("Starting FINAL FIX (No Transaction)...");

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
      console.log("Add Constraint Error:", e.message);
    }

    console.log("FINAL FIX SUCCESS");
  } catch (e) {
    console.error("FINAL FIX FAILED:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

finalFixNoTx();
