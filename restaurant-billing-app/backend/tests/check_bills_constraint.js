const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkConstraints() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND conrelid = 'bills'::regclass
    `);
        res.rows.forEach(r => console.log(`${r.conname}: ${r.pg_get_constraintdef}`));
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkConstraints();
