const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
  try {
    console.log("Starting migrations...");

    // 1. Add allowed_clerks column
    await pool.query(`ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS allowed_clerks TEXT DEFAULT 'CLK,V,P,B'`);
    console.log("Allowed clerks column added/verified.");

    // 2. Add section column
    await pool.query(`ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'L'`);
    console.log("Section column added/verified.");

    // 3. Drop unique constraint on sessions
    await pool.query(`ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_shift_name_session_date_clerk_initials_key`);
    console.log("Unique constraint dropped/verified.");

    console.log("Migrations completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
