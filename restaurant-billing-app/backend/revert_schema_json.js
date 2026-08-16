const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function revertToJSON() {
    const client = await pool.connect();
    try {
        console.log("=== STARTING REVERT TO JSONB ===");

        // 1. Drop Index
        console.log("Dropping index...");
        await client.query("DROP INDEX IF EXISTS idx_items_category");

        // 2. Add new JSONB column
        console.log("Adding category_json...");
        await client.query("ALTER TABLE items ADD COLUMN category_json JSONB");

        // 3. Migrate Data
        // We need to convert existing VARCHAR strings to JSON objects.
        // If it's already a JSON string (unlikely given it was typed varchar), treat as name.
        console.log("Migrating data...");

        // We'll read all items and update one by one for safety or use a smart update query.
        // Query approach:
        // If category is "Dosa", new value = {"name": "Dosa", "qty": 1}
        await client.query(`
      UPDATE items 
      SET category_json = jsonb_build_object('name', category, 'qty', 1)
      WHERE category IS NOT NULL AND category != ''
    `);

        // 4. Swap columns
        console.log("Dropping old category...");
        await client.query("ALTER TABLE items DROP COLUMN category");

        console.log("Renaming new column...");
        await client.query("ALTER TABLE items RENAME COLUMN category_json TO category");

        // 5. Recreate Index (GIN for JSONB)
        console.log("Recreating GIN index...");
        await client.query("CREATE INDEX idx_items_category ON items USING GIN (category)");

        console.log("=== SUCCESS: Reverted to JSONB ===");

    } catch (e) {
        console.error("Migration Error:", e);
    } finally {
        client.release();
        pool.end();
    }
}

revertToJSON();
