const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Connected to database:", process.env.DB_NAME);

    // 1. Drop existing constraint
    console.log(
      'Dropping constraint "bills_bill_number_bill_date_track_key"...',
    );
    await client.query(
      "ALTER TABLE bills DROP CONSTRAINT bills_bill_number_bill_date_track_key",
    );
    console.log("Constraint dropped.");

    // 2. Create partial unique index
    console.log("Creating partial unique index...");
    await client.query(`
      CREATE UNIQUE INDEX bills_bill_number_bill_date_track_key 
      ON bills (bill_number, bill_date, track) 
      WHERE bill_number > 0
    `);
    console.log("Partial unique index created successfully.");
  } catch (err) {
    if (err.code === "42704") {
      console.log("Constraint does not exist or already dropped.");
      // Try creating index anyway just in case
      try {
        await client.query(`
                CREATE UNIQUE INDEX bills_bill_number_bill_date_track_key 
                ON bills (bill_number, bill_date, track) 
                WHERE bill_number > 0
            `);
        console.log(
          "Partial unique index created successfully (after assuming constraint missing).",
        );
      } catch (idxErr) {
        console.error("Error creating index:", idxErr.message);
      }
    } else {
      console.error("Migration failed:", err);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
