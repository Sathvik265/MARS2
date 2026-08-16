const pool = require("../src/db");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Starting migration...");
    await client.query("BEGIN");

    // 1. Drop the old global unique constraint if it exists
    // We try to match standard naming or just try to drop known names
    // Based on previous check: "bills_bill_number_bill_date_key"
    try {
      await client.query(`
            ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_bill_date_key;
        `);
      console.log("Dropped constraint bills_bill_number_bill_date_key");
    } catch (e) {
      console.log("Could not drop constraint (might not exist):", e.message);
    }

    // 2. Add new unique constraint (bill_number, bill_date, track)
    // We add track to the uniqueness
    await client.query(`
        ALTER TABLE bills 
        ADD CONSTRAINT bills_bill_number_bill_date_track_key 
        UNIQUE (bill_number, bill_date, track);
    `);
    console.log("Added constraint bills_bill_number_bill_date_track_key");

    await client.query("COMMIT");
    console.log("Migration successful");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    // Force exit since pool might keep connection open
    process.exit(0);
  }
}

migrate();
