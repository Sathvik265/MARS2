require("dotenv").config({ path: "./.env" });
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Dropping table-level UNIQUE constraint bills_bill_number_bill_date_track_key...");
    await client.query("BEGIN");
    await client.query("ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_bill_date_track_key CASCADE");
    
    // Ensure the partial unique index exists
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS bills_bill_number_bill_date_unique 
      ON bills(bill_number, bill_date, track) 
      WHERE bill_number > 0
    `);
    
    await client.query("COMMIT");
    console.log("Constraint dropped and partial index verified successfully!");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}
main();
