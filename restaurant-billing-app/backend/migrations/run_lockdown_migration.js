/**
 * run_lockdown_migration.js
 * Run once to add is_locked and last_bill_number to the sessions table.
 * Usage: node migrations/run_lockdown_migration.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("../src/db");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔧 Running lockdown migration...");

    await client.query(`
      ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS last_bill_number INTEGER NOT NULL DEFAULT 0;
    `);
    console.log("✅  Columns added: is_locked, last_bill_number");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_locked
        ON sessions (shift_name, is_locked);
    `);
    console.log("✅  Index created: idx_sessions_locked");

    // Verify
    const check = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sessions'
        AND column_name IN ('is_locked', 'last_bill_number')
      ORDER BY column_name;
    `);
    console.log("📋 Current state of new columns:");
    console.table(check.rows);

    console.log("\n🎉 Migration completed successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
