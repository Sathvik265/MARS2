const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function getFunctionDef() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT pg_get_functiondef('move_orders_to_bill_json'::regproc);
    `);
        process.stdout.write(res.rows[0].pg_get_functiondef);
    } catch (e) {
        console.error("Error getting function def:", e);
    } finally {
        client.release();
        pool.end();
    }
}

getFunctionDef();
