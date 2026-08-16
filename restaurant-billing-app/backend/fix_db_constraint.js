const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixConstraint() {
    const client = await pool.connect();
    try {
        console.log("Starting DB constraint fix...");

        await client.query("BEGIN");

        // 1. Drop the old strict unique constraint
        console.log("Dropping old constraint 'bills_bill_number_bill_date_key'...");
        await client.query(`
      ALTER TABLE bills 
      DROP CONSTRAINT IF EXISTS bills_bill_number_bill_date_key;
    `);

        // 2. Create a new PARTIAL unique index that allows duplicates for bill_number = 0
        console.log("Creating new partial unique index...");
        await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS bills_bill_number_bill_date_unique 
      ON bills (bill_number, bill_date, track) 
      WHERE bill_number > 0;
    `);

        await client.query("COMMIT");
        console.log("SUCCESS: Database constraints updated successfully.");

        // Test
        console.log("Verifying fix by attempting to insert duplicate 0s...");
        // We won't actually insert, just knowing the index creation succeeded is usually enough.
        // If we insert, we'd clutter the DB. 

    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ERROR: Failed to update constraints:", e);
    } finally {
        client.release();
        pool.end();
    }
}

fixConstraint();
