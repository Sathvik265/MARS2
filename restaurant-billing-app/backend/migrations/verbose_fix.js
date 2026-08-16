const pool = require("../src/db");

async function verboseFix() {
  const client = await pool.connect();
  try {
    console.log("Starting VERBOSE FIX...");

    // DROP
    try {
      console.log("Dropping constraint...");
      await client.query(
        "ALTER TABLE bills DROP CONSTRAINT bills_bill_number_bill_date_key"
      );
      console.log("Dropped constraint successfully.");
    } catch (e) {
      console.log("DROP CONSTRAINT Error:", e.message);
    }

    try {
      console.log("Dropping index...");
      await client.query("DROP INDEX bills_bill_number_bill_date_key");
      console.log("Dropped index successfully.");
    } catch (e) {
      console.log("DROP INDEX Error:", e.message);
    }

    // ADD
    try {
      console.log("Adding new constraint...");
      await client.query(`
            ALTER TABLE bills 
            ADD CONSTRAINT bills_bill_number_bill_date_track_key 
            UNIQUE (bill_number, bill_date, track);
        `);
      console.log("Added new constraint successfully.");
    } catch (e) {
      console.log("ADD CONSTRAINT Error:", e.message);
    }
  } catch (e) {
    console.error("General Error:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

verboseFix();
