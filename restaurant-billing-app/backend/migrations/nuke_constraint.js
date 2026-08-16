const pool = require("../src/db");

async function nuke() {
  const client = await pool.connect();
  try {
    console.log("Starting NUKE migration...");

    // Check if it exists
    const checkBefore = await client.query(`
        SELECT count(*) FROM pg_constraint WHERE conname = 'bills_bill_number_bill_date_key'
    `);
    console.log("Constraint exists before?", checkBefore.rows[0].count);

    await client.query("BEGIN");

    // Force drop constraint
    try {
      await client.query(
        "ALTER TABLE bills DROP CONSTRAINT bills_bill_number_bill_date_key CASCADE"
      );
      console.log("DROPPED CONSTRAINT bills_bill_number_bill_date_key CASCADE");
    } catch (e) {
      console.log("Failed to drop constraint:", e.message);
    }

    // Force drop index
    try {
      await client.query("DROP INDEX bills_bill_number_bill_date_key CASCADE");
      console.log("DROPPED INDEX bills_bill_number_bill_date_key CASCADE");
    } catch (e) {
      console.log("Failed to drop index:", e.message);
    }

    // Check if it exists
    const checkAfter = await client.query(`
        SELECT count(*) FROM pg_constraint WHERE conname = 'bills_bill_number_bill_date_key'
    `);
    console.log("Constraint exists after?", checkAfter.rows[0].count);

    // Ensure new constraint is there
    try {
      await client.query(`
            ALTER TABLE bills 
            ADD CONSTRAINT bills_bill_number_bill_date_track_key 
            UNIQUE (bill_number, bill_date, track);
        `);
      console.log("Added new constraint.");
    } catch (e) {
      console.log("New constraint add error (maybe exists):", e.message);
    }

    await client.query("COMMIT");
    console.log("NUKE complete");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("NUKE failed:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

nuke();
