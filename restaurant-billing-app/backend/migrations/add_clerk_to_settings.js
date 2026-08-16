const pool = require("../src/db");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Starting settings table migration...");
    await client.query("BEGIN");

    // 1. Add column if not exists
    await client.query(`
        ALTER TABLE settings 
        ADD COLUMN IF NOT EXISTS clerk_initials VARCHAR(50);
    `);
    console.log("Added column clerk_initials.");

    // 2. Update existing rows to have default 'CLK' if null
    await client.query(`
        UPDATE settings 
        SET clerk_initials = 'CLK' 
        WHERE clerk_initials IS NULL;
    `);
    console.log("Updated existing rows to 'CLK'.");

    // 3. Add unique constraint (dropping first to be safe)
    await client.query(`
        ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_clerk_initials_key;
    `);
    await client.query(`
        ALTER TABLE settings 
        ADD CONSTRAINT settings_clerk_initials_key UNIQUE (clerk_initials);
    `);
    console.log("Added unique constraint on clerk_initials.");

    await client.query("COMMIT");
    console.log("Migration successful");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
